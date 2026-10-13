// GET /api/replies → 别人回复我的最近 10 条（需登录），用于顶栏小红点和账号页的“回复我的”
//   “回复我”指：回复了我的顶层评论（没有 @ 别人），或在楼中楼里 @ 我；自己回复自己、已删除的不算。
//   “已读到哪”存在浏览器的 localStorage 里（按用户名区分），这里只负责查最近的回复，不改表
import { getUser } from '../_lib/auth';
import { fail, json, type Env } from '../_lib/http';

const LIMIT = 10;
const SNIPPET = 80; // 内容只返回前 80 个字，够在列表里预览

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
	const user = await getUser(request, env);
	if (!user) return fail('请先登录', 401);
	const { results } = await env.DB.prepare(
		`SELECT c.id, c.slug, c.content, c.created_at, u.username, u.is_admin
		 FROM comments c
		 JOIN users u ON u.id = c.user_id
		 LEFT JOIN comments p ON p.id = c.parent_id
		 WHERE c.deleted = 0 AND c.user_id != ?1
		   AND (c.reply_to_user_id = ?1 OR (c.reply_to_user_id IS NULL AND p.user_id = ?1))
		 ORDER BY c.created_at DESC, c.id DESC
		 LIMIT ${LIMIT}`,
	)
		.bind(user.id)
		.all<{ id: number; slug: string; content: string; created_at: number; username: string; is_admin: number }>();
	return json({
		items: results.map((r) => ({
			id: r.id,
			slug: r.slug,
			from: { username: r.username, isAdmin: r.is_admin === 1 },
			content: Array.from(r.content).slice(0, SNIPPET).join(''),
			createdAt: r.created_at,
		})),
	});
};
