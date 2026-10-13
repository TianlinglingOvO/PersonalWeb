// 顶栏：手机端抽屉菜单的开关、滚动后加阴影、导航随滚动高亮当前区块、回到顶部按钮
import { $, $all } from '../core/dom';
import { anchorOffset, subscribeScroll } from '../core/scroll';

function onNavTouchMove(e: TouchEvent) {
	const panel = $('[data-nav-panel]');
	if (panel && panel.contains(e.target as Node)) {
		return;
	}
	e.preventDefault();
}

export function setNavOpen(open: boolean) {
	const toggle = $('[data-nav-toggle]') as HTMLButtonElement | null;
	const panel = $('[data-nav-panel]');
	const backdrop = $('[data-nav-backdrop]');
	if (!toggle || !panel) return;
	toggle.setAttribute('aria-expanded', String(open));
	panel.classList.toggle('is-open', open);
	backdrop?.classList.toggle('is-open', open);
	document.documentElement.classList.toggle('nav-open', open);
	document.body.classList.toggle('nav-open', open);

	if (open) {
		document.addEventListener('touchmove', onNavTouchMove, { passive: false });
	} else {
		document.removeEventListener('touchmove', onNavTouchMove);
	}
}

export function setup() {
	document.addEventListener('click', (event) => {
		const target = event.target as HTMLElement | null;
		if (!target) return;

		const toggle = target.closest('[data-nav-toggle]');
		if (toggle) {
			setNavOpen(toggle.getAttribute('aria-expanded') !== 'true');
			return;
		}

		// 点了菜单里的链接、遮罩或账号操作：先把手机菜单收起来
		if (target.closest('[data-nav-backdrop], [data-nav-link], [data-account-login], [data-logout], [data-close-account]')) {
			setNavOpen(false);
		}

		if (target.closest('[data-back-to-top]')) {
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') setNavOpen(false);
	});
}

export function init(signal: AbortSignal) {
	initHeader(signal);
	initScrollSpy(signal);
	initBackToTop(signal);
}

function initHeader(signal: AbortSignal) {
	const header = $('.site-header') as HTMLElement | null;
	const backdrop = $('[data-nav-backdrop]');
	if (backdrop) {
		backdrop.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false, signal });
	}
	if (!header) return;
	subscribeScroll((sy) => {
		header.classList.toggle('is-scrolled', sy > 10);
	}, signal);
}

function initScrollSpy(signal: AbortSignal) {
	const links = $all<HTMLAnchorElement>('[data-nav-panel] [data-nav-link]');
	const sectionItems = links
		.map((link) => {
			const href = link.getAttribute('href') ?? '';
			const id = href.split('#')[1];
			const el = id ? document.getElementById(id) : null;
			return el ? { id, el, link } : null;
		})
		.filter((item): item is { id: string; el: HTMLElement; link: HTMLAnchorElement } => Boolean(item));
	if (!sectionItems.length) return;

	const setActive = (id: string) => {
		sectionItems.forEach((item) => {
			item.link.classList.toggle('is-active', item.id === id);
		});
	};

	let lockUntil = 0;

	// Instant feedback on click: switch active pill immediately and lock during smooth scroll
	links.forEach((link) => {
		link.addEventListener(
			'click',
			() => {
				const href = link.getAttribute('href') ?? '';
				const id = href.split('#')[1];
				if (id) {
					setActive(id);
					lockUntil = Date.now() + 850;
				}
			},
			{ signal },
		);
	});

	subscribeScroll((scrollY) => {
		if (Date.now() < lockUntil) return;

		const docHeight = document.documentElement.scrollHeight;
		const winHeight = window.innerHeight;

		// Reached bottom of page: highlight last section (Connect)
		if (winHeight + scrollY >= docHeight - 40) {
			setActive(sectionItems[sectionItems.length - 1].id);
			return;
		}

		// 判断线：跳到区块时区块顶部停在 anchorOffset() 处，再往下留一点余量
		const readingLine = anchorOffset() + 32;
		let activeId = '';

		for (const item of sectionItems) {
			const rect = item.el.getBoundingClientRect();
			if (rect.top <= readingLine) {
				activeId = item.id;
			}
		}

		if (activeId) {
			setActive(activeId);
		} else if (scrollY < 100) {
			setActive('');
		}
	}, signal);
}

function initBackToTop(signal: AbortSignal) {
	const btn = $('[data-back-to-top]') as HTMLButtonElement | null;
	if (!btn) return;
	subscribeScroll((sy) => {
		btn.classList.toggle('is-visible', sy > 640);
	}, signal);
}
