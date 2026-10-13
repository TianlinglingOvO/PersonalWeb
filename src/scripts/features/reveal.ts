// 区块滚动进入视口时浮现（.reveal），区块内的卡片（[data-stagger] 的子元素）依次错落出场
import { $all } from '../core/dom';
import { prefersReducedMotion } from '../core/motion';

export function init(signal: AbortSignal) {
	const els = $all('.reveal');
	if (!els.length) return;
	// 区块内的卡片按顺序错落出场，延迟上限 8 个卡位
	$all<HTMLElement>('[data-stagger]').forEach((group) => {
		[...group.children].forEach((child, i) => {
			(child as HTMLElement).style.setProperty('--stagger-i', String(Math.min(i, 8)));
		});
	});
	if (prefersReducedMotion()) {
		els.forEach((el) => el.classList.add('is-visible'));
		return;
	}

	// Immediately mark elements already in viewport as visible to avoid first-paint flash
	const winHeight = window.innerHeight;
	els.forEach((el) => {
		const rect = el.getBoundingClientRect();
		if (rect.top < winHeight - 20 && rect.bottom > 0) {
			el.classList.add('is-visible');
		}
	});

	const io = new IntersectionObserver(
		(entries, obs) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					entry.target.classList.add('is-visible');
					obs.unobserve(entry.target);
				}
			});
		},
		{ threshold: 0.05, rootMargin: '0px 0px -30px 0px' },
	);

	els.forEach((el) => {
		if (!el.classList.contains('is-visible')) {
			io.observe(el);
		}
	});
	signal.addEventListener('abort', () => io.disconnect());
}
