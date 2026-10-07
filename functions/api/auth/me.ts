// GET /api/auth/me → 当前登录的用户，未登录时 user 为 null
import { getUser, publicUser } from '../../_lib/auth';
import { json, type Env } from '../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
	const user = await getUser(request, env);
	return json({ user: user ? publicUser(user) : null });
};
