-- 文章评论（两层：顶层评论 + 楼中楼回复）
--   parent_id：回复所属的顶层评论；顶层评论为 NULL
--   reply_to_user_id：回复楼中楼里某个人时记下“回复 @谁”
--   deleted：有回复的顶层评论被删除时只做标记，保留下面的回复
CREATE TABLE comments (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	slug TEXT NOT NULL,
	user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	parent_id INTEGER REFERENCES comments (id) ON DELETE CASCADE,
	reply_to_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
	content TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX comments_slug ON comments (slug, created_at);
CREATE INDEX comments_parent ON comments (parent_id);
