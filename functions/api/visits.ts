import { getUser, hasSessionCookie } from '../_lib/auth';
import { clientIp, fail, isSameOrigin, json, rateLimit, sha256, type Env } from '../_lib/http';
import { dayOf, skipCounting, visitorOf } from '../_lib/visitors';

// 全站访问统计（只给站长看）
//   POST /api/visits → { counted }  每打开一个页面（含站内换页）报一次，前端是 scripts/features/visits.ts
//   GET  /api/visits → 最近 DAYS 天每天的访客数、浏览次数，以及累计浏览次数（仅站长）
// 预览部署、爬虫、站长本人不计数；访客按 IP + UA 每天去重，不存原始 IP

const DAYS = 30;

interface DayRow {
	day: string;
	pv: number;
	uv: number;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
	// 没带登录 Cookie 的直接拒绝，一次数据库都不查（防止被人随手刷读取额度）
	if (!hasSessionCookie(request)) return fail('请先登录', 401);
	// 带了 Cookie 的基本就是站长本人：登录校验和统计查询并行发出，省一次跨洋往返；不是站长时查到的数据直接丢掉
	const [user, [recent, total]] = await Promise.all([
		getUser(request, env),
		env.DB.batch([
			env.DB.prepare('SELECT day, pv, uv FROM daily_visits WHERE day >= ? ORDER BY day').bind(dayOf(DAYS - 1)),
			env.DB.prepare('SELECT COALESCE(SUM(pv), 0) AS pv, MIN(day) AS since FROM daily_visits'),
		]),
	]);
	if (!user) return fail('请先登录', 401);
	if (!user.isAdmin) return fail('只有站长能看访问统计', 403);

	// 没有人来的日子数据库里没有记录，补成 0，前端直接按顺序画
	const byDay = new Map((recent.results as DayRow[]).map((row) => [row.day, row]));
	const days = Array.from({ length: DAYS }, (_, i) => {
		const day = dayOf(DAYS - 1 - i);
		const row = byDay.get(day);
		return { day, pv: row?.pv ?? 0, uv: row?.uv ?? 0 };
	});
	const sum = total.results[0] as { pv: number; since: string | null } | undefined;
	return json({ days, total: sum?.pv ?? 0, since: sum?.since ?? null });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
	// 只认本站页面发来的请求，否则别的网站放一段脚本，就能把它的访客都算到这里
	if (!isSameOrigin(request)) return fail('请求来源不正确', 403);
	if (skipCounting(request)) return json({ counted: false });

	// 站长本人不算（前端已经不报了，这里兜底：比如刚换了浏览器、本地还没记住登录状态）。
	// 先判断站长再限流，站长的请求不占限流额度、也不多写一次库；没登录的访客没有 Cookie，getUser 不查库，不会多一次往返
	if ((await getUser(request, env))?.isAdmin) return json({ counted: false });
	// 防刷：同一 IP 每小时最多计入 120 次浏览
	if (!(await rateLimit(env, `visit:${await sha256(clientIp(request))}`, 120, 3600))) return json({ counted: false });

	// 去重记录和当天计数放进同一个 batch（一次往返）：去重记录真的插入了（今天第一次来），changes() 才是 1，访客数才加一
	const day = dayOf();
	await env.DB.batch([
		env.DB.prepare('INSERT OR IGNORE INTO visit_hits (day, visitor) VALUES (?, ?)').bind(day, await visitorOf(request, day)),
		env.DB.prepare(
			`INSERT INTO daily_visits (day, pv, uv) VALUES (?1, 1, changes())
			 ON CONFLICT (day) DO UPDATE SET pv = pv + 1, uv = uv + changes()`,
		).bind(day),
	]);
	// 偶尔顺手清理两天前的去重记录
	if (Math.random() < 0.05) {
		waitUntil(env.DB.prepare('DELETE FROM visit_hits WHERE day < ?').bind(dayOf(2)).run());
	}
	return json({ counted: true });
};
