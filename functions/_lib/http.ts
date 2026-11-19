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
 * 用于限流和访客标识的客户端 IP：
 * - IPv4（含 ::ffff:a.b.c.d 映射格式）用完整 IPv4 地址；
 * - IPv6 统一归一化为前 64 位小写无前导零格式（一个家庭 / 一台设备通常分到一整段 /64，
 *   可以随意换后缀地址，按完整地址限流会被轻易绕过）。
 * CF-Connecting-IP 由 Cloudflare 填写，访客无法伪造
 */
export function clientIp(request: Request) {
	const ip = (request.headers.get('CF-Connecting-IP') ?? '').trim().toLowerCase();
	const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (mapped) return mapped[1];
	if (!ip.includes(':') || ip.includes('.')) return ip;
	const parts = ip.split('::');
	if (parts.length > 2) return ip;
	const [head, tail = ''] = parts;
	const left = head ? head.split(':') : [];
	const right = tail ? tail.split(':') : [];
	let full: string[];
	if (ip.includes('::')) {
		const missing = 8 - left.length - right.length;
		if (missing < 0) return ip;
		full = [...left, ...Array(missing).fill('0'), ...right];
	} else {
		full = left;
	}
	if (full.length < 4) return ip;
	const prefix = full
		.slice(0, 4)
		.map((part) => (/^[0-9a-f]{1,4}$/.test(part) ? parseInt(part, 16).toString(16) : part));
	return `${prefix.join(':')}::/64`;
}

/** 把路径参数或请求体里的编号转成正整数，不合法时返回 null */
export const toId = (value: unknown) => {
	const n = typeof value === 'number' ? value : /^\d{1,15}$/.test(String(value ?? '')) ? Number(value) : NaN;
	return Number.isSafeInteger(n) && n > 0 ? n : null;
};

// 写操作只接受本站页面发来的请求（配合 SameSite Cookie 防 CSRF；没有 Origin / Referer 的脚本请求一律拒绝）
export function isSameOrigin(request: Request) {
	const fetchSite = request.headers.get('Sec-Fetch-Site');
	if (fetchSite && fetchSite !== 'same-origin') return false;
	const expected = new URL(request.url).origin;
	const origin = request.headers.get('Origin');
	if (origin) return origin === expected;
	const referer = request.headers.get('Referer');
	if (!referer) return false;
	try {
		return new URL(referer).origin === expected;
	} catch {
		return false;
	}
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
export async function rateLimit(
	env: Env,
	key: string,
	limit: number,
	windowSec: number,
	waitUntil?: (promise: Promise<unknown>) => void,
) {
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
		const cleanup = env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - 86400).run();
		if (waitUntil) waitUntil(cleanup);
		else await cleanup;
	}
	return (row?.count ?? 1) <= limit;
}
