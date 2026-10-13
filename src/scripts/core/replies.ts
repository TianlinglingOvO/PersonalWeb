// 回复提醒：别人回复我的最近 10 条（/api/replies，规则见 functions/api/replies.ts）。
// “已读到哪”记在浏览器的 localStorage 里（按用户名区分），不改数据库表；换了设备会把最近的回复再提醒一次。
// 整页加载只请求一次，ClientRouter 换页时复用；登录的账号变了会自动重新请求。
// 看过（打开账号页）后调用 markRepliesSeen，它会广播 replies-change，让顶栏的小红点刷新
import { api } from './api';
import { getAccount, type Account } from './account';

export interface ReplyItem {
	id: number;
	slug: string;
	from: Account;
	content: string;
	createdAt: number;
}

let cache: { username: string; request: Promise<ReplyItem[]> } | null = null;

const seenKey = (account: Account) => `sutady:replies-seen:${account.username.toLowerCase()}`;

/** 已经看过的最新一条回复的时间（秒），没看过时是 0 */
export function repliesSeenAt(account: Account) {
	try {
		return Number(localStorage.getItem(seenKey(account))) || 0;
	} catch {
		return 0;
	}
}

/** 当前账号收到的最近回复（新的在前）；未登录或接口不可用时是空数组 */
export async function getReplies(): Promise<ReplyItem[]> {
	const account = await getAccount();
	if (!account) return [];
	if (cache?.username !== account.username) {
		cache = {
			username: account.username,
			request: api<{ items: ReplyItem[] }>('/api/replies')
				.then((data) => data.items)
				.catch(() => []),
		};
	}
	return cache.request;
}

/** 还没看过的回复条数 */
export async function unreadReplies() {
	const account = await getAccount();
	if (!account) return 0;
	const seen = repliesSeenAt(account);
	return (await getReplies()).filter((item) => item.createdAt > seen).length;
}

/** 标记为已读（记下最新一条的时间），并通知顶栏刷新 */
export function markRepliesSeen(account: Account, items: ReplyItem[]) {
	const latest = Math.max(repliesSeenAt(account), ...items.map((item) => item.createdAt));
	try {
		localStorage.setItem(seenKey(account), String(latest));
	} catch {
		/* 隐私模式等情况下存不了：下次还会提醒，无所谓 */
	}
	document.dispatchEvent(new CustomEvent('replies-change'));
}
