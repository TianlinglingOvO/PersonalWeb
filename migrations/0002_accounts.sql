-- 用户账号。username 保留注册时的写法用于显示；username_key 是规范化后的小写形式，用来判断重名（Sutady 与 sutady 算同一个）
CREATE TABLE users (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	username TEXT NOT NULL,
	username_key TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	is_admin INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL
);

-- 登录状态。只存 token 的哈希，数据库泄露也无法冒充登录
CREATE TABLE sessions (
	token_hash TEXT PRIMARY KEY,
	user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- 频率限制（按 IP 哈希计数），防暴力破解和批量注册
CREATE TABLE rate_limits (
	key TEXT PRIMARY KEY,
	count INTEGER NOT NULL,
	window_start INTEGER NOT NULL
);
