import { articleExists, SLUG } from '../_lib/articles';
import { getUser } from '../_lib/auth';
import {
	clientIp,
	fail,
	isSameOrigin,
	json,
	maybeCleanupRateLimits,
	pairedRateLimitStatements,
	rateLimitStatement,
	sha256,
	type Env,
} from '../_lib/http';
import { dayOf, skipCounting, visitorOf } from '../_lib/visitors';

// 文章浏览量接口
//   GET  /api/views?slugs=a,b,c  → { a: 12, b: 3 }（文章卡片批量查询，没有记录的不返回）
//   POST /api/views?slug=a       → { count: 13, counted: true, day: '2026-11-19' }（打开文章页时计一次；同一访客同一天只算一次）
// 站长本人、*.pages.dev 部署、爬虫发来的只查询不计数（见 _lib/visitors.ts）

const REQ_LIMIT = 120; // 同 IP 60 秒无条件请求上限（防重复重放消耗边缘请求与 D1 读额度）
const IP_HOUR_LIMIT = 60; // 同 IP 每小时全站新阅读上限
const SLUG_HOUR_LIMIT = 15; // 同 IP 每小时单篇新阅读上限（兼容校园网/NAT，同时抑制换 UA 刷单篇）

const readCount = async (env: Env, slug: string) =>
	(await env.DB.prepare('SELECT count FROM views WHERE slug = ?').bind(slug).first<{ count: number }>())?.count ?? 0;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
	const slugs = [...new Set((new URL(request.url).searchParams.get('slugs') ?? '').split(','))]
		.filter((s) => SLUG.test(s))
		.slice(0, 100);
	if (!slugs.length) return json({});
	const { results } = await env.DB.prepare(
		`SELECT slug, count FROM views WHERE slug IN (${slugs.map(() => '?').join(',')})`,
	)
		.bind(...slugs)
		.all<{ slug: string; count: number }>();
	return json(Object.fromEntries(results.map((r) => [r.slug, r.count])));
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
	const slug = new URL(request.url).searchParams.get('slug') ?? '';
	if (!SLUG.test(slug)) return json({ error: 'bad slug' }, 400);
	// 只认本站页面发来的请求，否则别的网站放一段脚本，就能让它的每个访客都给这里的文章加一次
	if (!isSameOrigin(request)) return fail('请求来源不正确', 403);
	if (skipCounting(request)) return json({ count: await readCount(env, slug), counted: false });

	const nowMs = Date.now();
	const nowSec = Math.floor(nowMs / 1000);
	const day = dayOf(0, nowMs);
	const ip = clientIp(request);
	const [visitor, ipHash] = await Promise.all([visitorOf(request, day), sha256(ip)]);

	// 第 1 次 D1 往返：并行核对站长身份（无 Cookie 不查库）、无条件请求限流与当天去重状态
	const [user, [reqLim, preRes]] = await Promise.all([
		getUser(request, env),
		env.DB.batch([
			rateLimitStatement(env, `view-req:${ipHash}`, nowSec, 60),
			env.DB.prepare(
				`SELECT EXISTS(SELECT 1 FROM view_hits WHERE slug = ?1 AND visitor = ?2 AND day = ?3) AS seen,
				        COALESCE((SELECT count FROM views WHERE slug = ?1), 0) AS count`,
			).bind(slug, visitor, day),
		]),
	]);
	await maybeCleanupRateLimits(env, nowSec, waitUntil);

	const pre = preRes.results[0] as { seen: number; count: number } | undefined;
	const current = pre?.count ?? 0;
	if (user?.isAdmin) return json({ count: current, counted: false });

	const reqCount = (reqLim.results[0] as { count: number } | undefined)?.count ?? 1;
	if (reqCount > REQ_LIMIT) return fail('请求太频繁了，请稍后再试', 429);
	// 当天已计过数：直接返回当前数字和服务端日期，不消耗新阅读限流配额，也省去 ASSETS 子请求
	if (pre?.seen) return json({ count: current, counted: false, day });

	// 仅在尚未计过该访客时校验文章是否存在，避免对已去重请求多发一次 ASSETS 子请求
	if (!(await articleExists(env, request, slug))) return json({ error: 'not found' }, 404);

	// 第 2 次 D1 往返（单次原子 batch）：双桶互不误扣限流 + 去重记录 + 计数 + 读取
	const [, slugLim, hit, , read] = await env.DB.batch([
		...pairedRateLimitStatements(
			env,
			{ key: `view:${ipHash}`, limit: IP_HOUR_LIMIT, windowSec: 3600 },
			{ key: `view-slug:${ipHash}:${slug}`, limit: SLUG_HOUR_LIMIT, windowSec: 3600 },
			nowSec,
		),
		env.DB.prepare('INSERT OR IGNORE INTO view_hits (slug, visitor, day) SELECT ?1, ?2, ?3 WHERE changes() > 0').bind(
			slug,
			visitor,
			day,
		),
		env.DB.prepare(
			'INSERT INTO views (slug, count) SELECT ?1, 1 WHERE changes() > 0 ON CONFLICT (slug) DO UPDATE SET count = count + 1',
		).bind(slug),
		env.DB.prepare('SELECT count FROM views WHERE slug = ?').bind(slug),
	]);
	const count = (read.results[0] as { count: number } | undefined)?.count ?? 0;
	const allowed = (slugLim.meta?.changes ?? 0) > 0;
	const counted = (hit.meta?.changes ?? 0) > 0;
	// 偶尔顺手清理两天前的去重记录
	if (Math.random() < 0.05) {
		waitUntil(env.DB.prepare('DELETE FROM view_hits WHERE day < ?').bind(dayOf(2, nowMs)).run());
	}
	// 超限时不返回 day，避免前端把当天后续补报也锁死
	if (!allowed) return json({ count, counted: false });
	return json({ count, counted, day });
};
