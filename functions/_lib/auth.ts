// 账号相关：用户名规则、密码哈希、登录 Cookie
import { sha256, type Env } from './http';

export interface User {
	id: number;
	username: string;
	isAdmin: boolean;
}

// 免费版每次请求只有约 10ms CPU，本地实测 PBKDF2 十万次约 9ms，取五万次留出余量。
// 迭代次数写进哈希字符串里，以后调高也不影响旧密码验证
const ITERATIONS = 50_000;
const SESSION_DAYS = 30;
// __Host- 前缀：浏览器只接受本域名、HTTPS、Path=/ 设置的这个 Cookie，子域名无法伪造或覆盖登录状态
const COOKIE = '__Host-sid';
const RESERVED = new Set(['站长', '管理员', '管理', 'admin', 'administrator', 'root', 'system', '系统', '官方', '已注销用户']);
/** 注销后的账号显示名 */
export const CLOSED_NAME = '已注销用户';

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
	return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(await pbkdf2(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string) {
	const [scheme, iter, salt, hash] = stored.split('$');
	if (scheme !== 'pbkdf2' || !iter || !salt || !hash) return false;
	const actual = await pbkdf2(password, fromB64(salt), Number(iter));
	const expected = fromB64(hash);
	if (actual.length !== expected.length) return false;
	let diff = 0;
	for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
	return diff === 0;
}

/** 用户名：全角转半角、去掉首尾空格；2–16 个字符，只允许中文、字母、数字和下划线 */
export function checkUsername(raw: unknown): { name: string; key: string } | { error: string } {
	const name = String(raw ?? '').normalize('NFKC').trim();
	if (!/^[\p{L}\p{N}_]{2,16}$/u.test(name)) {
		return { error: '用户名需为 2–16 个字符，只能包含中文、字母、数字和下划线' };
	}
	const key = name.toLowerCase();
	if (RESERVED.has(key)) return { error: '这个用户名不能使用，换一个吧' };
	return { name, key };
}

export function checkPassword(raw: unknown): string | null {
	const password = String(raw ?? '');
	if (password.length < 6 || password.length > 64) return '密码长度需为 6–64 位';
	return null;
}

const cookieOf = (request: Request) =>
	Object.fromEntries(
		(request.headers.get('Cookie') ?? '')
			.split(';')
			.map((part) => part.trim().split('='))
			.filter((pair) => pair.length === 2),
	)[COOKIE] as string | undefined;

/** 生成一个新的登录 token：数据库只存它的哈希，浏览器拿到 Cookie */
export async function newSession() {
	const token = toB64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
	const maxAge = SESSION_DAYS * 86400;
	return {
		tokenHash: await sha256(token),
		expiresAt: Math.floor(Date.now() / 1000) + maxAge,
		cookie: `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
	};
}

/** 新建登录状态并写入数据库，返回要写给浏览器的 Set-Cookie */
export async function createSession(env: Env, userId: number) {
	const session = await newSession();
	await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
		.bind(session.tokenHash, userId, session.expiresAt)
		.run();
	return session.cookie;
}

export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function getUser(request: Request, env: Env): Promise<User | null> {
	const token = cookieOf(request);
	if (!token) return null;
	const row = await env.DB.prepare(
		`SELECT u.id, u.username, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id
		 WHERE s.token_hash = ? AND s.expires_at > ?`,
	)
		.bind(await sha256(token), Math.floor(Date.now() / 1000))
		.first<{ id: number; username: string; is_admin: number }>();
	return row ? { id: row.id, username: row.username, isAdmin: row.is_admin === 1 } : null;
}

export async function deleteSession(request: Request, env: Env) {
	const token = cookieOf(request);
	if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
}

export const publicUser = (user: User) => ({ username: user.username, isAdmin: user.isAdmin });
