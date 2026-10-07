// POST /api/auth/logout → 退出登录
import { clearCookie, deleteSession } from '../../_lib/auth';
import { fail, isSameOrigin, json, type Env } from '../../_lib/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
	if (!isSameOrigin(request)) return fail('请求来源不正确', 403);
	await deleteSession(request, env);
	return json({ ok: true }, 200, { 'Set-Cookie': clearCookie });
};
