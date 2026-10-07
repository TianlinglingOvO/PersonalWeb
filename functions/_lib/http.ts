// Pages Functions 共用的小工具。目录以下划线开头且不导出 onRequest，不会变成接口路由

export interface Env {
	DB: D1Database;
	ASSETS: Fetcher;
}

export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
	Response.json(data, {
		status,
		headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
	});

export const fail = (message: string, status = 400) => json({ error: message }, status);

export async function sha256(text: string) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 用于限流的客户端标识：IPv4 用完整地址；IPv6 只取前 64 位（一个家庭 / 一台设备通常分到一整段 /64，
 * 可以随意换地址，按完整地址限流会被轻易绕过）。CF-Connecting-IP 由 Cloudflare 填写，访客无法伪造
 */
export function clientIp(request: Request) {
	const ip = request.headers.get('CF-Connecting-IP') ?? '';
	if (!ip.includes(':') || ip.includes('.')) return ip;
	const [head, tail = ''] = ip.split('::');
	const left = head ? head.split(':') : [];
	const right = tail ? tail.split(':') : [];
	const full = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
	return `${full.slice(0, 4).join(':')}::/64`;
}

/** 把路径参数或请求体里的编号转成正整数，不合法时返回 null */
export const toId = (value: unknown) => {
	const n = typeof value === 'number' ? value : /^\d{1,15}$/.test(String(value ?? '')) ? Number(value) : NaN;
	return Number.isSafeInteger(n) && n > 0 ? n : null;
};

// 写操作只接受本站页面发来的请求（配合 SameSite Cookie 防 CSRF）
export function isSameOrigin(request: Request) {
	const origin = request.headers.get('Origin');
	return !origin || origin === new URL(request.url).origin;
}

const MAX_BODY = 16 * 1024; // 所有接口的请求体都很小，超过 16KB 直接当空请求处理，防止被塞超大数据

export async function readJson<T>(request: Request): Promise<Partial<T>> {
	if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY || !request.body) return {};
	// 边读边数，超过上限立刻停止（不依赖对方自报的 Content-Length）
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > MAX_BODY) {
			await reader.cancel();
			return {};
		}
		chunks.push(value);
	}
	try {
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		const data = JSON.parse(new TextDecoder().decode(bytes));
		return data && typeof data === 'object' && !Array.isArray(data) ? (data as Partial<T>) : {};
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
	// 偶尔顺手清理一天前的限流记录，避免被大量不同 IP 刷出很多行
	if (Math.random() < 0.01) {
		await env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - 86400).run();
	}
	return (row?.count ?? 1) <= limit;
}
