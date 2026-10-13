// 浏览量：文章页打开时计一次并显示，文章卡片批量查询。接口不可用时（如 npm run dev）保持隐藏
import { $all } from '../core/dom';

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
	if (counter) {
		getJson(`/api/views?slug=${encodeURIComponent(counter.dataset.views ?? '')}`, { method: 'POST' }).then(
			(data: { count?: number } | null) => show(counter, data?.count),
		);
	}
	const cards = slots.filter((slot) => slot !== counter);
	if (cards.length) {
		const slugs = [...new Set(cards.map((slot) => slot.dataset.views ?? ''))];
		getJson(`/api/views?slugs=${slugs.map(encodeURIComponent).join(',')}`).then(
			(data: Record<string, number> | null) => cards.forEach((slot) => show(slot, data?.[slot.dataset.views ?? ''])),
		);
	}
}
