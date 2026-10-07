// DELETE /api/comments/:id → 删除评论（本人或站长），返回最新列表
//   顶层评论下还有回复时只标记为“已删除”，保留回复；否则直接删掉（连同它的回复）
import { getUser } from '../../_lib/auth';
import { buildList, listStatement } from '../../_lib/comments';
import { fail, isSameOrigin, json, type Env } from '../../_lib/http';

export const onRequestDelete: PagesFunction<Env, 'id'> = async ({ request, env, params }) => {
	if (!isSameOrigin(request)) return fail('请求来源不正确', 403);
	const id = Number(params.id);
	const [user, comment] = await Promise.all([
		getUser(request, env),
		env.DB.prepare(
			`SELECT c.user_id, c.parent_id, c.slug,
			        EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = c.id AND r.deleted = 0) AS has_replies
			 FROM comments c WHERE c.id = ? AND c.deleted = 0`,
		)
			.bind(id)
			.first<{ user_id: number; parent_id: number | null; slug: string; has_replies: number }>(),
	]);
	if (!user) return fail('请先登录', 401);
	if (!comment) return fail('评论不存在', 404);
	if (!user.isAdmin && comment.user_id !== user.id) return fail('只能删除自己的评论', 403);

	const [, list] = await env.DB.batch([
		comment.parent_id === null && comment.has_replies
			? env.DB.prepare("UPDATE comments SET deleted = 1, content = '' WHERE id = ?").bind(id)
			: env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id),
		listStatement(env, comment.slug),
	]);
	return json({ ok: true, ...buildList(list.results, user) });
};
