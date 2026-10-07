// DELETE /api/comments/:id → 删除评论（本人或站长）
//   顶层评论下还有回复时只标记为“已删除”，保留回复；否则直接删掉（连同它的回复）
import { getUser } from '../../_lib/auth';
import { fail, isSameOrigin, json, type Env } from '../../_lib/http';

export const onRequestDelete: PagesFunction<Env, 'id'> = async ({ request, env, params }) => {
	if (!isSameOrigin(request)) return fail('请求来源不正确', 403);
	const user = await getUser(request, env);
	if (!user) return fail('请先登录', 401);

	const id = Number(params.id);
	const comment = await env.DB.prepare('SELECT id, user_id, parent_id FROM comments WHERE id = ? AND deleted = 0')
		.bind(id)
		.first<{ id: number; user_id: number; parent_id: number | null }>();
	if (!comment) return fail('评论不存在', 404);
	if (!user.isAdmin && comment.user_id !== user.id) return fail('只能删除自己的评论', 403);

	const hasReplies =
		comment.parent_id === null &&
		(await env.DB.prepare('SELECT 1 FROM comments WHERE parent_id = ? AND deleted = 0 LIMIT 1').bind(id).first());
	if (hasReplies) {
		await env.DB.prepare("UPDATE comments SET deleted = 1, content = '' WHERE id = ?").bind(id).run();
	} else {
		await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
	}
	return json({ ok: true });
};
