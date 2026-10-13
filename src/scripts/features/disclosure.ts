// <details> 折叠块（服务卡片“展开说明”、手机端文章目录）：展开 / 收起都带滑动动画
import { $all } from '../core/dom';
import { slide } from '../core/motion';

export function init(signal: AbortSignal) {
	$all<HTMLDetailsElement>('.service-card details, .mobile-toc-details').forEach((details) => {
		const summary = details.querySelector('summary');
		const content = details.querySelector<HTMLElement>(':scope > :not(summary)');
		if (!summary || !content) return;
		summary.addEventListener(
			'click',
			(e) => {
				e.preventDefault();
				const open = !details.open || details.classList.contains('is-closing');
				details.classList.toggle('is-closing', !open);
				details.open = true;
				slide(content, open, () => {
					details.open = false;
					details.classList.remove('is-closing');
				});
			},
			{ signal },
		);
	});
}
