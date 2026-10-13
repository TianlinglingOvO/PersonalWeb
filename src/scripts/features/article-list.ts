// 文章列表页的分类筛选：切换分类时区块高度平滑过渡，留下的卡片依次浮现
import { $, $all } from '../core/dom';
import { animateHeight, staggerIn } from '../core/motion';

export function init(signal: AbortSignal) {
	$all<HTMLElement>('[data-article-controller]').forEach((ctrl) => {
		const cards = $all<HTMLElement>('[data-article-list] [data-category]', ctrl);
		const chips = $all<HTMLButtonElement>('[data-filter]', ctrl);
		const empty = $('[data-article-empty]', ctrl) as HTMLElement | null;

		chips.forEach((chip) =>
			chip.addEventListener(
				'click',
				() => {
					const filter = chip.dataset.filter ?? 'all';
					chips.forEach((c) => {
						c.classList.toggle('is-active', c === chip);
						c.setAttribute('aria-pressed', String(c === chip));
					});
					animateHeight(ctrl, () => {
						let shown = 0;
						cards.forEach((card) => {
							card.hidden = filter !== 'all' && card.dataset.category !== filter;
							if (!card.hidden) shown++;
						});
						if (empty) empty.hidden = shown > 0;
					});
					staggerIn(cards.filter((card) => !card.hidden), 45);
				},
				{ signal },
			),
		);
	});
}
