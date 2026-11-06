-- 全站每日访问统计（只给站长看，见 functions/api/visits.ts）。day 是北京时间的日期，例如 2026-11-06
--   pv：浏览次数，每打开一个页面（含站内换页）算一次
--   uv：访客数，同一访客（IP + UA）同一天只算一位
CREATE TABLE daily_visits (
	day TEXT PRIMARY KEY,
	pv INTEGER NOT NULL DEFAULT 0,
	uv INTEGER NOT NULL DEFAULT 0
);

-- 访客去重记录：visitor 是 IP + UA + 日期的哈希，不存原始 IP，两天后清理
CREATE TABLE visit_hits (
	day TEXT NOT NULL,
	visitor TEXT NOT NULL,
	PRIMARY KEY (day, visitor)
);
