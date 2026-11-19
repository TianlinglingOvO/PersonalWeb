// 接口冒烟测试：npm run smoke（会先自动构建）
//   1. 在系统临时目录新建一个全新的本地数据库，执行 migrations/ 里的全部迁移；
//   2. 用 wrangler 在本地启动完整站点（静态页 + /api 接口，端口 8913）；
//   3. 依次走一遍：静态页、浏览量、访问统计、注册、登录、评论、楼中楼、编辑、删除、回复提醒、改密码、注销、站长看统计、防跨站请求；
//   4. 关掉服务器，删掉临时数据库。
// 不会碰线上数据，也不会碰 npm run preview:full 用的本地数据库（.wrangler/state）。
// 改了 functions/、migrations/ 或账号、评论相关的前端后跑一下；任何一项失败都会以非 0 状态退出。
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8913;
// wrangler 默认的调试端口 9229 会和同时开着的 preview:full 冲突，冒烟测试单独用一个
const INSPECTOR_PORT = 9913;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.resolve(import.meta.dirname, '..');
const STATE = mkdtempSync(path.join(tmpdir(), 'sutady-smoke-'));
// wrangler 只在交互式终端里提问；CI=1 让它不等输入
const ENV = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', NO_PROXY: 'localhost,127.0.0.1', no_proxy: 'localhost,127.0.0.1' };

/** 启动 wrangler 子进程（独立进程组，结束时能连同它启动的 workerd 一起关掉） */
function wrangler(args) {
	const child = spawn('npx', ['wrangler', ...args], { cwd: ROOT, env: ENV, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
	let output = '';
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (output += chunk));
	return {
		child,
		output: () => output.replace(/\x1b\[[0-9;]*m/g, ''),
		kill() {
			try {
				process.kill(-child.pid, 'SIGTERM');
			} catch {
				/* 已经退出了 */
			}
		},
	};
}

/** 执行迁移。wrangler 应用完迁移后有时不会自己退出，所以看到全部迁移都打了 ✅ 就主动结束它 */
async function migrate() {
	const files = readdirSync(path.join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql'));
	const run = wrangler(['d1', 'migrations', 'apply', 'sutady-db', '--local', '--persist-to', STATE]);
	const exited = new Promise((resolve) => run.child.on('exit', resolve));
	for (let i = 0; i < 600; i++) {
		const out = run.output();
		const applied = files.every((f) => new RegExp(`${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*│\\s*✅`).test(out));
		if (applied) break;
		if (run.child.exitCode !== null) throw new Error(`执行迁移失败：\n${out}`);
		await sleep(100);
	}
	run.kill();
	await Promise.race([exited, sleep(3000)]);
	if (!files.every((f) => run.output().includes(f))) throw new Error(`执行迁移超时：\n${run.output()}`);
	return files.length;
}

/** 在临时数据库上直接执行一条 SQL（比如把测试账号设为站长）。和 migrate 一样，wrangler 有时不会自己退出，超时就结束它 */
async function sql(command) {
	const run = wrangler(['d1', 'execute', 'sutady-db', '--local', '--persist-to', STATE, '--command', command]);
	const exited = new Promise((resolve) => run.child.on('exit', resolve));
	for (let i = 0; i < 300 && run.child.exitCode === null; i++) {
		if (/executed successfully/i.test(run.output())) break;
		await sleep(100);
	}
	run.kill();
	await Promise.race([exited, sleep(3000)]);
	if (!/executed successfully/i.test(run.output())) throw new Error(`执行 SQL 失败：\n${run.output()}`);
}

/** 端口能不能用（被别的程序占着时启动会失败，提前给出明白的提示） */
const portFree = (port) =>
	new Promise((resolve) => {
		const probe = createServer();
		probe.once('error', () => resolve(false));
		probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
	});

/** 启动完整站点，等首页能打开。启动失败时也要关掉它带起来的进程，否则残留的进程会一直占着端口 */
async function startServer() {
	for (const port of [PORT, INSPECTOR_PORT]) {
		if (!(await portFree(port))) throw new Error(`端口 ${port} 被占用，先关掉占用它的程序（比如另一个还开着的 wrangler）再试`);
	}
	const server = wrangler(['pages', 'dev', 'dist', '--port', String(PORT), '--inspector-port', String(INSPECTOR_PORT), '--persist-to', STATE]);
	try {
		for (let i = 0; i < 300; i++) {
			if (server.child.exitCode !== null) throw new Error(`本地服务器启动失败：\n${server.output()}`);
			try {
				if ((await fetch(BASE)).ok) return server;
			} catch {
				/* 还没起来 */
			}
			await sleep(200);
		}
		throw new Error(`本地服务器 60 秒内没有启动：\n${server.output()}`);
	} catch (err) {
		server.kill();
		throw err;
	}
}

/** 一个“浏览器”：自己保存登录 Cookie */
function client(name, { ip } = {}) {
	let cookie = '';
	return async (method, url, body, { origin = BASE, headers = {} } = {}) => {
		const res = await fetch(BASE + url, {
			method,
			headers: {
				...(origin === null ? {} : { Origin: origin }),
				'User-Agent': `smoke-${name}`,
				...(ip ? { 'CF-Connecting-IP': ip } : {}),
				...(body ? { 'Content-Type': 'application/json' } : {}),
				...(cookie ? { Cookie: cookie } : {}),
				...headers,
			},
			body: body ? JSON.stringify(body) : undefined,
			redirect: 'manual',
		});
		const set = res.headers.get('set-cookie');
		if (set) {
			const pair = set.split(';')[0];
			cookie = pair.endsWith('=') ? '' : pair;
		}
		const text = await res.text();
		let data = text;
		try {
			data = JSON.parse(text);
		} catch {
			/* 不是 JSON（静态页） */
		}
		return { status: res.status, data };
	};
}

const results = [];
async function check(name, fn) {
	try {
		const problem = await fn();
		results.push({ name, ok: !problem, detail: problem || '' });
	} catch (err) {
		results.push({ name, ok: false, detail: String(err?.message ?? err) });
	}
}
/** 条件不成立时返回说明文字（check 把它当作失败原因） */
const expect = (cond, detail) => (cond ? '' : detail);
const show = (r) => JSON.stringify(r.data).slice(0, 200);

async function runTests() {
	const slugs = readdirSync(path.join(ROOT, 'content/articles'))
		.filter((f) => f.endsWith('.md'))
		.sort()
		.map((f) => f.replace(/\.md$/, ''));
	const [slug, slugRepeat, slugOther, slugLimit, slugIpv6, slugRef] = slugs;
	const guest = client('guest');
	const A = client('A');
	const A2 = client('A-phone');
	const B = client('B');
	const nameA = `smoke${Date.now().toString(36).slice(-5)}`;
	const nameB = `测试${Date.now().toString(36).slice(-4)}`;

	// ---- 静态页 ----
	await check('静态页：首页、文章页、文章列表、账号页、RSS、sitemap 都能打开', async () => {
		for (const url of ['/', `/articles/${slug}/`, '/articles/', '/account/', '/login/', '/rss.xml', '/sitemap.xml', '/robots.txt']) {
			const r = await guest('GET', url);
			if (r.status !== 200) return `${url} 返回 ${r.status}`;
		}
		const home = await guest('GET', '/');
		const login = await guest('GET', '/login/');
		const account = await guest('GET', '/account/');
		const rss = await guest('GET', '/rss.xml');
		return expect(
			!String(home.data).includes('data-no-visit') &&
				String(login.data).includes('data-no-visit') &&
				String(account.data).includes('data-no-visit') &&
				String(rss.data).includes(`/articles/${slug}/`),
			'页面 data-no-visit 标记或 RSS 内容不符合预期',
		);
	});
	await check('静态页：不存在的地址返回 404 且标记不计入访问统计', async () => {
		const r = await guest('GET', '/no-such-page/');
		return expect(r.status === 404 && String(r.data).includes('data-no-visit'), `status=${r.status}`);
	});

	// ---- 未登录 ----
	await check('未登录：/api/auth/me 返回空', async () => {
		const r = await guest('GET', '/api/auth/me');
		return expect(r.status === 200 && r.data.user === null, show(r));
	});
	await check('未登录：不能看回复提醒、不能评论、不能改密码', async () => {
		const replies = await guest('GET', '/api/replies');
		const comment = await guest('POST', '/api/comments', { slug, content: 'hi' });
		const password = await guest('POST', '/api/auth/password', { password: 'abcdef' });
		return expect(replies.status === 401 && comment.status === 401 && password.status === 401, `${replies.status}/${comment.status}/${password.status}`);
	});

	// ---- 浏览量 ----
	await check('浏览量：同一访客一天只算一次', async () => {
		const first = await guest('POST', `/api/views?slug=${slug}`);
		const second = await guest('POST', `/api/views?slug=${slug}`);
		const batch = await guest('GET', `/api/views?slugs=${slug},no_such_article`);
		return expect(
			first.data.count === 1 &&
				first.data.counted === true &&
				/^\d{4}-\d{2}-\d{2}$/.test(first.data.day) &&
				second.data.count === 1 &&
				second.data.counted === false &&
				second.data.day === first.data.day &&
				batch.data[slug] === 1,
			`${show(first)} ${show(second)} ${show(batch)}`,
		);
	});
	await check('浏览量：跨站、缺来源、爬虫不计数，同源 Referer 可放行', async () => {
		const csrf = await client('other')('POST', `/api/views?slug=${slug}`, undefined, { origin: 'https://evil.example' });
		const noOrigin = await client('no-origin')('POST', `/api/views?slug=${slug}`, undefined, { origin: null });
		const crossSite = await client('cross')('POST', `/api/views?slug=${slug}`, undefined, {
			headers: { 'Sec-Fetch-Site': 'cross-site' },
		});
		const bot = await client('bot')('POST', `/api/views?slug=${slug}`, undefined, {
			headers: { 'User-Agent': 'Googlebot/2.1' },
		});
		const preview = await client('preview')('POST', `/api/views?slug=${slug}`, undefined, {
			headers: { 'User-Agent': 'BingPreview/1.0b' },
		});
		const curlReq = await client('curl')('POST', `/api/views?slug=${slug}`, undefined, {
			headers: { 'User-Agent': 'curl/8.5.0' },
		});
		const refOnly = await client('ref-reader', { ip: '198.51.100.12' })('POST', `/api/views?slug=${slugRef}`, undefined, {
			origin: null,
			headers: { Referer: `${BASE}/articles/${slugRef}/` },
		});
		const after = await guest('GET', `/api/views?slugs=${slug}`);
		return expect(
			csrf.status === 403 &&
				noOrigin.status === 403 &&
				crossSite.status === 403 &&
				bot.data.count === 1 &&
				bot.data.counted === false &&
				preview.data.count === 1 &&
				curlReq.data.count === 1 &&
				refOnly.status === 200 &&
				refOnly.data.counted === true &&
				refOnly.data.count === 1 &&
				after.data[slug] === 1,
			`${csrf.status}/${noOrigin.status}/${crossSite.status} ${show(bot)} ${show(refOnly)} ${show(after)}`,
		);
	});
	await check('浏览量：不存在的文章（含 index）不计数', async () => {
		const bad = await guest('POST', '/api/views?slug=../etc');
		const missing = await guest('POST', '/api/views?slug=no_such_article');
		const indexSlug = await guest('POST', '/api/views?slug=index');
		return expect(bad.status === 400 && missing.status === 404 && indexSlug.status === 404, `${bad.status}/${missing.status}/${indexSlug.status}`);
	});
	await check('浏览量：去重优先不耗尽限流，单 IP 换 UA 刷单篇每小时最多 5 次', async () => {
		const repeatReader = client('repeat-reader', { ip: '198.51.100.10' });
		let repeatOk = true;
		for (let i = 0; i < 60; i++) {
			const r = await repeatReader('POST', `/api/views?slug=${slugRepeat}`);
			if (r.status !== 200 || r.data.count !== 1 || r.data.counted !== (i === 0) || !r.data.day) {
				repeatOk = false;
				break;
			}
		}
		const nextArticle = await repeatReader('POST', `/api/views?slug=${slugOther}`);

		const rotCounts = [];
		for (let i = 0; i < 6; i++) {
			const r = await client(`ua-${i}`, { ip: '198.51.100.11' })('POST', `/api/views?slug=${slugLimit}`);
			rotCounts.push(r.data);
		}
		const rotOk =
			rotCounts.slice(0, 5).every((d, i) => d.counted === true && d.count === i + 1 && Boolean(d.day)) &&
			rotCounts[5].counted === false &&
			rotCounts[5].count === 5 &&
			rotCounts[5].day === undefined;

		return expect(
			repeatOk && nextArticle.data.counted === true && nextArticle.data.count === 1 && rotOk,
			`repeatOk=${repeatOk} next=${show(nextArticle)} rot=${JSON.stringify(rotCounts)}`,
		);
	});
	await check('浏览量：IPv6 前导零与 IPv4 映射地址归一化去重', async () => {
		const v6a = await client('v6', { ip: '240e:03b7:0012:00a0::1' })('POST', `/api/views?slug=${slugIpv6}`, undefined, {
			headers: { 'User-Agent': 'IPv6Reader/1.0' },
		});
		const v6b = await client('v6', { ip: '240E:3B7:12:A0::2' })('POST', `/api/views?slug=${slugIpv6}`, undefined, {
			headers: { 'User-Agent': 'IPv6Reader/1.0' },
		});
		const v4m = await client('v4m', { ip: '::ffff:203.0.113.9' })('POST', `/api/views?slug=${slugIpv6}`, undefined, {
			headers: { 'User-Agent': 'MappedReader/1.0' },
		});
		const v4 = await client('v4', { ip: '203.0.113.9' })('POST', `/api/views?slug=${slugIpv6}`, undefined, {
			headers: { 'User-Agent': 'MappedReader/1.0' },
		});
		return expect(
			v6a.data.counted === true &&
				v6a.data.count === 1 &&
				v6b.data.counted === false &&
				v6b.data.count === 1 &&
				v4m.data.counted === true &&
				v4m.data.count === 2 &&
				v4.data.counted === false &&
				v4.data.count === 2,
			`${show(v6a)} ${show(v6b)} ${show(v4m)} ${show(v4)}`,
		);
	});

	// ---- 访问统计：计数 ----
	await check('访问统计：每次打开页面都算浏览，同一访客一天只算一位', async () => {
		const first = await guest('POST', '/api/visits');
		const second = await guest('POST', '/api/visits');
		const other = await client('visitor-2')('POST', '/api/visits');
		return expect(first.data.counted === true && second.data.counted === true && other.data.counted === true, `${show(first)} ${show(second)} ${show(other)}`);
	});
	await check('访问统计：跨站、缺来源和爬虫不计数，未登录看不到统计', async () => {
		const csrf = await client('other')('POST', '/api/visits', undefined, { origin: 'https://evil.example' });
		const noOrigin = await client('no-origin')('POST', '/api/visits', undefined, { origin: null });
		const crossSite = await client('cross')('POST', '/api/visits', undefined, {
			headers: { 'Sec-Fetch-Site': 'cross-site' },
		});
		const bot = await client('bot')('POST', '/api/visits', undefined, {
			headers: { 'User-Agent': 'Baiduspider' },
		});
		const preview = await client('preview')('POST', '/api/visits', undefined, {
			headers: { 'User-Agent': 'BingPreview/1.0b' },
		});
		const curlReq = await client('curl')('POST', '/api/visits', undefined, {
			headers: { 'User-Agent': 'curl/8.5.0' },
		});
		const stats = await guest('GET', '/api/visits');
		return expect(
			csrf.status === 403 &&
				noOrigin.status === 403 &&
				crossSite.status === 403 &&
				bot.data.counted === false &&
				preview.data.counted === false &&
				curlReq.data.counted === false &&
				stats.status === 401,
			`${csrf.status}/${noOrigin.status}/${crossSite.status} ${show(bot)} ${show(preview)} ${show(curlReq)} ${stats.status}`,
		);
	});

	// ---- 注册 / 登录 ----
	await check('注册：成功后直接登录', async () => {
		const r = await A('POST', '/api/auth/register', { username: nameA, password: 'secret123' });
		const me = await A('GET', '/api/auth/me');
		return expect(r.status === 201 && me.data.user?.username === nameA, `${r.status} ${show(me)}`);
	});
	await check('注册：其他网站发来的请求被拒绝（防 CSRF）', async () => {
		const r = await guest('POST', '/api/auth/register', { username: 'evil_user', password: 'secret123' }, { origin: 'https://evil.example' });
		return expect(r.status === 403, `返回 ${r.status}`);
	});
	await check('注册：用户名不区分大小写，不能重名', async () => {
		const r = await guest('POST', '/api/auth/register', { username: nameA.toUpperCase(), password: 'secret123' });
		return expect(r.status === 409, `返回 ${r.status}`);
	});
	await check('注册：用户名、密码不合规时给出提示', async () => {
		const badName = await guest('POST', '/api/auth/register', { username: 'a b', password: 'secret123' });
		const shortPassword = await guest('POST', '/api/auth/register', { username: 'okname', password: '123' });
		const reserved = await guest('POST', '/api/auth/register', { username: '站长', password: 'secret123' });
		return expect(badName.status === 400 && shortPassword.status === 400 && reserved.status === 400, `${badName.status}/${shortPassword.status}/${reserved.status}`);
	});
	await check('登录：密码错误被拒绝，正确后可以登录', async () => {
		await A('POST', '/api/auth/logout');
		const out = await A('GET', '/api/auth/me');
		const wrong = await A('POST', '/api/auth/login', { username: nameA, password: 'wrong-password' });
		const right = await A('POST', '/api/auth/login', { username: nameA, password: 'secret123' });
		const me = await A('GET', '/api/auth/me');
		return expect(out.data.user === null && wrong.status === 401 && right.status === 200 && me.data.user?.username === nameA, `${show(out)} ${wrong.status} ${right.status}`);
	});

	// ---- 评论 ----
	let topId = 0;
	await check('评论：登录后可以发表', async () => {
		const r = await A('POST', '/api/comments', { slug, content: '冒烟测试：第一条评论' });
		topId = r.data.id;
		return expect(r.status === 201 && r.data.count === 1 && r.data.comments[0]?.content === '冒烟测试：第一条评论', show(r));
	});
	await check('评论：空内容、超长内容、不存在的文章（含 index）被拒绝', async () => {
		const empty = await A('POST', '/api/comments', { slug, content: '   ' });
		const long = await A('POST', '/api/comments', { slug, content: '字'.repeat(1001) });
		const missing = await A('POST', '/api/comments', { slug: 'no_such_article', content: 'hi' });
		const indexSlug = await A('POST', '/api/comments', { slug: 'index', content: 'hi' });
		return expect(empty.status === 400 && long.status === 400 && missing.status === 404 && indexSlug.status === 404, `${empty.status}/${long.status}/${missing.status}/${indexSlug.status}`);
	});
	await check('评论：其他网站发来的请求被拒绝（防 CSRF）', async () => {
		const r = await A('POST', '/api/comments', { slug, content: 'csrf' }, { origin: 'https://evil.example' });
		return expect(r.status === 403, `返回 ${r.status}`);
	});

	let replyId = 0;
	await check('楼中楼：回复挂在顶层评论下面', async () => {
		await B('POST', '/api/auth/register', { username: nameB, password: 'secret456' });
		const r = await B('POST', '/api/comments', { slug, content: '冒烟测试：B 的回复', replyTo: topId });
		replyId = r.data.id;
		const top = r.data.comments.find((c) => c.id === topId);
		return expect(r.status === 201 && top?.replies?.[0]?.content === '冒烟测试：B 的回复', show(r));
	});
	await check('回复提醒：A 收到 B 的回复，B 自己没有', async () => {
		const a = await A('GET', '/api/replies');
		const b = await B('GET', '/api/replies');
		const item = a.data.items?.[0];
		return expect(item?.id === replyId && item.slug === slug && item.from.username === nameB && b.data.items?.length === 0, `${show(a)} ${show(b)}`);
	});
	await check('回复提醒：在楼中楼里 @B 时，B 收到提醒', async () => {
		await A('POST', '/api/comments', { slug, content: '冒烟测试：A 回复 B', replyTo: replyId });
		const b = await B('GET', '/api/replies');
		return expect(b.data.items?.[0]?.from.username === nameA && b.data.items[0].content === '冒烟测试：A 回复 B', show(b));
	});

	await check('编辑：本人可以改，别人不能改', async () => {
		const mine = await A('PATCH', `/api/comments/${topId}`, { content: '冒烟测试：改过的评论' });
		const others = await B('PATCH', `/api/comments/${topId}`, { content: '偷偷改' });
		const top = mine.data.comments?.find((c) => c.id === topId);
		return expect(mine.status === 200 && top?.edited === true && top.content === '冒烟测试：改过的评论' && others.status === 403, `${mine.status} ${others.status}`);
	});
	await check('删除：别人不能删；有回复的顶层评论只标记删除，回复保留', async () => {
		const others = await B('DELETE', `/api/comments/${topId}`);
		const mine = await A('DELETE', `/api/comments/${topId}`);
		const top = mine.data.comments?.find((c) => c.id === topId);
		return expect(others.status === 403 && mine.status === 200 && top?.deleted === true && top.replies.length === 2, `${others.status} ${show(mine)}`);
	});

	// ---- 改密码 ----
	await check('改密码：成功后其他设备退出，旧密码失效、新密码可用', async () => {
		await A2('POST', '/api/auth/login', { username: nameA, password: 'secret123' });
		const before = await A2('GET', '/api/auth/me');
		const verify = await A('POST', '/api/auth/login', { username: nameA, password: 'secret123' });
		const change = await A('POST', '/api/auth/password', { password: 'newpass789' });
		const self = await A('GET', '/api/auth/me');
		const other = await A2('GET', '/api/auth/me');
		const oldPassword = await guest('POST', '/api/auth/login', { username: nameA, password: 'secret123' });
		const newPassword = await guest('POST', '/api/auth/login', { username: nameA, password: 'newpass789' });
		await guest('POST', '/api/auth/logout');
		return expect(
			before.data.user?.username === nameA &&
				verify.status === 200 &&
				change.status === 200 &&
				self.data.user?.username === nameA &&
				other.data.user === null &&
				oldPassword.status === 401 &&
				newPassword.status === 200,
			`${verify.status} ${change.status} ${show(self)} ${show(other)} ${oldPassword.status} ${newPassword.status}`,
		);
	});
	await check('改密码：新密码太短、跨站请求被拒绝', async () => {
		await A('POST', '/api/auth/login', { username: nameA, password: 'newpass789' });
		const short = await A('POST', '/api/auth/password', { password: '123' });
		const csrf = await A('POST', '/api/auth/password', { password: 'abcdefg' }, { origin: 'https://evil.example' });
		return expect(short.status === 400 && csrf.status === 403, `${short.status}/${csrf.status}`);
	});

	// ---- 注销 ----
	await check('注销：密码错误被拒绝；成功后退出登录、评论按规则删除、名字可以重新注册', async () => {
		const wrong = await B('POST', '/api/auth/delete', { password: 'nope' });
		const ok = await B('POST', '/api/auth/delete', { password: 'secret456' });
		const me = await B('GET', '/api/auth/me');
		const list = await guest('GET', `/api/comments?slug=${slug}`);
		const top = list.data.comments?.find((c) => c.id === topId);
		const again = await guest('POST', '/api/auth/register', { username: nameB, password: 'secret456' });
		return expect(
			wrong.status === 401 && ok.status === 200 && me.data.user === null && top?.replies.length === 1 && again.status === 201,
			`${wrong.status} ${ok.status} ${show(me)} ${show(list)} ${again.status}`,
		);
	});

	// ---- 访问统计：站长查看 & 防刷 ----
	await check('访问统计：普通用户不能看；设为站长后能看到最近 30 天，本人浏览和阅读均不计数', async () => {
		const C = client('C', { ip: '198.51.100.99' });
		const nameC = `owner${Date.now().toString(36).slice(-5)}`;
		await C('POST', '/api/auth/register', { username: nameC, password: 'secret789' });
		const denied = await C('GET', '/api/visits');
		await sql(`UPDATE users SET is_admin = 1 WHERE username_key = '${nameC.toLowerCase()}'`);
		const selfVisit = await C('POST', '/api/visits');
		const selfView = await C('POST', `/api/views?slug=${slugRef}`);
		const r = await C('GET', '/api/visits');
		// 前面的 3 次浏览（guest 两次、visitor-2 一次）一般都记在今天；测试正好跨过北京时间零点时会分到相邻两天，
		// 所以按“有数据的那几天”核对，而不是死盯最后一天
		const counted = r.data.days?.filter((d) => d.pv > 0) ?? [];
		const pv = counted.reduce((n, d) => n + d.pv, 0);
		const sameDay = counted.length === 1;
		return expect(
			denied.status === 403 &&
				selfVisit.data.counted === false &&
				selfView.data.counted === false &&
				selfView.data.count === 1 &&
				selfView.data.day === undefined &&
				r.status === 200 &&
				r.data.days.length === 30 &&
				pv === 3 &&
				(!sameDay || counted[0].uv === 2) &&
				r.data.total === 3 &&
				r.data.since === counted[0]?.day,
			`${denied.status} ${show(selfVisit)} ${show(selfView)} ${r.status} ${JSON.stringify(r.data).slice(-200)}`,
		);
	});
	await check('访问统计：单 IP 换 UA 刷 UV 每小时最多 10 位，已记录访客继续浏览不占配额', async () => {
		const admin = client('admin-stats');
		const adminName = `adm${Date.now().toString(36).slice(-5)}`;
		await admin('POST', '/api/auth/register', { username: adminName, password: 'secret789' });
		await sql(`UPDATE users SET is_admin = 1 WHERE username_key = '${adminName.toLowerCase()}'`);
		const before = await admin('GET', '/api/visits');
		const beforeUv = before.data.days.reduce((n, d) => n + d.uv, 0);

		const results11 = [];
		for (let i = 0; i < 11; i++) {
			const r = await client(`rot-${i}`, { ip: '198.51.100.20' })('POST', '/api/visits', undefined, {
				headers: { 'User-Agent': `VisitUA-${i}` },
			});
			results11.push(r.data.counted);
		}
		const repeatSeen = await client('rot-0', { ip: '198.51.100.20' })('POST', '/api/visits', undefined, {
			headers: { 'User-Agent': 'VisitUA-0' },
		});

		const after = await admin('GET', '/api/visits');
		const afterUv = after.data.days.reduce((n, d) => n + d.uv, 0);
		return expect(
			results11.slice(0, 10).every(Boolean) &&
				results11[10] === false &&
				repeatSeen.data.counted === true &&
				after.data.total - before.data.total === 11 &&
				afterUv - beforeUv === 10,
			`results11=${JSON.stringify(results11)} repeat=${show(repeatSeen)} pvDelta=${after.data.total - before.data.total} uvDelta=${afterUv - beforeUv}`,
		);
	});
}

let server;
let exitCode = 0;
try {
	console.log('冒烟测试：准备临时数据库…');
	const n = await migrate();
	console.log(`  已执行 ${n} 个迁移，启动本地站点 ${BASE} …`);
	server = await startServer();
	await runTests();
	console.log('');
	for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n    ${r.detail}`}`);
	const failed = results.filter((r) => !r.ok).length;
	console.log(`\n${results.length - failed}/${results.length} 项通过`);
	if (failed) exitCode = 1;
} catch (err) {
	console.error(`\n冒烟测试没能跑完：${err?.message ?? err}`);
	exitCode = 1;
} finally {
	server?.kill();
	await sleep(500);
	rmSync(STATE, { recursive: true, force: true });
}
process.exit(exitCode);
