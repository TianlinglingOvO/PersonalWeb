// POST /api/auth/login  { username, password } → 登录
import { checkUsername, createSession, publicUser, verifyPassword } from '../../_lib/auth';
import { clientIp, fail, isSameOrigin, json, rateLimit, readJson, sha256, type Env } from '../../_lib/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
	if (!isSameOrigin(request)) return fail('请求来源不正确', 403);
	const body = await readJson<{ username: string; password: string }>(request);

	if (!(await rateLimit(env, `login:${await sha256(clientIp(request))}`, 10, 600))) {
		return fail('尝试次数太多，请 10 分钟后再试', 429);
	}

	const username = checkUsername(body.username);
	const row =
		'key' in username
			? await env.DB.prepare('SELECT id, username, password_hash, is_admin FROM users WHERE username_key = ?')
					.bind(username.key)
					.first<{ id: number; username: string; password_hash: string; is_admin: number }>()
			: null;
	if (!row || !(await verifyPassword(String(body.password ?? ''), row.password_hash))) {
		return fail('用户名或密码错误', 401);
	}

	const cookie = await createSession(env, row.id);
	// 顺手清理过期的登录状态和限流记录
	if (Math.random() < 0.1) {
		const now = Math.floor(Date.now() / 1000);
		waitUntil(
			env.DB.batch([
				env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
				env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - 86400),
			]),
		);
	}
	return json({ user: publicUser({ id: row.id, username: row.username, isAdmin: row.is_admin === 1 }) }, 200, {
		'Set-Cookie': cookie,
	});
};
