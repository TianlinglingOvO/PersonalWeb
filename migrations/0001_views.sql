-- 文章浏览量
CREATE TABLE views (
	slug TEXT PRIMARY KEY,
	count INTEGER NOT NULL DEFAULT 0
);

-- 去重记录：同一访客同一天同一篇只算一次。visitor 是 IP + UA + 日期的哈希，不存原始 IP，两天后清理
CREATE TABLE view_hits (
	slug TEXT NOT NULL,
	visitor TEXT NOT NULL,
	day TEXT NOT NULL,
	PRIMARY KEY (slug, visitor, day)
);
