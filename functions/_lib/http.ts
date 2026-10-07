// Pages Functions 共用的小工具。目录以下划线开头且不导出 onRequest，不会变成接口路由

export interface Env {
	DB: D1Database;
	ASSETS: Fetcher;
}

export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
	Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export const fail = (message: string, status = 400) => json({ error: message }, status);

export async function sha256(text: string) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const clientIp = (request: Request) => request.headers.get('CF-Connecting-IP') ?? '';

// 写操作只接受本站页面发来的请求（配合 SameSite Cookie 防 CSRF）
export function isSameOrigin(request: Request) {
	const origin = request.headers.get('Origin');
	return !origin || origin === new URL(request.url).origin;
}

export async function readJson<T>(request: Request): Promise<Partial<T>> {
	try {
		const data = await request.json();
		return data && typeof data === 'object' ? (data as Partial<T>) : {};
	} catch {
		return {};
	}
}

/** 固定窗口限流：windowSec 秒内超过 limit 次返回 false */
export async function rateLimit(env: Env, key: string, limit: number, windowSec: number) {
	const now = Math.floor(Date.now() / 1000);
	const row = await env.DB.prepare(
		`INSERT INTO rate_limits (key, count, window_start) VALUES (?1, 1, ?2)
		 ON CONFLICT (key) DO UPDATE SET
			count = CASE WHEN window_start <= ?3 THEN 1 ELSE count + 1 END,
			window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END
		 RETURNING count`,
	)
		.bind(key, now, now - windowSec)
		.first<{ count: number }>();
	return (row?.count ?? 1) <= limit;
}
