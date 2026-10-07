import { articleExists, SLUG } from '../_lib/articles';
import { clientIp, json, rateLimit, sha256, type Env } from '../_lib/http';

// 文章浏览量接口
//   GET  /api/views?slugs=a,b,c  → { a: 12, b: 3 }（文章卡片批量查询，没有记录的不返回）
//   POST /api/views?slug=a       → { count: 13 }（打开文章页时计一次；同一访客同一天只算一次）

// 北京时间的日期，例如 2026-10-07
const dayOf = (offsetDays = 0) =>
	new Date(Date.now() + 8 * 3600_000 - offsetDays * 86400_000).toISOString().slice(0, 10);

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
	if (!(await articleExists(env, request, slug))) return json({ error: 'not found' }, 404);

	const day = dayOf();
	const ip = clientIp(request);
	const visitor = (await sha256(`${ip}|${request.headers.get('User-Agent') ?? ''}|${day}`)).slice(0, 32);
	// 防刷：同一 IP 每小时最多计入 60 次阅读（换 User-Agent 也绕不过去），超出后只返回当前数字不再加
	if (!(await rateLimit(env, `view:${await sha256(ip)}`, 60, 3600))) {
		const row = await env.DB.prepare('SELECT count FROM views WHERE slug = ?').bind(slug).first<{ count: number }>();
		return json({ count: row?.count ?? 0 });
	}

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
