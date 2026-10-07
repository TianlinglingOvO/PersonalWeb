// /api/comments/:id
//   PATCH  { content } → 编辑评论（只能本人），返回最新列表
//   DELETE             → 删除评论（本人或站长），返回最新列表
//     顶层评论下还有回复时只标记为“已删除”，保留回复；否则直接删掉（连同它的回复）
import { getUser } from '../../_lib/auth';
import { buildList, cleanContent, listStatement, MAX_LENGTH } from '../../_lib/comments';
import { fail, isSameOrigin, json, rateLimit, readJson, type Env } from '../../_lib/http';

export const onRequestPatch: PagesFunction<Env, 'id'> = async ({ request, env, params }) => {
	if (!isSameOrigin(request)) return fail('请求来源不正确', 403);
	const id = Number(params.id);
	const [user, body, comment] = await Promise.all([
		getUser(request, env),
		readJson<{ content: string }>(request),
		env.DB.prepare('SELECT user_id, slug FROM comments WHERE id = ? AND deleted = 0')
			.bind(id)
			.first<{ user_id: number; slug: string }>(),
	]);
	if (!user) return fail('请先登录', 401);
	if (!comment) return fail('评论不存在', 404);
	if (comment.user_id !== user.id) return fail('只能编辑自己的评论', 403);

	const content = cleanContent(body.content);
	if (!content) return fail('评论内容不能为空');
	if (content.length > MAX_LENGTH) return fail(`评论最多 ${MAX_LENGTH} 字`);
	if (!(await rateLimit(env, `edit:${user.id}`, 10, 60))) return fail('改得太频繁啦，休息一分钟再试吧', 429);

	const [, list] = await env.DB.batch([
		env.DB.prepare('UPDATE comments SET content = ?, edited_at = ? WHERE id = ?').bind(
			content,
			Math.floor(Date.now() / 1000),
			id,
		),
		listStatement(env, comment.slug),
	]);
	return json({ ok: true, ...buildList(list.results, user) });
};

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
