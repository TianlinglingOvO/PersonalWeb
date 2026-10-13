// 文章页：目录随阅读位置高亮、点目录平滑跳转，以及顶栏下沿的阅读进度条
import { $, $all } from '../core/dom';
import { anchorOffset, subscribeScroll } from '../core/scroll';

export function init(signal: AbortSignal) {
	initTableOfContents(signal);
	initReadingProgress(signal);
}

function initTableOfContents(signal: AbortSignal) {
	const tocContainers = $all('[data-toc]');
	if (!tocContainers.length) return;

	const links = $all<HTMLAnchorElement>('[data-toc-link]');
	if (!links.length) return;

	const headingItems = links
		.map((link) => {
			const slug = link.getAttribute('data-toc-link');
			const el = slug ? document.getElementById(slug) : null;
			return el ? { slug, el, link } : null;
		})
		.filter((item): item is { slug: string; el: HTMLElement; link: HTMLAnchorElement } => Boolean(item));

	if (!headingItems.length) return;

	const setActive = (slug: string) => {
		headingItems.forEach((item) => {
			const isActive = item.slug === slug;
			item.link.classList.toggle('is-active', isActive);
			if (isActive) {
				item.link.setAttribute('aria-current', 'location');
			} else {
				item.link.removeAttribute('aria-current');
			}
		});
	};

	let lockUntil = 0;

	// Click feedback on TOC items: smooth scroll and immediate active
	links.forEach((link) => {
		link.addEventListener(
			'click',
			(e) => {
				const slug = link.getAttribute('data-toc-link');
				if (slug) {
					setActive(slug);
					lockUntil = Date.now() + 850;
					const targetEl = document.getElementById(slug);
					if (targetEl) {
						e.preventDefault();
						targetEl.scrollIntoView({ behavior: 'smooth' });
						history.replaceState(null, '', `#${slug}`);
					}
				}
			},
			{ signal },
		);
	});

	subscribeScroll((scrollY) => {
		if (Date.now() < lockUntil) return;

		const docHeight = document.documentElement.scrollHeight;
		const winHeight = window.innerHeight;

		// Reached bottom of page: highlight last heading
		if (winHeight + scrollY >= docHeight - 60) {
			setActive(headingItems[headingItems.length - 1].slug);
			return;
		}

		// 判断线：小标题跳过去时停在 anchorOffset() 处，再往下留出一段舒适的阅读余量
		const readingLine = anchorOffset() + 60;
		let activeSlug = '';

		for (const item of headingItems) {
			const rect = item.el.getBoundingClientRect();
			if (rect.top <= readingLine) {
				activeSlug = item.slug;
			}
		}

		if (activeSlug) {
			setActive(activeSlug);
		} else if (scrollY < 200) {
			setActive(headingItems[0].slug);
		}
	}, signal);
}

// 文章阅读进度：正文顶部到达顶栏下沿时为 0，正文底部进入视口底部时为 1
function initReadingProgress(signal: AbortSignal) {
	const bar = $('[data-reading-progress] > span') as HTMLElement | null;
	const body = $('.article-page .prose') as HTMLElement | null;
	if (!bar || !body) return;
	subscribeScroll(() => {
		const headerH = ($('.site-header') as HTMLElement | null)?.offsetHeight ?? 0;
		const rect = body.getBoundingClientRect();
		const range = rect.height - (window.innerHeight - headerH);
		const p = range > 0 ? (headerH - rect.top) / range : 1;
		bar.style.transform = `scaleX(${Math.min(Math.max(p, 0), 1).toFixed(4)})`;
	}, signal);
}
