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
	edited_at: number | null;
	deleted: number;
}

export const listStatement = (env: Env, slug: string) =>
	env.DB.prepare(
		`SELECT c.id, c.parent_id, c.user_id, u.username, u.is_admin, r.username AS reply_to_name,
		        c.content, c.created_at, c.edited_at, c.deleted
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
	edited: !row.deleted && row.edited_at !== null,
	deleted: row.deleted === 1,
	// 编辑只能本人；删除本人或站长
	canEdit: !row.deleted && !!viewer && viewer.id === row.user_id,
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

export const MAX_LENGTH = 1000;

/**
 * 统一整理评论内容：去掉看不见的控制字符（包括能把文字倒过来显示、用来伪装内容的方向控制符），
 * 换行规范化、最多保留两行空行、去掉首尾空白
 */
export const cleanContent = (raw: unknown) =>
	String(raw ?? '')
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
		.replace(/\r\n?/g, '\n')
		.replace(/\n{4,}/g, '\n\n\n')
		.trim();
