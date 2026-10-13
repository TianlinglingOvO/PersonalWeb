// 文章图片点击放大：原生 <dialog>，点任意处或按 Esc 关闭，打开 / 关闭都有过渡（减少动态效果时直接切换）。
// 键盘也能用：Tab 到图片上按回车或空格打开。图片懒加载和宽高由构建时的 src/lib/markdown-images.mjs 处理
import { $all } from '../core/dom';
import { prefersReducedMotion } from '../core/motion';

const IMAGES = '.article-page .prose img';

/** 正文里可以放大的图片（包在链接里的图片点了是跳转，不放大） */
const zoomable = (el: EventTarget | null) => {
	const img = (el as HTMLElement | null)?.closest?.<HTMLImageElement>(IMAGES);
	return img && !img.closest('a') ? img : null;
};

function open(img: HTMLImageElement) {
	const dialog = document.createElement('dialog');
	dialog.className = 'lightbox';
	dialog.setAttribute('aria-label', img.alt ? `大图：${img.alt}` : '查看大图');
	const figure = document.createElement('figure');
	figure.className = 'lightbox-figure';
	const big = document.createElement('img');
	big.className = 'lightbox-img';
	big.src = img.currentSrc || img.src;
	big.alt = img.alt;
	figure.append(big);
	if (img.alt) {
		const caption = document.createElement('figcaption');
		caption.className = 'lightbox-caption';
		caption.textContent = img.alt;
		figure.append(caption);
	}
	const close = document.createElement('button');
	close.type = 'button';
	close.className = 'lightbox-close';
	close.setAttribute('aria-label', '关闭大图');
	dialog.append(figure, close);
	document.body.append(dialog);

	let closing = false;
	const finish = () => {
		if (closing) return;
		closing = true;
		const remove = () => {
			dialog.close();
			dialog.remove();
			img.focus({ preventScroll: true });
		};
		if (prefersReducedMotion()) return remove();
		dialog.classList.add('is-closing');
		figure.addEventListener('animationend', remove, { once: true });
		window.setTimeout(remove, 300);
	};
	// 大图、背景、关闭按钮，点哪里都关闭
	dialog.addEventListener('click', finish);
	dialog.addEventListener('cancel', (e) => {
		e.preventDefault();
		finish();
	});
	dialog.showModal();
	close.focus({ preventScroll: true });
}

export function setup() {
	document.addEventListener('click', (event) => {
		const img = zoomable(event.target);
		if (img) open(img);
	});
	document.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		const img = zoomable(event.target);
		if (!img) return;
		event.preventDefault();
		open(img);
	});
}

export function init() {
	// 让图片能用键盘聚焦，读屏软件也知道它可以点
	$all<HTMLImageElement>(IMAGES).forEach((img) => {
		if (img.closest('a')) return;
		img.tabIndex = 0;
		img.setAttribute('role', 'button');
		img.setAttribute('aria-label', img.alt ? `放大查看：${img.alt}` : '放大查看图片');
	});
}
