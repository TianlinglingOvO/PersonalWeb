// 文章评论
//   GET  /api/comments?slug=a  → { count, comments: [{ ...评论, replies: [...] }] }（所有人可看）
//   POST /api/comments          { slug, content, replyTo? } → 发表评论；replyTo 是被回复的评论 id（需登录）
import { articleExists, SLUG } from '../_lib/articles';
import { getUser, type User } from '../_lib/auth';
import { fail, isSameOrigin, json, rateLimit, readJson, type Env } from '../_lib/http';

const MAX_LENGTH = 1000;

interface Row {
	id: number;
	parent_id: number | null;
	user_id: number;
	username: string;
	is_admin: number;
	reply_to_name: string | null;
	content: string;
	created_at: number;
	deleted: number;
}

const toComment = (row: Row, viewer: User | null) => ({
	id: row.id,
	user: row.deleted ? null : { username: row.username, isAdmin: row.is_admin === 1 },
	replyTo: row.reply_to_name,
	content: row.deleted ? '' : row.content,
	createdAt: row.created_at,
	deleted: row.deleted === 1,
	canDelete: !row.deleted && !!viewer && (viewer.isAdmin || viewer.id === row.user_id),
});

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
	const slug = new URL(request.url).searchParams.get('slug') ?? '';
	if (!SLUG.test(slug)) return fail('文章不存在', 404);

	const [viewer, { results }] = await Promise.all([
		getUser(request, env),
		env.DB.prepare(
			`SELECT c.id, c.parent_id, c.user_id, u.username, u.is_admin, r.username AS reply_to_name,
			        c.content, c.created_at, c.deleted
			 FROM comments c
			 JOIN users u ON u.id = c.user_id
			 LEFT JOIN users r ON r.id = c.reply_to_user_id
			 WHERE c.slug = ?
			 ORDER BY c.created_at, c.id`,
		)
			.bind(slug)
			.all<Row>(),
	]);

	// 顶层评论新的在前；楼中楼回复按时间正序
	const tops = results.filter((r) => r.parent_id === null).reverse();
	const comments = tops
		.map((top) => ({
			...toComment(top, viewer),
			replies: results.filter((r) => r.parent_id === top.id && !r.deleted).map((r) => toComment(r, viewer)),
		}))
		.filter((c) => !c.deleted || c.replies.length > 0);
	const count = comments.reduce((n, c) => n + (c.deleted ? 0 : 1) + c.replies.length, 0);
	return json({ count, comments });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
	if (!isSameOrigin(request)) return fail('请求来源不正确', 403);
	const user = await getUser(request, env);
	if (!user) return fail('请先登录', 401);

	const body = await readJson<{ slug: string; content: string; replyTo: number }>(request);
	const slug = String(body.slug ?? '');
	const content = String(body.content ?? '')
		.replace(/\r\n?/g, '\n')
		.replace(/\n{4,}/g, '\n\n\n')
		.trim();
	if (!content) return fail('评论内容不能为空');
	if (content.length > MAX_LENGTH) return fail(`评论最多 ${MAX_LENGTH} 字`);
	if (!(await articleExists(env, request, slug))) return fail('文章不存在', 404);
	if (!(await rateLimit(env, `comment:${user.id}`, 5, 60))) return fail('评论太快啦，休息一分钟再发吧', 429);

	// 回复：挂到被回复评论所在的顶层评论下面；回复的是楼中楼里的某条时，记下“回复 @谁”
	let parentId: number | null = null;
	let replyToUserId: number | null = null;
	if (body.replyTo != null) {
		const target = await env.DB.prepare('SELECT id, parent_id, user_id, deleted FROM comments WHERE id = ? AND slug = ?')
			.bind(Number(body.replyTo), slug)
			.first<{ id: number; parent_id: number | null; user_id: number; deleted: number }>();
		if (!target || target.deleted) return fail('要回复的评论已经不存在了', 404);
		parentId = target.parent_id ?? target.id;
		if (target.parent_id !== null) replyToUserId = target.user_id;
	}

	const row = await env.DB.prepare(
		`INSERT INTO comments (slug, user_id, parent_id, reply_to_user_id, content, created_at)
		 VALUES (?, ?, ?, ?, ?, ?) RETURNING id, created_at`,
	)
		.bind(slug, user.id, parentId, replyToUserId, content, Math.floor(Date.now() / 1000))
		.first<{ id: number; created_at: number }>();
	return json({ id: row!.id, parentId }, 201);
};
