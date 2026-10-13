// POST /api/auth/password  { password } → 修改密码（需登录）
//   免费版每次请求只有约 10ms CPU，一次 PBKDF2 就要约 4.5ms，所以“校验旧密码 + 设置新密码”拆成两个请求：
//   1. 前端先用当前密码调用 /api/auth/login：校验当前密码，同时换一个新会话；
//   2. 再调用本接口设置新密码：只接受 2 分钟内新建的会话，改完让这个账号在其他设备上的登录全部失效（保留当前这个）。
import { checkPassword, getSession, hashPassword, isFreshSession } from '../../_lib/auth';
import { fail, isSameOrigin, json, rateLimit, readJson, type Env } from '../../_lib/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
	if (!isSameOrigin(request)) return fail('请求来源不正确', 403);
	const [session, body] = await Promise.all([getSession(request, env), readJson<{ password: string }>(request)]);
	if (!session) return fail('请先登录', 401);
	if (!isFreshSession(session)) return fail('请先输入当前密码确认身份', 403);
	const passwordError = checkPassword(body.password);
	if (passwordError) return fail(passwordError);
	if (!(await rateLimit(env, `password:${session.user.id}`, 5, 600))) return fail('改得太频繁了，请 10 分钟后再试', 429);

	await env.DB.batch([
		env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(
			await hashPassword(String(body.password)),
			session.user.id,
		),
		env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(session.user.id, session.tokenHash),
	]);
	return json({ ok: true });
};
