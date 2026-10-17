import { articleExists, SLUG } from '../_lib/articles';
import { clientIp, fail, isSameOrigin, json, rateLimit, sha256, type Env } from '../_lib/http';

// 文章浏览量接口
//   GET  /api/views?slugs=a,b,c  → { a: 12, b: 3 }（文章卡片批量查询，没有记录的不返回）
//   POST /api/views?slug=a       → { count: 13 }（打开文章页时计一次；同一访客同一天只算一次）

// 北京时间的日期，例如 2026-10-07
const dayOf = (offsetDays = 0) =>
	new Date(Date.now() + 8 * 3600_000 - offsetDays * 86400_000).toISOString().slice(0, 10);

// 预览部署（<分支或编号>.personalweb-5c2.pages.dev）和正式站共用一个数据库，验收时点开文章不能算进去；
// 正式站 sutady.top 和 personalweb-5c2.pages.dev 照常计数
const PREVIEW_HOST = /\.[^.]+\.pages\.dev$/;
// 会执行页面脚本的爬虫（Googlebot、Baiduspider、无头浏览器等）。(?<!cu) 排除 Cubot 牌手机
const BOT_UA = /(?<!cu)bot|spider|crawl|slurp|headless|lighthouse|inspectiontool/i;

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
	const url = new URL(request.url);
	const slug = url.searchParams.get('slug') ?? '';
	if (!SLUG.test(slug)) return json({ error: 'bad slug' }, 400);
	// 只认本站页面发来的请求，否则别的网站放一段脚本，就能让它的每个访客都给这里的文章加一次
	if (!isSameOrigin(request)) return fail('请求来源不正确', 403);
	const ua = request.headers.get('User-Agent') ?? '';
	if (PREVIEW_HOST.test(url.hostname) || !ua || BOT_UA.test(ua)) return json({ count: await readCount(env, slug) });
	if (!(await articleExists(env, request, slug))) return json({ error: 'not found' }, 404);

	const day = dayOf();
	const ip = clientIp(request);
	const visitor = (await sha256(`${ip}|${ua}|${day}`)).slice(0, 32);
	// 防刷：同一 IP 每小时最多计入 60 次阅读（换 User-Agent 也绕不过去），超出后只返回当前数字不再加
	if (!(await rateLimit(env, `view:${await sha256(ip)}`, 60, 3600))) return json({ count: await readCount(env, slug) });

	// 去重记录、计数、读取放进同一个 batch（一次往返）：只有去重记录真的插入了，changes() 才大于 0，计数才加一
	const [, , read] = await env.DB.batch([
		env.DB.prepare('INSERT OR IGNORE INTO view_hits (slug, visitor, day) VALUES (?, ?, ?)').bind(slug, visitor, day),
		env.DB.prepare(
			'INSERT INTO views (slug, count) SELECT ?1, 1 WHERE changes() > 0 ON CONFLICT (slug) DO UPDATE SET count = count + 1',
		).bind(slug),
		env.DB.prepare('SELECT count FROM views WHERE slug = ?').bind(slug),
	]);
	const count = (read.results[0] as { count: number } | undefined)?.count ?? 0;
	// 偶尔顺手清理两天前的去重记录
	if (Math.random() < 0.05) {
		waitUntil(env.DB.prepare('DELETE FROM view_hits WHERE day < ?').bind(dayOf(2)).run());
	}
	return json({ count });
};
