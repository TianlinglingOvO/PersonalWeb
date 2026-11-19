import { articleExists, SLUG } from '../_lib/articles';
import { getUser } from '../_lib/auth';
import { clientIp, fail, isSameOrigin, json, rateLimit, sha256, type Env } from '../_lib/http';
import { dayOf, skipCounting, visitorOf } from '../_lib/visitors';

// 文章浏览量接口
//   GET  /api/views?slugs=a,b,c  → { a: 12, b: 3 }（文章卡片批量查询，没有记录的不返回）
//   POST /api/views?slug=a       → { count: 13, counted: true, day: '2026-11-19' }（打开文章页时计一次；同一访客同一天只算一次）
// 站长本人、*.pages.dev 部署、爬虫发来的只查询不计数（见 _lib/visitors.ts）

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
	if (!(await articleExists(env, request, slug))) return json({ error: 'not found' }, 404);

	const now = Date.now();
	const day = dayOf(0, now);
	const ip = clientIp(request);
	const [visitor, ipHash] = await Promise.all([visitorOf(request, day), sha256(ip)]);

	// 先核对站长身份和当天去重状态（未登录访客 getUser 不查库，仅一次 D1 往返）
	const [user, pre] = await Promise.all([
		getUser(request, env),
		env.DB.prepare(
			`SELECT EXISTS(SELECT 1 FROM view_hits WHERE slug = ?1 AND visitor = ?2 AND day = ?3) AS seen,
			        COALESCE((SELECT count FROM views WHERE slug = ?1), 0) AS count`,
		)
			.bind(slug, visitor, day)
			.first<{ seen: number; count: number }>(),
	]);
	const current = pre?.count ?? 0;
	if (user?.isAdmin) return json({ count: current, counted: false });
	// 当天已计过数：直接返回当前数字和服务端日期，不消耗限流配额
	if (pre?.seen) return json({ count: current, counted: false, day });

	// 双层防刷（仅对当天新阅读扣配额）：同一 IP 全站每小时最多 60 次，同篇每小时最多 5 次（防换 UA 刷单篇）
	const [ipAllowed, slugAllowed] = await Promise.all([
		rateLimit(env, `view:${ipHash}`, 60, 3600, waitUntil),
		rateLimit(env, `view-slug:${ipHash}:${slug}`, 5, 3600, waitUntil),
	]);
	// 超限时不返回 day，避免前端把当天后续补报也锁死
	if (!ipAllowed || !slugAllowed) return json({ count: current, counted: false });

	// 去重记录、计数、读取放进同一个 batch（一次往返）：只有去重记录真的插入了，changes() 才大于 0，计数才加一
	const [hit, , read] = await env.DB.batch([
		env.DB.prepare('INSERT OR IGNORE INTO view_hits (slug, visitor, day) VALUES (?, ?, ?)').bind(slug, visitor, day),
		env.DB.prepare(
			'INSERT INTO views (slug, count) SELECT ?1, 1 WHERE changes() > 0 ON CONFLICT (slug) DO UPDATE SET count = count + 1',
		).bind(slug),
		env.DB.prepare('SELECT count FROM views WHERE slug = ?').bind(slug),
	]);
	const count = (read.results[0] as { count: number } | undefined)?.count ?? 0;
	const counted = (hit.meta?.changes ?? 0) > 0;
	// 偶尔顺手清理两天前的去重记录
	if (Math.random() < 0.05) {
		waitUntil(env.DB.prepare('DELETE FROM view_hits WHERE day < ?').bind(dayOf(2, now)).run());
	}
	return json({ count, counted, day });
};
