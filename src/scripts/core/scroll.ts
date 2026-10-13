// 滚动总线：全站只挂一个 scroll / resize 监听，用 rAF 节流后分发给各个订阅者。
// 各模块用 subscribeScroll(cb, signal) 订阅，不要自己再给 window 加 scroll 监听

let ticking = false;
const subscribers = new Set<(scrollY: number) => void>();

function onScroll() {
	if (ticking) return;
	ticking = true;
	requestAnimationFrame(() => {
		ticking = false;
		const sy = window.scrollY;
		subscribers.forEach((cb) => cb(sy));
	});
}

/** 整个会话只调用一次（在 ui.ts 里） */
export function setupScrollBus() {
	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('resize', onScroll, { passive: true });
}

/**
 * 跳到锚点时页面顶部留出的距离（html 的 scroll-padding-top，即顶栏高度 + 20px）。
 * 导航、目录的滚动高亮都用它算判断线，CSS 改了偏移这里自动跟着变
 */
export function anchorOffset() {
	return parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
}

/** 订阅滚动：立即用当前位置调用一次，换页（signal abort）时自动退订 */
export function subscribeScroll(cb: (scrollY: number) => void, signal: AbortSignal) {
	subscribers.add(cb);
	cb(window.scrollY);
	signal.addEventListener('abort', () => subscribers.delete(cb));
}
