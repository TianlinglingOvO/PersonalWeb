import { articleExists, SLUG } from '../_lib/articles';
import { json, sha256, type Env } from '../_lib/http';

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
	const ip = request.headers.get('CF-Connecting-IP') ?? '';
	const visitor = (await sha256(`${ip}|${request.headers.get('User-Agent') ?? ''}|${day}`)).slice(0, 32);
	const hit = await env.DB.prepare('INSERT OR IGNORE INTO view_hits (slug, visitor, day) VALUES (?, ?, ?)')
		.bind(slug, visitor, day)
		.run();

	let count: number;
	if (hit.meta.changes > 0) {
		const row = await env.DB.prepare(
			'INSERT INTO views (slug, count) VALUES (?, 1) ON CONFLICT (slug) DO UPDATE SET count = count + 1 RETURNING count',
		)
			.bind(slug)
			.first<{ count: number }>();
		count = row?.count ?? 1;
		// 顺手清理两天前的去重记录
		if (Math.random() < 0.05) {
			waitUntil(env.DB.prepare('DELETE FROM view_hits WHERE day < ?').bind(dayOf(2)).run());
		}
	} else {
		const row = await env.DB.prepare('SELECT count FROM views WHERE slug = ?').bind(slug).first<{ count: number }>();
		count = row?.count ?? 0;
	}
	return json({ count });
};
