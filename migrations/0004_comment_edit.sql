-- 评论编辑：记录最后一次编辑时间，前端据此显示“已编辑”
ALTER TABLE comments ADD COLUMN edited_at INTEGER;
