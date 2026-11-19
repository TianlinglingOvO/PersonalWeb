// 浏览量：文章页打开时计一次并显示，文章卡片批量查询。接口不可用时（如 npm run dev）保持隐藏
// 文章页在这些情况下只查询不计数：站长本人登录着；这个浏览器今天已经计过这篇（换了 IP 也不会重复算，服务端按 IP 去重兜底）；
// 自动化浏览器或未打开到前台的标签页。仅以服务端返回的 day 锁定当天，避免客户端时钟偏快导致次日整天漏计
import { $all } from '../core/dom';
import { isAdminVisitor, isAutomated, whenPageVisible } from '../core/visitors';

const COUNTED_KEY = 'sutady:viewed';
// 北京时间的日期，和服务端的“同一天”一致
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

interface SavedViews {
	day: string;
	slugs: string[];
}

interface ViewResponse {
	count?: number;
	counted?: boolean;
	day?: string;
}

function readCounted(): SavedViews | null {
	try {
		const saved = JSON.parse(localStorage.getItem(COUNTED_KEY) ?? 'null');
		if (saved && typeof saved.day === 'string' && Array.isArray(saved.slugs)) {
			return { day: saved.day, slugs: saved.slugs.filter((s: unknown): s is string => typeof s === 'string') };
		}
	} catch {
		/* 隐私模式或存储损坏时忽略 */
	}
	return null;
}

/** 这个浏览器今天已经计过数的文章 */
function countedToday() {
	const saved = readCounted();
	return saved?.day === today() ? saved.slugs : [];
}

function markCounted(slug: string, day: string) {
	try {
		const saved = readCounted();
		const slugs = saved?.day === day ? saved.slugs : [];
		localStorage.setItem(COUNTED_KEY, JSON.stringify({ day, slugs: [...new Set([...slugs, slug])] }));
	} catch {
		/* 隐私模式等情况下存不了，无所谓 */
	}
}

export function init(signal: AbortSignal) {
	if (import.meta.env.DEV) return;
	const slots = $all<HTMLElement>('[data-views]');
	if (!slots.length) return;

	const show = (slot: HTMLElement, count?: number) => {
		if (!count) return;
		const num = slot.querySelector('[data-views-num]');
		if (num) num.textContent = count.toLocaleString('zh-CN');
		slot.title = `${count} 次阅读`;
		slot.hidden = false;
	};
	const fetchJson = <T>(url: string, init?: RequestInit): Promise<T | null> =>
		fetch(url, { credentials: 'same-origin', ...init })
			.then((r) => (r.ok ? (r.json() as Promise<T>) : null))
			.catch(() => null);
	const querySlots = (targets: HTMLElement[]) => {
		if (!targets.length) return;
		const slugs = [...new Set(targets.map((slot) => slot.dataset.views ?? '').filter(Boolean))];
		if (!slugs.length) return;
		void fetchJson<Record<string, number>>(`/api/views?slugs=${slugs.map(encodeURIComponent).join(',')}`, { signal }).then(
			(data) => targets.forEach((slot) => show(slot, data?.[slot.dataset.views ?? ''])),
		);
	};

	const counter = slots.find((slot) => slot.hasAttribute('data-views-count'));
	const slug = counter?.dataset.views ?? '';
	const shouldCount = Boolean(counter && slug && !isAutomated() && !countedToday().includes(slug));

	if (counter && shouldCount) {
		whenPageVisible(() => {
			void (async () => {
				if (await isAdminVisitor()) {
					if (!signal.aborted) querySlots([counter]);
					return;
				}
				if (signal.aborted) return;
				// keepalive + 不挂 signal：防止用户刚打开文章就快速切走导致服务端已计次但本地漏标
				const data = await fetchJson<ViewResponse>(`/api/views?slug=${encodeURIComponent(slug)}`, {
					method: 'POST',
					keepalive: true,
				});
				if (data?.day) markCounted(slug, data.day);
				if (!signal.aborted) show(counter, data?.count);
			})();
		}, signal);
	}

	const readers = slots.filter((slot) => slot !== counter || !shouldCount);
	querySlots(readers);
}
