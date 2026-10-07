// POST /api/auth/delete  { password } → 注销自己的账号（需再次输入密码；站长账号不能在网页上注销）
//   - 自己的评论全部删除；顶层评论下如果有别人的回复，只标记为“已删除”，保留别人的回复
//   - 账号行保留但匿名化（显示“已注销用户”、无法登录），用户名释放出来可以被重新注册
import { clearCookie, CLOSED_NAME, getUser, verifyPassword } from '../../_lib/auth';
import { fail, isSameOrigin, json, rateLimit, readJson, type Env } from '../../_lib/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
	if (!isSameOrigin(request)) return fail('请求来源不正确', 403);
	const [user, body] = await Promise.all([getUser(request, env), readJson<{ password: string }>(request)]);
	if (!user) return fail('请先登录', 401);
	if (user.isAdmin) return fail('站长账号不能在网页上注销', 403);
	if (!(await rateLimit(env, `delete:${user.id}`, 5, 600))) return fail('尝试次数太多，请 10 分钟后再试', 429);

	const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
		.bind(user.id)
		.first<{ password_hash: string }>();
	if (!row || !(await verifyPassword(String(body.password ?? ''), row.password_hash))) {
		return fail('密码不正确', 401);
	}

	await env.DB.batch([
		env.DB.prepare(
			`UPDATE comments SET deleted = 1, content = ''
			 WHERE user_id = ?1 AND parent_id IS NULL AND EXISTS (
				SELECT 1 FROM comments r WHERE r.parent_id = comments.id AND r.deleted = 0 AND r.user_id != ?1
			 )`,
		).bind(user.id),
		env.DB.prepare('DELETE FROM comments WHERE user_id = ? AND deleted = 0').bind(user.id),
		env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
		env.DB.prepare(
			"UPDATE users SET username = ?, username_key = 'closed:' || id, password_hash = '!', is_admin = 0 WHERE id = ?",
		).bind(CLOSED_NAME, user.id),
	]);
	return json({ ok: true }, 200, { 'Set-Cookie': clearCookie });
};
