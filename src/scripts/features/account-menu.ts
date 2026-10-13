// 顶栏账号入口：未登录显示“登录”，登录后显示头像字母 + 用户名，电脑端点开是下拉菜单（我的账号、退出登录），
// 手机端在抽屉里直接列出；有新回复时头像和手机菜单按钮上出现小红点。
// 页面上任何 [data-logout] / [data-close-account] 按钮（顶栏、登录页、账号页）都由这里统一处理
import { $, $all } from '../core/dom';
import { api } from '../core/api';
import { getAccount, initialOf, loginUrl, setAccount, cachedAccount, type Account } from '../core/account';
import { unreadReplies } from '../core/replies';
import { confirmDialog } from '../core/dialog';
import { toast } from '../core/toast';

export function setup() {
	document.addEventListener('click', (event) => {
		const target = event.target as HTMLElement | null;
		if (target?.closest('[data-logout]')) void logout();
		else if (target?.closest('[data-close-account]')) void closeAccount();
	});
}

async function logout() {
	try {
		await api('/api/auth/logout', { method: 'POST' });
	} catch {
		/* 服务器那边失败也照样清掉本地状态 */
	}
	setAccount(null);
	toast('已退出登录');
}

// 注销账号：弹窗里再输一次密码确认
async function closeAccount() {
	const account = await getAccount();
	if (!account) return;
	if (account.isAdmin) {
		toast('站长账号不能在网页上注销');
		return;
	}
	const closed = await confirmDialog(
		'注销后你的评论会被全部删除（别人回复你的内容会保留），用户名也会释放出来，无法恢复。请输入密码确认：',
		{
			title: `确定要注销「${account.username}」吗？`,
			confirmText: '确认注销',
			input: { type: 'password', placeholder: '当前密码', autocomplete: 'current-password' },
			onConfirm: async (password) => {
				if (!password) return '请输入密码';
				try {
					await api('/api/auth/delete', { body: { password } });
				} catch (err) {
					return (err as Error).message;
				}
			},
		},
	);
	if (!closed) return;
	setAccount(null);
	toast('账号已注销，江湖再见～');
}

export function init(signal: AbortSignal) {
	const root = $('[data-account]') as HTMLElement | null;
	if (!root) return;
	const login = root.querySelector<HTMLAnchorElement>('[data-account-login]')!;
	const user = root.querySelector<HTMLElement>('[data-account-user]')!;
	const toggle = root.querySelector<HTMLButtonElement>('[data-account-toggle]')!;

	const setMenu = (open: boolean) => {
		toggle.setAttribute('aria-expanded', String(open));
		root.classList.toggle('is-menu-open', open);
	};
	const render = (account: Account | null) => {
		login.hidden = Boolean(account);
		user.hidden = !account;
		if (account) {
			root.querySelector('[data-account-name]')!.textContent = account.username;
			root.querySelector('[data-account-initial]')!.textContent = initialOf(account.username);
			root.querySelector<HTMLElement>('[data-account-admin]')!.hidden = !account.isAdmin;
		} else {
			setMenu(false);
		}
	};
	// 小红点和“我的账号”旁的数字（顶栏头像、手机端菜单按钮各有一个红点）
	const navToggle = $('[data-nav-toggle]');
	const renderUnread = (count: number) => {
		$all<HTMLElement>('[data-replies-dot]').forEach((dot) => (dot.hidden = count === 0));
		$all<HTMLElement>('[data-replies-count]').forEach((badge) => {
			badge.hidden = count === 0;
			badge.textContent = count > 9 ? '9+' : String(count);
		});
		const hint = count ? `（${count} 条新回复）` : '';
		navToggle?.setAttribute('aria-label', `打开菜单${hint}`);
		root.querySelector('[data-replies-sr]')!.textContent = hint;
		toggle.title = count ? `有 ${count} 条新回复` : '';
	};
	const refresh = async () => {
		const account = await getAccount();
		render(account);
		renderUnread(account ? await unreadReplies() : 0);
	};

	if (!location.pathname.startsWith('/login')) login.href = loginUrl();
	render(cachedAccount());
	void refresh();
	document.addEventListener('account-change', () => void refresh(), { signal });
	document.addEventListener('replies-change', () => void refresh(), { signal });

	toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'), { signal });
	document.addEventListener('click', (e) => !root.contains(e.target as Node) && setMenu(false), { signal });
	document.addEventListener('keydown', (e) => e.key === 'Escape' && setMenu(false), { signal });
}
