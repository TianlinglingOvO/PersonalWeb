// 站长管理账号的小工具（操作线上 D1 数据库，需先 npx wrangler login）
//   npm run admin -- users                     列出所有用户
//   npm run admin -- set-admin  <用户名>        设为站长（评论显示“站长”标签，可删除任何评论）
//   npm run admin -- unset-admin <用户名>       取消站长
//   npm run admin -- reset-password <用户名> <新密码>   重置密码，并让这个账号在所有设备上退出登录
// 末尾加 --local 则操作本地模拟数据库（wrangler pages dev 用的那份）
import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const args = process.argv.slice(2).filter((a) => a !== '--local');
const where = process.argv.includes('--local') ? '--local' : '--remote';
const [command, name, password] = args;

const quote = (text) => `'${String(text).replaceAll("'", "''")}'`;
const keyOf = (text) => String(text ?? '').normalize('NFKC').trim().toLowerCase();
const run = (sql) =>
	execFileSync('npx', ['wrangler', 'd1', 'execute', 'sutady-db', where, '--json', '--command', sql], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit'],
	});
const rows = (sql) => JSON.parse(run(sql))[0]?.results ?? [];

// 与 functions/_lib/auth.ts 的 hashPassword 格式一致
const hashPassword = (pw) => {
	const iterations = 50_000;
	const salt = randomBytes(16);
	const hash = pbkdf2Sync(pw, salt, iterations, 32, 'sha256');
	return `pbkdf2$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}`;
};

const requireUser = () => {
	const [user] = rows(`SELECT id, username FROM users WHERE username_key = ${quote(keyOf(name))}`);
	if (!user) {
		console.error(`找不到用户：${name}`);
		process.exit(1);
	}
	return user;
};

switch (command) {
	case 'users':
		console.table(
			rows(
				`SELECT u.username AS 用户名, CASE u.is_admin WHEN 1 THEN '站长' ELSE '' END AS 身份,
				        datetime(u.created_at, 'unixepoch', '+8 hours') AS 注册时间,
				        (SELECT COUNT(*) FROM comments c WHERE c.user_id = u.id AND c.deleted = 0) AS 评论数
				 FROM users u WHERE u.username_key NOT LIKE 'closed:%' ORDER BY u.id`,
			),
		);
		break;
	case 'set-admin':
	case 'unset-admin': {
		const user = requireUser();
		run(`UPDATE users SET is_admin = ${command === 'set-admin' ? 1 : 0} WHERE id = ${user.id}`);
		console.log(`${user.username} ${command === 'set-admin' ? '已设为站长' : '已取消站长'}`);
		break;
	}
	case 'reset-password': {
		if (!password || password.length < 6 || password.length > 64) {
			console.error('新密码长度需为 6–64 位');
			process.exit(1);
		}
		const user = requireUser();
		run(`UPDATE users SET password_hash = ${quote(hashPassword(password))} WHERE id = ${user.id};
		     DELETE FROM sessions WHERE user_id = ${user.id};`);
		console.log(`${user.username} 的密码已重置，所有设备上的登录都已失效`);
		break;
	}
	default:
		console.log(`用法：
  npm run admin -- users
  npm run admin -- set-admin <用户名>
  npm run admin -- unset-admin <用户名>
  npm run admin -- reset-password <用户名> <新密码>
  （末尾加 --local 操作本地模拟数据库）`);
}
