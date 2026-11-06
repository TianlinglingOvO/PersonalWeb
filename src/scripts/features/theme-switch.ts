// 主题：顶栏开关切换主题（带换色动画）、换页时保持当前主题
import { TransitionBeforeSwapEvent } from 'astro:transitions/client';
import { $all } from '../core/dom';
import { prefersReducedMotion } from '../core/motion';
import { currentTheme, setTheme } from '../core/theme';

interface ThemeMeta {
	id: string;
	name: string;
	credit: string;
}

/** 换上新主题后，最多等屏幕内的插画加载多久再开始推过去（这段时间画面是静止的，所以要短） */
const IMAGE_WAIT = 300;
/** 换色幕布那段动画所在的伪元素，倒放、判断方向都看它 */
const SWEEP = '::view-transition-new(root)';

/**
 * 正在进行的换色：from → to。ready 之前（还在等插画）不响应再次点击；
 * ready 之后再点开关，所有过场动画原路倒放，倒放到头再把主题改回 from。
 */
let active: { from: string; ready: boolean } | null = null;

const switchEl = () => document.querySelector<HTMLButtonElement>('[data-theme-switch]');

function themeList(): ThemeMeta[] {
	try {
		return JSON.parse(switchEl()?.dataset.themes ?? '[]');
	} catch {
		return [];
	}
}

function nextTheme(list: ThemeMeta[]) {
	const i = list.findIndex((t) => t.id === currentTheme());
	return list[(i + 1) % list.length];
}

/** 开关的提示文字和读屏文字跟着当前主题变 */
function updateLabel() {
	const button = switchEl();
	const list = themeList();
	const current = list.find((t) => t.id === currentTheme());
	if (!button || !current) return;
	const next = nextTheme(list);
	button.setAttribute('aria-label', `切换主题，当前：${current.name}，点击换成${next.name}`);
	button.title = `切换主题（当前：${current.name}）${current.credit ? `\n${current.credit}` : ''}`;
}

/** 某套主题在当前页面要显示的插画（404 页一组里随机选中的那张之外的不算） */
const imagesOf = (theme: string) =>
	$all<HTMLImageElement>(`img[data-theme-only="${CSS.escape(theme)}"]`).filter((img) => !img.hidden);

const timeout = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const loaded = (img: HTMLImageElement) =>
	img.complete && img.naturalWidth > 0
		? Promise.resolve()
		: new Promise<void>((resolve) => {
				img.addEventListener('load', () => resolve(), { once: true });
				img.addEventListener('error', () => resolve(), { once: true });
			});

// 提前把另一套主题的插画下载进缓存：电脑上鼠标移到开关上就开始，手机上手指碰到时才开始
const preloaded = new Map<string, Promise<unknown>>();
function preload(theme: string) {
	let task = preloaded.get(theme);
	if (!task) {
		task = Promise.all(
			imagesOf(theme).map(async (img) => {
				const probe = new Image();
				probe.src = img.currentSrc || img.src;
				await probe.decode().catch(() => undefined);
			}),
		);
		preloaded.set(theme, task);
	}
	return task;
}

/**
 * 新主题下出现在屏幕里的插画：等它们加载完再开始动画，免得推过去是一块空白。
 * 换色动画准备期间浏览器暂停绘制，懒加载图片不会自己开始加载，所以屏幕内的几张改成立即加载
 * （鼠标移到开关上时已经下载进缓存，通常瞬间完成）
 */
function visibleImagesReady(theme: string) {
	const inView = imagesOf(theme).filter((img) => {
		const rect = img.getBoundingClientRect();
		return rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0;
	});
	for (const img of inView) img.loading = 'eager';
	return Promise.all(inView.map(loaded));
}

/** 这次换色的所有过场动画（整页幕布、滑块的滑动和淡入淡出） */
const transitionAnimations = () =>
	document.getAnimations().filter((a) => {
		const effect = a.effect as KeyframeEffect | null;
		return effect?.target === document.documentElement && effect.pseudoElement?.startsWith('::view-transition');
	});

/** 动画进行中又点了开关：原路倒放（再点一次又正放），返回是否处理了 */
function reverseActive() {
	if (!active?.ready) return Boolean(active);
	const animations = transitionAnimations();
	if (!animations.some((a) => (a.effect as KeyframeEffect).pseudoElement === SWEEP)) return true;
	for (const a of animations) a.reverse();
	return true;
}

async function switchTheme() {
	if (reverseActive()) return;
	const list = themeList();
	if (list.length < 2) return;
	const from = currentTheme();
	const next = nextTheme(list);
	const apply = (id: string) => {
		setTheme(id);
		updateLabel();
	};

	if (prefersReducedMotion() || !document.startViewTransition) {
		apply(next.id);
		return;
	}

	const root = document.documentElement;
	const forward = list.indexOf(next) > list.findIndex((t) => t.id === from);
	root.dataset.themeSweep = forward ? 'forward' : 'back';
	root.classList.add('theme-switching');
	const state = { from, ready: false };
	active = state;
	try {
		const transition = document.startViewTransition(async () => {
			apply(next.id);
			await Promise.race([visibleImagesReady(next.id), timeout(IMAGE_WAIT)]);
		});
		await transition.ready.then(
			() => {
				state.ready = true;
				const sweep = transitionAnimations().find((a) => (a.effect as KeyframeEffect).pseudoElement === SWEEP);
				// 倒放到头时新画面已经完全藏起来了，这时把主题改回去，换色动画随即结束，看不出跳变
				sweep?.addEventListener('finish', () => {
					if (sweep.playbackRate < 0) apply(state.from);
				});
			},
			() => undefined,
		);
		await transition.finished;
	} finally {
		if (active === state) {
			active = null;
			root.classList.remove('theme-switching');
			delete root.dataset.themeSweep;
		}
	}
}

/** 换色动画进行时，浏览器把所有点击都算在 <html> 上，只能按坐标判断是不是点在开关上 */
function hitsSwitch(e: MouseEvent) {
	const rect = switchEl()?.getBoundingClientRect();
	return Boolean(
		rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom,
	);
}

export function setup() {
	document.addEventListener('click', (e) => {
		const target = e.target as Element | null;
		if (target?.closest('[data-theme-switch]') || (active && target === document.documentElement && hitsSwitch(e))) {
			void switchTheme();
		}
	});

	const warmUp = (e: Event) => {
		if (!(e.target as Element | null)?.closest?.('[data-theme-switch]')) return;
		const next = nextTheme(themeList());
		if (next) void preload(next.id);
	};
	document.addEventListener('pointerover', warmUp);
	document.addEventListener('focusin', warmUp);

	// 换页时新页面 <html> 上的属性会整体覆盖到当前页面，而新页面写的是默认主题，
	// 所以在替换前把当前主题写到新文档上，否则换页会闪回默认主题
	document.addEventListener('astro:before-swap', (e) => {
		if (e instanceof TransitionBeforeSwapEvent) e.newDocument.documentElement.dataset.theme = currentTheme();
	});
}

export function init() {
	// 新页面的插画不同，预加载记录作废
	preloaded.clear();
	updateLabel();
}
