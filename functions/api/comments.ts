// 文章评论
//   GET  /api/comments?slug=a  → { count, comments: [{ ...评论, replies: [...] }] }（所有人可看）
//   POST /api/comments          { slug, content, replyTo? } → 发表评论，返回新评论 id 和最新列表；replyTo 是被回复的评论 id（需登录）
import { articleExists, SLUG } from '../_lib/articles';
import { getUser } from '../_lib/auth';
import { buildList, cleanContent, listStatement, MAX_LENGTH } from '../_lib/comments';
import { fail, isSameOrigin, json, rateLimit, readJson, type Env } from '../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
	const slug = new URL(request.url).searchParams.get('slug') ?? '';
	if (!SLUG.test(slug)) return fail('文章不存在', 404);
	const [viewer, { results }] = await Promise.all([getUser(request, env), listStatement(env, slug).all()]);
	return json(buildList(results, viewer));
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
	if (!isSameOrigin(request)) return fail('请求来源不正确', 403);
	const [user, body] = await Promise.all([
		getUser(request, env),
		readJson<{ slug: string; content: string; replyTo: number }>(request),
	]);
	if (!user) return fail('请先登录', 401);

	const slug = String(body.slug ?? '');
	const content = cleanContent(body.content);
	if (!content) return fail('评论内容不能为空');
	if (content.length > MAX_LENGTH) return fail(`评论最多 ${MAX_LENGTH} 字`);

	// 互不依赖的检查并行做，少几次往返
	const [exists, allowed, target] = await Promise.all([
		articleExists(env, request, slug),
		rateLimit(env, `comment:${user.id}`, 5, 60),
		body.replyTo != null
			? env.DB.prepare('SELECT id, parent_id, user_id, deleted FROM comments WHERE id = ? AND slug = ?')
					.bind(Number(body.replyTo), slug)
					.first<{ id: number; parent_id: number | null; user_id: number; deleted: number }>()
			: null,
	]);
	if (!exists) return fail('文章不存在', 404);
	if (!allowed) return fail('评论太快啦，休息一分钟再发吧', 429);

	// 回复：挂到被回复评论所在的顶层评论下面；回复的是楼中楼里的某条时，记下“回复 @谁”
	let parentId: number | null = null;
	let replyToUserId: number | null = null;
	if (body.replyTo != null) {
		if (!target || target.deleted) return fail('要回复的评论已经不存在了', 404);
		parentId = target.parent_id ?? target.id;
		if (target.parent_id !== null) replyToUserId = target.user_id;
	}

	const [inserted, list] = await env.DB.batch([
		env.DB.prepare(
			`INSERT INTO comments (slug, user_id, parent_id, reply_to_user_id, content, created_at)
			 VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
		).bind(slug, user.id, parentId, replyToUserId, content, Math.floor(Date.now() / 1000)),
		listStatement(env, slug),
	]);
	const id = (inserted.results[0] as { id: number }).id;
	return json({ id, ...buildList(list.results, user) }, 201);
};
