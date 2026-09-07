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

	let ticking = false;
	const onScroll = () => {
		if (ticking) return;
		ticking = true;
		requestAnimationFrame(() => {
			ticking = false;
			if (Date.now() < lockUntil) return;

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

	let ticking = false;
	const onScroll = () => {
		if (ticking) return;
		ticking = true;
		requestAnimationFrame(() => {
			ticking = false;
			if (Date.now() < lockUntil) return;

			const scrollY = window.scrollY;
			const docHeight = document.documentElement.scrollHeight;
			const winHeight = window.innerHeight;

			// Reached bottom of page: highlight last heading
			if (winHeight + scrollY >= docHeight - 60) {
				setActive(headingItems[headingItems.length - 1].slug);
				return;
			}

			// Reading line offset accounting for header + comfortable reading margin
			const readingLine = 150;
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
				card.style.display = match ? '' : 'none';
				if (match) visible += 1;
			});
			if (empty) {
				empty.hidden = visible > 0;
				empty.style.display = visible > 0 ? 'none' : '';
			}
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

function initHomepageArticleExpand(signal: AbortSignal) {
	const toggleBtns = $all<HTMLButtonElement>('[data-articles-toggle]');
	if (!toggleBtns.length) return;

	toggleBtns.forEach((btn) => {
		const root = btn.closest('section') ?? btn.parentElement;
		if (!root) return;
		const grid = root.querySelector('[data-article-list]') as HTMLElement | null;
		if (!grid) return;

		const remaining = btn.getAttribute('data-remaining') ?? '';
		const textSpan = btn.querySelector('.expand-btn-text') as HTMLElement | null;

		btn.addEventListener(
			'click',
			() => {
				const isExpanded = grid.classList.toggle('is-expanded');
				btn.setAttribute('aria-expanded', String(isExpanded));
				btn.classList.toggle('is-active', isExpanded);
				if (textSpan) {
					textSpan.textContent = isExpanded
						? '收起文章 ↑'
						: `展开更多文章${remaining ? ` (还有 ${remaining} 篇)` : ''} ↓`;
				}
			},
			{ signal },
		);
	});
}

function initSidebarNavFilterAndCollapse(signal: AbortSignal) {
	const layout = $('[data-article-layout]') as HTMLElement | null;
	const collapseBtn = $('[data-sidebar-collapse]') as HTMLButtonElement | null;
	const expandBtn = $('[data-sidebar-expand]') as HTMLButtonElement | null;
	const select = $('[data-sidebar-category-filter]') as HTMLSelectElement | null;
	const items = $all<HTMLElement>('[data-sidebar-item]');
	const emptyHint = $('[data-sidebar-empty]') as HTMLElement | null;

	// 1. 下拉分类筛选
	if (select && items.length) {
		select.addEventListener(
			'change',
			() => {
				const selectedCat = select.value;
				let visible = 0;
				items.forEach((item) => {
					const match = selectedCat === 'all' || item.getAttribute('data-sidebar-category') === selectedCat;
					item.hidden = !match;
					item.style.display = match ? '' : 'none';
					if (match) visible++;
				});
				if (emptyHint) {
					emptyHint.hidden = visible > 0;
					emptyHint.style.display = visible > 0 ? 'none' : 'block';
				}
			},
			{ signal },
		);
	}

	// 2. 侧栏展开与收起联动
	if (layout && (collapseBtn || expandBtn)) {
		const setCollapsed = (collapsed: boolean) => {
			layout.classList.toggle('is-sidebar-collapsed', collapsed);
			try {
				localStorage.setItem('article_sidebar_collapsed', collapsed ? '1' : '0');
			} catch {}
		};

		try {
			if (window.innerWidth > 1180 && localStorage.getItem('article_sidebar_collapsed') === '1') {
				layout.classList.add('is-sidebar-collapsed');
			}
		} catch {}

		collapseBtn?.addEventListener('click', () => setCollapsed(true), { signal });
		expandBtn?.addEventListener('click', () => setCollapsed(false), { signal });
	}
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
		return;
	}

	const anchor = target.closest('a');
	if (anchor && anchor.origin && anchor.origin !== window.location.origin) {
		anchor.target = '_blank';
		anchor.rel = 'noopener noreferrer';
	}
}

function onKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') setNavOpen(false);
}

function initDetailsAnimation(signal: AbortSignal) {
	const detailsList = $all<HTMLDetailsElement>('.service-card details');
	if (!detailsList.length) return;

	detailsList.forEach((details) => {
		const summary = details.querySelector('summary');
		const prose = details.querySelector('.prose') as HTMLElement | null;
		if (!summary || !prose) return;

		let animation: Animation | null = null;
		let isClosing = false;
		let isExpanding = false;

		summary.addEventListener(
			'click',
			(e) => {
				e.preventDefault();
				if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
					details.open = !details.open;
					return;
				}

				if (isClosing || !details.open) {
					if (isClosing && animation) animation.cancel();
					isClosing = false;
					isExpanding = true;

					details.open = true;
					const startHeight = 0;
					const endHeight = prose.scrollHeight;

					animation = prose.animate(
						[
							{ height: `${startHeight}px`, opacity: 0, transform: 'translateY(-6px)' },
							{ height: `${endHeight}px`, opacity: 1, transform: 'translateY(0)' },
						],
						{
							duration: 300,
							easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
						},
					);

					animation.onfinish = () => {
						isExpanding = false;
						animation = null;
						prose.style.height = '';
					};
				} else if (isExpanding || details.open) {
					if (isExpanding && animation) animation.cancel();
					isExpanding = false;
					isClosing = true;

					const startHeight = prose.offsetHeight;
					const endHeight = 0;

					animation = prose.animate(
						[
							{ height: `${startHeight}px`, opacity: 1, transform: 'translateY(0)' },
							{ height: `${endHeight}px`, opacity: 0, transform: 'translateY(-6px)' },
						],
						{
							duration: 260,
							easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
						},
					);

					animation.onfinish = () => {
						details.open = false;
						isClosing = false;
						animation = null;
						prose.style.height = '';
					};
				}
			},
			{ signal },
		);
	});
}

function initPage() {
	pageAbort?.abort();
	pageAbort = new AbortController();
	const { signal } = pageAbort;
	initHeader(signal);
	initScrollSpy(signal);
	initTableOfContents(signal);
	initReveal(signal);
	initArticleFilter(signal);
	initHomepageArticleExpand(signal);
	initSidebarNavFilterAndCollapse(signal);
	initDetailsAnimation(signal);
	initBackToTop(signal);
	scrollToHash();
}

document.addEventListener('click', onClick);
document.addEventListener('keydown', onKeydown);
document.addEventListener('astro:page-load', initPage);
initPage();
