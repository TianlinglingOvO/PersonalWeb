// 评论列表的查询与整理，GET / POST / DELETE 共用：写操作和查询放进同一个 batch，一次往返就能拿到最新列表
import type { User } from './auth';
import type { Env } from './http';

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

export const listStatement = (env: Env, slug: string) =>
	env.DB.prepare(
		`SELECT c.id, c.parent_id, c.user_id, u.username, u.is_admin, r.username AS reply_to_name,
		        c.content, c.created_at, c.deleted
		 FROM comments c
		 JOIN users u ON u.id = c.user_id
		 LEFT JOIN users r ON r.id = c.reply_to_user_id
		 WHERE c.slug = ?
		 ORDER BY c.created_at, c.id`,
	).bind(slug);

const toComment = (row: Row, viewer: User | null) => ({
	id: row.id,
	user: row.deleted ? null : { username: row.username, isAdmin: row.is_admin === 1 },
	replyTo: row.reply_to_name,
	content: row.deleted ? '' : row.content,
	createdAt: row.created_at,
	deleted: row.deleted === 1,
	canDelete: !row.deleted && !!viewer && (viewer.isAdmin || viewer.id === row.user_id),
});

/** 整理成两层结构：顶层评论新的在前，楼中楼回复按时间正序；已删除且没有回复的顶层评论不再显示 */
export function buildList(rows: unknown[], viewer: User | null) {
	const all = rows as Row[];
	const comments = all
		.filter((r) => r.parent_id === null)
		.reverse()
		.map((top) => ({
			...toComment(top, viewer),
			replies: all.filter((r) => r.parent_id === top.id && !r.deleted).map((r) => toComment(r, viewer)),
		}))
		.filter((c) => !c.deleted || c.replies.length > 0);
	const count = comments.reduce((n, c) => n + (c.deleted ? 0 : 1) + c.replies.length, 0);
	return { count, comments };
}
