// 浏览量：文章页打开时计一次并显示，文章卡片批量查询。接口不可用时（如 npm run dev）保持隐藏
// 文章页在这些情况下只查询不计数：站长本人登录着；这个浏览器今天已经计过这篇（换了 IP 也不会重复算，服务端按 IP 去重兜底）
import { cachedAccount } from '../core/account';
import { $all } from '../core/dom';

const COUNTED_KEY = 'sutady:viewed';
// 北京时间的日期，和服务端的“同一天”一致
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

/** 这个浏览器今天已经计过数的文章 */
function countedToday(): string[] {
	try {
		const saved = JSON.parse(localStorage.getItem(COUNTED_KEY) ?? 'null');
		return saved?.day === today() && Array.isArray(saved.slugs) ? saved.slugs : [];
	} catch {
		return [];
	}
}

function markCounted(slug: string) {
	try {
		localStorage.setItem(COUNTED_KEY, JSON.stringify({ day: today(), slugs: [...new Set([...countedToday(), slug])] }));
	} catch {
		/* 隐私模式等情况下存不了，无所谓 */
	}
}

export function init(signal: AbortSignal) {
	const slots = $all<HTMLElement>('[data-views]');
	if (!slots.length) return;
	const show = (slot: HTMLElement, count?: number) => {
		if (!count) return;
		const num = slot.querySelector('[data-views-num]');
		if (num) num.textContent = count.toLocaleString('zh-CN');
		slot.title = `${count} 次阅读`;
		slot.hidden = false;
	};
	const getJson = (url: string, init?: RequestInit) =>
		fetch(url, { ...init, signal })
			.then((r) => (r.ok ? r.json() : null))
			.catch(() => null);

	const counter = slots.find((slot) => slot.hasAttribute('data-views-count'));
	const slug = counter?.dataset.views ?? '';
	const counting = counter && !cachedAccount()?.isAdmin && !countedToday().includes(slug) ? counter : undefined;
	if (counting) {
		const count = () =>
			getJson(`/api/views?slug=${encodeURIComponent(slug)}`, { method: 'POST' }).then((data: { count?: number } | null) => {
				if (data) markCounted(slug);
				show(counting, data?.count);
			});
		// 浏览器提前在后台加载页面时（如地址栏里还没按回车）脚本已经在跑，等真正打开了再计数
		if ((document as Document & { prerendering?: boolean }).prerendering) {
			document.addEventListener('prerenderingchange', count, { once: true, signal });
		} else {
			void count();
		}
	}
	const readers = slots.filter((slot) => slot !== counting);
	if (readers.length) {
		const slugs = [...new Set(readers.map((slot) => slot.dataset.views ?? ''))];
		getJson(`/api/views?slugs=${slugs.map(encodeURIComponent).join(',')}`).then(
			(data: Record<string, number> | null) => readers.forEach((slot) => show(slot, data?.[slot.dataset.views ?? ''])),
		);
	}
}
