// POST /api/auth/register  { username, password } → 注册并直接登录
import { checkPassword, checkUsername, createSession, hashPassword } from '../../_lib/auth';
import { clientIp, fail, isSameOrigin, json, rateLimit, readJson, sha256, type Env } from '../../_lib/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
	if (!isSameOrigin(request)) return fail('请求来源不正确', 403);
	const body = await readJson<{ username: string; password: string }>(request);

	const username = checkUsername(body.username);
	if ('error' in username) return fail(username.error);
	const passwordError = checkPassword(body.password);
	if (passwordError) return fail(passwordError);

	if (!(await rateLimit(env, `reg:${await sha256(clientIp(request))}`, 5, 3600))) {
		return fail('注册太频繁了，请过一会儿再试', 429);
	}

	const exists = await env.DB.prepare('SELECT 1 FROM users WHERE username_key = ?').bind(username.key).first();
	if (exists) return fail('用户名已存在', 409);

	let id: number;
	try {
		const row = await env.DB.prepare(
			'INSERT INTO users (username, username_key, password_hash, created_at) VALUES (?, ?, ?, ?) RETURNING id',
		)
			.bind(username.name, username.key, await hashPassword(String(body.password)), Math.floor(Date.now() / 1000))
			.first<{ id: number }>();
		id = row!.id;
	} catch (e) {
		// 两个人同时注册同一个名字时，由唯一约束兜底
		if (String(e).includes('UNIQUE')) return fail('用户名已存在', 409);
		throw e;
	}

	const cookie = await createSession(env, id);
	return json({ user: { username: username.name, isAdmin: false } }, 201, { 'Set-Cookie': cookie });
};
