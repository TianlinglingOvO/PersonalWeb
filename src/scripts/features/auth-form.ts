// 登录页（/login/）：登录 / 注册两个标签共用一张表单
import { navigate } from 'astro:transitions/client';
import { $, $all } from '../core/dom';
import { api } from '../core/api';
import { getAccount, setAccount, type Account } from '../core/account';
import { animateHeight, shake, staggerIn } from '../core/motion';
import { toast } from '../core/toast';

export function init(signal: AbortSignal) {
	const root = $('[data-auth]') as HTMLElement | null;
	if (!root) return;
	const form = root.querySelector<HTMLFormElement>('[data-auth-form]')!;
	const signedIn = root.querySelector<HTMLElement>('[data-auth-signed-in]')!;
	const tabs = $all<HTMLButtonElement>('[data-auth-tab]', form);
	const error = form.querySelector<HTMLElement>('[data-auth-error]')!;
	const submit = form.querySelector<HTMLButtonElement>('[data-auth-submit]')!;
	const reveal = form.querySelector<HTMLButtonElement>('[data-auth-reveal]')!;
	const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
	// 登录后跳回原页面：按浏览器的规则解析后必须仍是本站地址，防止 ?next=/\evil.com 这类链接把人带去别的网站
	const nextUrl = new URL(new URLSearchParams(location.search).get('next') ?? '/', location.origin);
	const next = nextUrl.origin === location.origin ? nextUrl.pathname + nextUrl.search + nextUrl.hash : '/';

	const showState = (account: Account | null) => {
		signedIn.hidden = !account;
		form.hidden = Boolean(account);
		if (account) signedIn.querySelector('[data-auth-current]')!.textContent = account.username;
	};
	void getAccount().then(showState);
	document.addEventListener('account-change', () => void getAccount().then(showState), { signal });

	const showError = (message: string) => {
		if (error.hidden === !message && error.textContent === message) return;
		animateHeight(root, () => {
			error.textContent = message;
			error.hidden = !message;
		});
		if (message) shake(error);
	};

	const setMode = (mode: string) => {
		if (form.dataset.mode === mode) return;
		animateHeight(root, () => applyMode(mode));
		staggerInAuth();
	};
	const applyMode = (mode: string) => {
		form.dataset.mode = mode;
		tabs.forEach((tab) => {
			const on = tab.dataset.authTab === mode;
			tab.classList.toggle('is-active', on);
			tab.setAttribute('aria-selected', String(on));
		});
		$all<HTMLElement>('[data-auth-show]', form).forEach((el) => (el.hidden = el.dataset.authShow !== mode));
		field('password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
		showError('');
	};
	const staggerInAuth = () =>
		staggerIn(
			$all<HTMLElement>('.auth-title, .auth-sub, .auth-field, .auth-field-hint, .auth-submit', form).filter((el) => !el.hidden),
			30,
		);
	tabs.forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.authTab ?? 'login'), { signal }));
	// 表单底部“还没有账号？去创建一个吧～”这类切换提示
	$all<HTMLButtonElement>('[data-auth-switch]', form).forEach((button) =>
		button.addEventListener(
			'click',
			() => {
				setMode(button.dataset.authSwitch ?? 'login');
				field('username').focus({ preventScroll: true });
			},
			{ signal },
		),
	);
	if (location.hash === '#register') applyMode('register');

	reveal.addEventListener(
		'click',
		() => {
			const show = reveal.getAttribute('aria-pressed') !== 'true';
			reveal.setAttribute('aria-pressed', String(show));
			reveal.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
			field('password').type = field('confirm').type = show ? 'text' : 'password';
		},
		{ signal },
	);

	form.addEventListener(
		'submit',
		async (e) => {
			e.preventDefault();
			const mode = form.dataset.mode === 'register' ? 'register' : 'login';
			const username = field('username').value.normalize('NFKC').trim();
			const password = field('password').value;
			if (!username || !password) return showError('请填写用户名和密码');
			if (mode === 'register') {
				if (!/^[\p{L}\p{N}_]{2,16}$/u.test(username)) {
					return showError('用户名需为 2–16 个字符，只能包含中文、字母、数字和下划线');
				}
				if (password.length < 6) return showError('密码至少 6 位');
				if (password !== field('confirm').value) return showError('两次输入的密码不一样');
			}

			showError('');
			submit.disabled = true;
			submit.classList.add('is-loading');
			try {
				const { user } = await api<{ user: Account }>(`/api/auth/${mode}`, { body: { username, password } });
				setAccount(user);
				toast(mode === 'register' ? `注册成功，欢迎你，${user.username}！` : `欢迎回来，${user.username}～`);
				await navigate(next);
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
