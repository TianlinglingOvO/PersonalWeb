// 账号页（/account/）：回复我的（打开即标记为已读，新回复会标出来）、修改密码。
// “退出登录”“注销账号”按钮由 account-menu.ts 统一处理
import { api } from '../core/api';
import { getAccount, initialOf, type Account } from '../core/account';
import { getReplies, markRepliesSeen, repliesSeenAt, type ReplyItem } from '../core/replies';
import { animateHeight, shake, staggerIn } from '../core/motion';
import { fillTime } from '../core/time';
import { toast } from '../core/toast';

export function init(signal: AbortSignal) {
	const root = document.querySelector<HTMLElement>('[data-account-page]');
	if (!root) return;
	const q = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
	const list = q<HTMLOListElement>('[data-reply-list]');
	const status = q('[data-replies-status]');
	const template = q<HTMLTemplateElement>('[data-reply-template]');
	const titles: Record<string, string> = JSON.parse(root.dataset.articleTitles ?? '{}');
	let account: Account | null = null;

	const renderReplies = (items: ReplyItem[], seen: number) => {
		list.replaceChildren(
			...items.map((item) => {
				const li = template.content.firstElementChild!.cloneNode(true) as HTMLLIElement;
				const f = <T extends HTMLElement = HTMLElement>(selector: string) => li.querySelector<T>(selector)!;
				const unread = item.createdAt > seen;
				const link = f<HTMLAnchorElement>('[data-r-link]');
				link.href = `/articles/${item.slug}/#comment-${item.id}`;
				link.classList.toggle('is-unread', unread);
				f('[data-r-avatar]').textContent = initialOf(item.from.username);
				f('[data-r-avatar]').classList.toggle('is-admin', item.from.isAdmin);
				f('[data-r-name]').textContent = item.from.username;
				f('[data-r-admin]').hidden = !item.from.isAdmin;
				f('[data-r-new]').hidden = !unread;
				f('[data-r-content]').textContent = item.content;
				f('[data-r-article]').textContent = titles[item.slug] ?? '一篇已经下架的文章';
				fillTime(f<HTMLTimeElement>('[data-r-time]'), item.createdAt);
				return li;
			}),
		);
		status.textContent = '还没有人回复你～去文章下面聊聊吧';
		status.hidden = items.length > 0;
		staggerIn([...list.children], 40);
	};

	const render = async () => {
		account = await getAccount();
		q('[data-account-guest]').hidden = Boolean(account);
		q('[data-account-panel]').hidden = !account;
		if (!account) return;
		q('[data-account-page-name]').textContent = account.username;
		q('[data-account-page-initial]').textContent = initialOf(account.username);
		q('[data-account-page-initial]').classList.toggle('is-admin', account.isAdmin);
		q('[data-account-page-admin]').hidden = !account.isAdmin;
		q<HTMLInputElement>('[data-password-username]').value = account.username;
		// 站长账号不能在网页上注销，不显示入口
		q('[data-account-close]').hidden = account.isAdmin;

		// 先记下“上次看到哪”，把这次的新回复标出来，再标记为已读（顶栏的小红点随之消失）
		const seen = repliesSeenAt(account);
		const items = await getReplies();
		if (signal.aborted) return;
		renderReplies(items, seen);
		if (items.some((item) => item.createdAt > seen)) markRepliesSeen(account, items);
	};
	void render();
	document.addEventListener('account-change', () => void render(), { signal });

	// 修改密码：先用当前密码登录一次确认是本人（同时换一个新会话），再设置新密码。
	// 拆成两步是因为接口每次只能做一次密码哈希（免费版 CPU 限制），见 functions/api/auth/password.ts
	const form = q<HTMLFormElement>('[data-password-form]');
	const error = q('[data-password-error]');
	const submit = q<HTMLButtonElement>('[data-password-submit]');
	const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
	const showError = (message: string) => {
		if (error.hidden === !message && error.textContent === message) return;
		animateHeight(form, () => {
			error.textContent = message;
			error.hidden = !message;
		});
		if (message) shake(error);
	};

	form.addEventListener(
		'submit',
		async (e) => {
			e.preventDefault();
			if (!account) return;
			const current = field('current').value;
			const next = field('password').value;
			if (!current || !next) return showError('请填写当前密码和新密码');
			if (next.length < 6) return showError('新密码至少 6 位');
			if (next !== field('confirm').value) return showError('两次输入的新密码不一样');
			if (next === current) return showError('新密码和当前密码一样哦');

			showError('');
			submit.disabled = true;
			submit.classList.add('is-loading');
			try {
				await api('/api/auth/login', { body: { username: account.username, password: current } }).catch((err: Error) => {
					// 登录接口对“密码错误”的提示是“用户名或密码错误”，这里换成更贴切的说法
					throw new Error(err.message === '用户名或密码错误' ? '当前密码不正确' : err.message);
				});
				await api('/api/auth/password', { body: { password: next } });
				form.reset();
				field('username').value = account.username;
				toast('密码已修改，其他设备上的登录已经退出');
			} catch (err) {
				showError((err as Error).message);
			} finally {
				submit.disabled = false;
				submit.classList.remove('is-loading');
			}
		},
		{ signal },
	);
}
