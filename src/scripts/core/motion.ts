// 通用动效工具。展开 / 收起一律要有动画（站长明确要求），统一用这里的函数，不要各自手写
export const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
// 高度变化用比较柔和的 ease-out（cubic），距离越长时间略长，避免第一帧就窜出一大截
export const EASE_HEIGHT = 'cubic-bezier(0.33, 1, 0.68, 1)';

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const heightAnims = new WeakMap<HTMLElement, Animation>();

const boxOf = (el: HTMLElement) => {
	const cs = getComputedStyle(el);
	return {
		height: `${el.getBoundingClientRect().height}px`,
		paddingTop: cs.paddingTop,
		paddingBottom: cs.paddingBottom,
		marginTop: cs.marginTop,
		marginBottom: cs.marginBottom,
	};
};

const durationFor = (distance: number) => Math.min(560, 280 + Math.abs(distance) * 0.15);

/**
 * 展开 / 收起：元素从当前高度滑到自然高度（open）或 0（收起，结束后调用 onClosed 真正隐藏）。
 * 内外边距一起缩放，结尾不会跳；动画中途再点会从当前位置折返。展开前调用方要先让元素可见。
 */
export function slide(el: HTMLElement, open: boolean, onClosed?: () => void) {
	const running = heightAnims.get(el);
	const from = running ? boxOf(el) : null;
	const fromOpacity = running ? getComputedStyle(el).opacity : open ? '0' : '1';
	running?.cancel();
	heightAnims.delete(el);
	el.style.overflow = '';
	if (prefersReducedMotion()) {
		if (!open) onClosed?.();
		return;
	}
	const natural = boxOf(el);
	const zero = { height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px' };
	const start = from ?? (open ? zero : natural);
	const end = open ? natural : zero;
	el.style.overflow = 'hidden';
	const anim = el.animate([{ ...start, opacity: fromOpacity }, { ...end, opacity: open ? 1 : 0 }], {
		duration: durationFor(parseFloat(end.height) - parseFloat(start.height)),
		easing: EASE_HEIGHT,
	});
	heightAnims.set(el, anim);
	anim.onfinish = () => {
		if (heightAnims.get(el) !== anim) return;
		heightAnims.delete(el);
		el.style.overflow = '';
		if (!open) onClosed?.();
	};
}

/**
 * 内容替换时（切分类、切月份、切标签）让容器高度平滑过渡到新高度：先量旧高度，执行 mutate，再量新高度。
 * 返回这次的动画（没有动画时返回 undefined）：要在高度到位后再滚动页面的，等 animation.finished 之后再滚，
 * 否则页面还没长高，滚动目标会被截断
 */
export function animateHeight(el: HTMLElement, mutate: () => void): Animation | undefined {
	const running = heightAnims.get(el);
	const from = el.getBoundingClientRect().height;
	running?.cancel();
	heightAnims.delete(el);
	mutate();
	if (prefersReducedMotion()) return;
	const to = el.getBoundingClientRect().height;
	if (Math.abs(to - from) < 1) return;
	el.style.overflow = 'clip';
	el.style.overflowClipMargin = '24px';
	const anim = el.animate([{ height: `${from}px` }, { height: `${to}px` }], {
		duration: durationFor(to - from),
		easing: EASE_HEIGHT,
	});
	heightAnims.set(el, anim);
	anim.onfinish = () => {
		if (heightAnims.get(el) !== anim) return;
		heightAnims.delete(el);
		el.style.overflow = '';
		el.style.overflowClipMargin = '';
	};
	return anim;
}

/** 左右轻轻晃一下，用于输错时的提示 */
export function shake(el: HTMLElement) {
	if (prefersReducedMotion()) return;
	el.animate(
		[
			{ transform: 'translateX(0)' },
			{ transform: 'translateX(-6px)' },
			{ transform: 'translateX(5px)' },
			{ transform: 'translateX(-3px)' },
			{ transform: 'translateX(0)' },
		],
		{ duration: 300, easing: 'ease-out' },
	);
}

/** 一组元素依次淡入上浮 */
export function staggerIn(els: Element[], step = 40) {
	if (prefersReducedMotion()) return;
	els.forEach((el, i) =>
		(el as HTMLElement).animate(
			[
				{ opacity: 0, transform: 'translateY(8px)' },
				{ opacity: 1, transform: 'none' },
			],
			{ duration: 320, delay: Math.min(i, 8) * step, easing: EASE_OUT, fill: 'backwards' },
		),
	);
}
