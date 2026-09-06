let pageAbort: AbortController | null = null;

function $(selector: string, root: ParentNode = document) {
	return root.querySelector(selector);
}

function $all<T extends Element>(selector: string, root: ParentNode = document) {
	return [...root.querySelectorAll<T>(selector)];
}

function toast(message: string) {
	const host = document.getElementById('toast-host');
	if (!host) return;
	const el = document.createElement('div');
	el.className = 'toast';
	el.setAttribute('role', 'status');
	el.textContent = message;
	host.appendChild(el);
	requestAnimationFrame(() => el.classList.add('is-in'));
	window.setTimeout(() => {
		el.classList.remove('is-in');
		el.addEventListener('transitionend', () => el.remove(), { once: true });
		window.setTimeout(() => el.remove(), 400);
	}, 1800);
}

async function copyText(text: string) {
	try {
		await navigator.clipboard.writeText(text);
		toast('已复制');
	} catch {
		toast('复制失败，请手动选择');
	}
}

function setNavOpen(open: boolean) {
	const toggle = $('[data-nav-toggle]') as HTMLButtonElement | null;
	const panel = $('[data-nav-panel]');
	const backdrop = $('[data-nav-backdrop]');
	if (!toggle || !panel) return;
	toggle.setAttribute('aria-expanded', String(open));
	panel.classList.toggle('is-open', open);
	backdrop?.classList.toggle('is-open', open);
	document.body.classList.toggle('nav-open', open);
}

function initHeader(signal: AbortSignal) {
	const header = $('.site-header') as HTMLElement | null;
	if (!header) return;
	const onScroll = () => {
		header.classList.toggle('is-scrolled', window.scrollY > 10);
	};
	onScroll();
	window.addEventListener('scroll', onScroll, { passive: true, signal });
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

	let ticking = false;
	const onScroll = () => {
		if (ticking) return;
		ticking = true;
		requestAnimationFrame(() => {
			ticking = false;
			const scrollY = window.scrollY;
			const docHeight = document.documentElement.scrollHeight;
			const winHeight = window.innerHeight;

			// Reached bottom of page: highlight last section (Connect)
			if (winHeight + scrollY >= docHeight - 40) {
				setActive(sectionItems[sectionItems.length - 1].id);
				return;
			}

			// Reading line offset accounting for sticky header
			const readingLine = 120;
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
		});
	};

	onScroll();
	window.addEventListener('scroll', onScroll, { passive: true, signal });
	window.addEventListener('resize', onScroll, { passive: true, signal });
}

function initReveal(signal: AbortSignal) {
	const els = $all('.reveal');
	if (!els.length) return;
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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

function initArticleFilter(signal: AbortSignal) {
	const toolbars = $all('[data-article-filter]');
	if (!toolbars.length) return;

	toolbars.forEach((toolbar) => {
		const root = toolbar.closest('section') ?? toolbar.parentElement;
		if (!root) return;
		const cards = $all<HTMLElement>('[data-article-list] [data-category]', root);
		const empty = $('[data-article-empty]', root) as HTMLElement | null;
		const chips = $all<HTMLButtonElement>('[data-filter]', toolbar);

		const apply = (value: string) => {
			chips.forEach((chip) => {
				const on = chip.getAttribute('data-filter') === value;
				chip.classList.toggle('is-active', on);
				chip.setAttribute('aria-pressed', String(on));
			});
			let visible = 0;
			cards.forEach((card) => {
				const match = value === 'all' || card.getAttribute('data-category') === value;
				card.hidden = !match;
				if (match) visible += 1;
			});
			if (empty) empty.hidden = visible > 0;
		};

		toolbar.addEventListener(
			'click',
			(event) => {
				const chip = (event.target as HTMLElement | null)?.closest('[data-filter]');
				if (!chip) return;
				apply(chip.getAttribute('data-filter') ?? 'all');
			},
			{ signal },
		);
	});
}

function initBackToTop(signal: AbortSignal) {
	const btn = $('[data-back-to-top]') as HTMLButtonElement | null;
	if (!btn) return;
	const onScroll = () => {
		btn.classList.toggle('is-visible', window.scrollY > 640);
	};
	onScroll();
	window.addEventListener('scroll', onScroll, { passive: true, signal });
}

function scrollToHash() {
	const id = decodeURIComponent(location.hash.replace('#', ''));
	if (!id) return;
	document.getElementById(id)?.scrollIntoView();
}

function onClick(event: Event) {
	const target = event.target as HTMLElement | null;
	if (!target) return;

	const toggle = target.closest('[data-nav-toggle]');
	if (toggle) {
		const open = toggle.getAttribute('aria-expanded') !== 'true';
		setNavOpen(open);
		return;
	}

	if (target.closest('[data-nav-backdrop]') || target.closest('[data-nav-link]')) {
		setNavOpen(false);
	}

	const copyBtn = target.closest('[data-copy]');
	if (copyBtn) {
		const text = copyBtn.getAttribute('data-copy') ?? '';
		if (text) void copyText(text);
		return;
	}

	const openBtn = target.closest('[data-dialog-open]');
	if (openBtn) {
		const id = openBtn.getAttribute('data-dialog-open');
		const dialog = id ? (document.getElementById(id) as HTMLDialogElement | null) : null;
		dialog?.showModal();
		return;
	}

	const closeBtn = target.closest('[data-dialog-close]');
	if (closeBtn) {
		closeBtn.closest('dialog')?.close();
		return;
	}

	if (target.tagName === 'DIALOG') {
		(target as HTMLDialogElement).close();
		return;
	}

	if (target.closest('[data-back-to-top]')) {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}
}

function onKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') setNavOpen(false);
}

function initPage() {
	pageAbort?.abort();
	pageAbort = new AbortController();
	const { signal } = pageAbort;
	initHeader(signal);
	initScrollSpy(signal);
	initReveal(signal);
	initArticleFilter(signal);
	initBackToTop(signal);
	scrollToHash();
}

document.addEventListener('click', onClick);
document.addEventListener('keydown', onKeydown);
document.addEventListener('astro:page-load', initPage);
initPage();
