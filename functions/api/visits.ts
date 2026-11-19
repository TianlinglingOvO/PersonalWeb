import { getUser, hasSessionCookie } from '../_lib/auth';
import {
	clientIp,
	fail,
	guardedRateLimitStatement,
	isSameOrigin,
	json,
	maybeCleanupRateLimits,
	pairedRateLimitStatements,
	sha256,
	type Env,
} from '../_lib/http';
import { dayOf, skipCounting, visitorOf } from '../_lib/visitors';

// 全站每日访问统计（只给站长看）
//   POST /api/visits → { counted }  每打开一个内容页（含站内新导航）报一次，前端是 scripts/features/visits.ts
//   GET  /api/visits → 最近 DAYS 天每天的访客数、浏览次数，以及累计浏览次数（仅站长）
// *.pages.dev 部署、爬虫、站长本人不计数；访客按 IP + UA 每天去重，不存原始 IP

const DAYS = 30;
const MIN_LIMIT = 60; // 同 IP 每分钟最多计入 60 次浏览
const HOUR_LIMIT = 240; // 同 IP 每小时最多计入 240 次浏览
const UV_HOUR_LIMIT = 30; // 同 IP 每小时最多计入 30 位新访客（超限后仍计浏览，仅不再增访客）

interface DayRow {
	day: string;
	pv: number;
	uv: number;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
	// 没带登录 Cookie 的直接拒绝，一次数据库都不查（防止被人随手刷读取额度）
	if (!hasSessionCookie(request)) return fail('请先登录', 401);
	// 固定基准时间戳，避免跨北京时间零点时 SQL 查询和补零循环出现日期错位
	const now = Date.now();
	// 带了 Cookie 的基本就是站长本人：登录校验和统计查询并行发出，省一次跨洋往返；不是站长时查到的数据直接丢掉
	const [user, [recent, total]] = await Promise.all([
		getUser(request, env),
		env.DB.batch([
			env.DB.prepare('SELECT day, pv, uv FROM daily_visits WHERE day >= ? ORDER BY day').bind(dayOf(DAYS - 1, now)),
			env.DB.prepare('SELECT COALESCE(SUM(pv), 0) AS pv, MIN(day) AS since FROM daily_visits'),
		]),
	]);
	if (!user) return fail('请先登录', 401);
	if (!user.isAdmin) return fail('只有站长能看访问统计', 403);

	// 没有人来的日子数据库里没有记录，补成 0，前端直接按顺序画
	const byDay = new Map((recent.results as DayRow[]).map((row) => [row.day, row]));
	const days = Array.from({ length: DAYS }, (_, i) => {
		const day = dayOf(DAYS - 1 - i, now);
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

	const nowMs = Date.now();
	const nowSec = Math.floor(nowMs / 1000);
	const day = dayOf(0, nowMs);
	const ip = clientIp(request);
	const [visitor, ipHash] = await Promise.all([visitorOf(request, day), sha256(ip)]);

	// 第 1 次 D1 往返：先核对站长身份（未登录访客不查库）和当天访客是否已记录
	const [user, seen] = await Promise.all([
		getUser(request, env),
		env.DB.prepare('SELECT 1 FROM visit_hits WHERE day = ? AND visitor = ?').bind(day, visitor).first(),
	]);
	if (user?.isAdmin) return json({ counted: false });

	// 第 2 次 D1 往返（单次原子 batch）：
	//   1. 分钟与小时浏览限流双桶互不误扣；放行则 PV +1；
	//   2. 仅当未记录过且 PV 放行时，校验新访客上限（超限后 PV 仍照常计入，只跳过 UV）
	const pvStatement = env.DB.prepare(
		`INSERT INTO daily_visits (day, pv, uv) SELECT ?1, 1, 0 WHERE changes() > 0
		 ON CONFLICT (day) DO UPDATE SET pv = pv + 1`,
	).bind(day);
	const batch: D1PreparedStatement[] = [
		...pairedRateLimitStatements(
			env,
			{ key: `visit-min:${ipHash}`, limit: MIN_LIMIT, windowSec: 60 },
			{ key: `visit:${ipHash}`, limit: HOUR_LIMIT, windowSec: 3600 },
			nowSec,
		),
		pvStatement,
	];
	if (!seen) {
		batch.push(
			guardedRateLimitStatement(env, { key: `visit-uv:${ipHash}`, limit: UV_HOUR_LIMIT, windowSec: 3600 }, nowSec),
			env.DB.prepare('INSERT OR IGNORE INTO visit_hits (day, visitor) SELECT ?1, ?2 WHERE changes() > 0').bind(
				day,
				visitor,
			),
			env.DB.prepare('UPDATE daily_visits SET uv = uv + 1 WHERE day = ?1 AND changes() > 0').bind(day),
		);
	}
	const results = await env.DB.batch(batch);
	await maybeCleanupRateLimits(env, nowSec, waitUntil);

	// 偶尔顺手清理两天前的去重记录
	if (Math.random() < 0.05) {
		waitUntil(env.DB.prepare('DELETE FROM visit_hits WHERE day < ?').bind(dayOf(2, nowMs)).run());
	}
	const counted = (results[2]?.meta?.changes ?? 0) > 0;
	return json({ counted });
};
