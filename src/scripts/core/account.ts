// 登录状态（/api/auth/*，后端在 functions/）。整页加载只问一次服务器，ClientRouter 换页时复用；
// 登录 / 注册 / 退出后调用 setAccount，它会广播 account-change 事件让顶栏、评论区、登录页刷新
import { api } from './api';

export interface Account {
	username: string;
	isAdmin: boolean;
}

const ACCOUNT_KEY = 'sutady:account';
let accountRequest: Promise<Account | null> | null = null;

// 上次的登录状态记在本地，先用它渲染顶栏，避免“登录”闪一下再变成用户名
export function cachedAccount(): Account | null {
	try {
		return JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null');
	} catch {
		return null;
	}
}

function storeAccount(account: Account | null) {
	try {
		if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
		else localStorage.removeItem(ACCOUNT_KEY);
	} catch {
		/* 隐私模式等情况下存不了，无所谓 */
	}
}

/** 当前登录用户。整页加载只问一次服务器，ClientRouter 换页时复用 */
export function getAccount() {
	accountRequest ??= api<{ user: Account | null }>('/api/auth/me')
		.then(({ user }) => {
			storeAccount(user);
			return user;
		})
		.catch(() => cachedAccount());
	return accountRequest;
}

/** 登录 / 注册 / 退出后调用：更新缓存并通知顶栏、评论区、登录页刷新 */
export function setAccount(account: Account | null) {
	accountRequest = Promise.resolve(account);
	storeAccount(account);
	document.dispatchEvent(new CustomEvent('account-change'));
}

/** 头像上显示的字（用户名第一个字，英文转大写） */
export const initialOf = (name: string) => (Array.from(name)[0] ?? '?').toUpperCase();

/** 登录页地址，登录后回到当前页面（hash 用于回到页面上的某个位置，如 #comments） */
export const loginUrl = (hash = '') => `/login/?next=${encodeURIComponent(location.pathname + hash)}`;
