// 换页过场：顶部换页进度条、从文章卡片进入文章页的“卡片展开”效果、换页时的滚动修正
import { TransitionBeforePreparationEvent, TransitionBeforeSwapEvent } from 'astro:transitions/client';

export function setup() {
	initPageProgressBar();
	initArticleMorph();

	// 换页时 Astro 会立刻 scrollTo 到新页面该在的位置（后退时恢复原来的位置），而 html 开了平滑滚动，
	// 这一下就会变成动画：后退回首页时页面从顶部一路滚到原来的位置。替换页面的这一刻临时关掉平滑滚动。
	// 新文档 <html> 上的属性会在替换时整体覆盖到当前页面，所以写在 newDocument 上
	document.addEventListener('astro:before-swap', (e) => {
		if (e instanceof TransitionBeforeSwapEvent) e.newDocument.documentElement.style.scrollBehavior = 'auto';
	});
	document.addEventListener('astro:after-swap', () => {
		const root = document.documentElement;
		root.style.removeProperty('scroll-behavior');
		if (!root.getAttribute('style')) root.removeAttribute('style');
		// 同理，head 里给 <html> 加 js 标记的内联脚本换页时不会重跑，要在这里补回，
		// 否则 html.js 相关样式（入场动画、时间线年份面板）全部失效
		root.classList.add('js');
	});
}

// 顶部换页进度条：0.15 秒内完成的换页（多半是命中了预加载缓存）不显示；
// 等待期间进度条一直缓慢前进（越接近 90% 越慢），不会停在某处看起来像卡住；加载完冲到 100% 再淡出
function initPageProgressBar() {
	let showTimer = 0;
	let trickleTimer = 0;
	let value = 0;
	const bar = () => document.getElementById('page-progress');
	const set = (width: number) => {
		value = width;
		const el = bar();
		if (el) el.style.width = `${width}%`;
	};

	document.addEventListener('astro:before-preparation', () => {
		window.clearTimeout(showTimer);
		window.clearInterval(trickleTimer);
		const el = bar();
		if (!el) return;
		el.classList.remove('is-loaded', 'is-loading');
		set(0);
		showTimer = window.setTimeout(() => {
			el.classList.add('is-loading');
			set(25);
			trickleTimer = window.setInterval(() => set(value + (90 - value) * 0.08), 200);
		}, 150);
	});

	document.addEventListener('astro:after-preparation', () => {
		window.clearTimeout(showTimer);
		window.clearInterval(trickleTimer);
		const el = bar();
		if (!el || !el.classList.contains('is-loading')) return;
		el.classList.remove('is-loading');
		el.classList.add('is-loaded');
		set(100);
		window.setTimeout(() => {
			el.classList.remove('is-loaded');
			set(0);
		}, 450);
	});
}

// 从文章卡片进入文章页时，让卡片和文章主体共用一个 view-transition-name，形成“卡片展开”过场。
// 名字只在这条路径上临时添加、过场结束即移除，文章之间切换仍保留原来的翻页效果。
function initArticleMorph() {
	const MORPH = 'article-morph';
	let card: HTMLElement | null = null;

	document.addEventListener('astro:before-preparation', (e) => {
		card?.style.removeProperty('view-transition-name');
		const source = e instanceof TransitionBeforePreparationEvent ? e.sourceElement : undefined;
		card = source?.closest<HTMLElement>('a.card-link[href^="/articles/"]') ?? null;
		card?.style.setProperty('view-transition-name', MORPH);
	});

	document.addEventListener('astro:before-swap', (e) => {
		if (!card || !(e instanceof TransitionBeforeSwapEvent)) return;
		card = null;
		const { newDocument, viewTransition } = e;
		const page = newDocument.querySelector<HTMLElement>('.article-page');
		if (!page) return;
		page.style.setProperty('view-transition-name', MORPH);
		const cleanup = () => page.style.removeProperty('view-transition-name');
		if (viewTransition) viewTransition.finished.finally(cleanup);
		else cleanup();
	});
}
