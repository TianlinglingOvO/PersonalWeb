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

function onNavTouchMove(e: TouchEvent) {
	const panel = $('[data-nav-panel]');
	if (panel && panel.contains(e.target as Node)) {
		return;
	}
	e.preventDefault();
}

function setNavOpen(open: boolean) {
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

function initHeader(signal: AbortSignal) {
	const header = $('.site-header') as HTMLElement | null;
	const backdrop = $('[data-nav-backdrop]');
	if (backdrop) {
		backdrop.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false, signal });
	}
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

function initArticleController(signal: AbortSignal) {
	const controllers = $all<HTMLElement>('[data-article-controller]');
	if (!controllers.length) return;

	controllers.forEach((ctrl) => {
		const limit = parseInt(ctrl.getAttribute('data-limit') || '0', 10);
		const grid = $('[data-article-list]', ctrl) as HTMLElement | null;
		const cards = $all<HTMLElement>('[data-article-list] [data-category]', ctrl);
		const empty = $('[data-article-empty]', ctrl) as HTMLElement | null;
		const chips = $all<HTMLButtonElement>('[data-filter]', ctrl);
		const expandRow = $('[data-articles-expand-row]', ctrl) as HTMLElement | null;
		const toggleBtn = $('[data-articles-toggle]', ctrl) as HTMLButtonElement | null;
		const textSpan = toggleBtn?.querySelector('.expand-btn-text') as HTMLElement | null;

		let currentFilter = 'all';
		let isExpanded = false;
		let currentAnimation: Animation | null = null;
		let isAnimating = false;

		const getMatchedCards = () =>
			cards.filter((card) => {
				const cat = card.getAttribute('data-category');
				return currentFilter === 'all' || cat === currentFilter;
			});

		const render = () => {
			if (currentAnimation) {
				currentAnimation.cancel();
				currentAnimation = null;
			}
			isAnimating = false;
			if (grid) {
				grid.style.height = '';
				grid.style.overflow = '';
			}

			const matchedCards = getMatchedCards();

			cards.forEach((c) => {
				c.hidden = true;
				c.style.display = 'none';
				c.style.opacity = '';
				c.classList.remove('article-card-overflow');
			});

			const total = matchedCards.length;
			if (empty) {
				empty.hidden = total > 0;
				empty.style.display = total > 0 ? 'none' : '';
			}

			if (limit > 0 && total > limit) {
				if (expandRow) {
					expandRow.hidden = false;
					expandRow.style.display = 'flex';
				}
				const visibleCount = isExpanded ? total : limit;
				matchedCards.forEach((card, idx) => {
					const show = idx < visibleCount;
					card.hidden = !show;
					card.style.display = show ? '' : 'none';
					if (!show) card.classList.add('article-card-overflow');
				});

				if (toggleBtn) {
					toggleBtn.setAttribute('aria-expanded', String(isExpanded));
					toggleBtn.classList.toggle('is-active', isExpanded);
				}
				if (textSpan) {
					const remaining = total - limit;
					textSpan.textContent = isExpanded
						? '收起文章 ↑'
						: `展开更多文章 (还有 ${remaining} 篇) ↓`;
				}
			} else {
				if (expandRow) {
					expandRow.hidden = true;
					expandRow.style.display = 'none';
				}
				matchedCards.forEach((card) => {
					card.hidden = false;
					card.style.display = '';
				});
				if (toggleBtn) {
					toggleBtn.setAttribute('aria-expanded', 'false');
					toggleBtn.classList.remove('is-active');
				}
			}
		};

		const toggleExpandWithAnimation = () => {
			if (!grid || isAnimating) return;

			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
				isExpanded = !isExpanded;
				render();
				return;
			}

			const matchedCards = getMatchedCards();
			const total = matchedCards.length;
			if (total <= limit) return;

			const overflowCards = matchedCards.slice(limit);

			if (!isExpanded) {
				// 展开动画 (丝滑高度延展 + 卡片轻柔滑入淡出)
				const startHeight = grid.offsetHeight;
				isExpanded = true;

				overflowCards.forEach((card) => {
					card.hidden = false;
					card.style.display = '';
					card.style.opacity = '0';
					card.classList.remove('article-card-overflow');
				});

				const targetHeight = grid.offsetHeight;

				if (toggleBtn) {
					toggleBtn.setAttribute('aria-expanded', 'true');
					toggleBtn.classList.add('is-active');
				}
				if (textSpan) {
					textSpan.textContent = '收起文章 ↑';
				}

				grid.style.overflow = 'hidden';
				isAnimating = true;

				currentAnimation = grid.animate(
					[
						{ height: `${startHeight}px` },
						{ height: `${targetHeight}px` },
					],
					{
						duration: 320,
						easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
					},
				);

				overflowCards.forEach((card, idx) => {
					card.animate(
						[
							{ opacity: 0, transform: 'translateY(-10px)' },
							{ opacity: 1, transform: 'translateY(0)' },
						],
						{
							duration: 300,
							delay: Math.min(idx * 35, 120),
							easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
							fill: 'forwards',
						},
					);
				});

				currentAnimation.onfinish = () => {
					grid.style.height = '';
					grid.style.overflow = '';
					overflowCards.forEach((c) => {
						c.style.opacity = '';
					});
					isAnimating = false;
					currentAnimation = null;
				};
			} else {
				// 收起动画 (卡片平缓淡出 + 容器高度丝滑回弹)
				const startHeight = grid.offsetHeight;
				const firstCard = matchedCards[0];
				const lastInitialCard = matchedCards[limit - 1];
				const targetHeight =
					firstCard && lastInitialCard
						? lastInitialCard.offsetTop + lastInitialCard.offsetHeight - firstCard.offsetTop
						: startHeight;

				isExpanded = false;

				if (toggleBtn) {
					toggleBtn.setAttribute('aria-expanded', 'false');
					toggleBtn.classList.remove('is-active');
				}
				if (textSpan) {
					const remaining = total - limit;
					textSpan.textContent = `展开更多文章 (还有 ${remaining} 篇) ↓`;
				}

				grid.style.overflow = 'hidden';
				isAnimating = true;

				overflowCards.forEach((card) => {
					card.animate(
						[
							{ opacity: 1, transform: 'translateY(0)' },
							{ opacity: 0, transform: 'translateY(-8px)' },
						],
						{
							duration: 220,
							easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
						},
					);
				});

				currentAnimation = grid.animate(
					[
						{ height: `${startHeight}px` },
						{ height: `${targetHeight}px` },
					],
					{
						duration: 280,
						easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
					},
				);

				currentAnimation.onfinish = () => {
					overflowCards.forEach((c) => {
						c.hidden = true;
						c.style.display = 'none';
						c.style.opacity = '';
						c.classList.add('article-card-overflow');
					});
					grid.style.height = '';
					grid.style.overflow = '';
					isAnimating = false;
					currentAnimation = null;

					const section = ctrl.closest('section') ?? ctrl;
					const rect = section.getBoundingClientRect();
					if (rect.top < 60) {
						section.scrollIntoView({ behavior: 'smooth', block: 'start' });
					}
				};
			}
		};

		chips.forEach((chip) => {
			chip.addEventListener(
				'click',
				() => {
					chips.forEach((c) => {
						const on = c === chip;
						c.classList.toggle('is-active', on);
						c.setAttribute('aria-pressed', String(on));
					});
					currentFilter = chip.getAttribute('data-filter') ?? 'all';
					isExpanded = false;
					render();
				},
				{ signal },
			);
		});

		toggleBtn?.addEventListener('click', toggleExpandWithAnimation, { signal });

		render();
	});
}

function initSidebarNavFilterAndCollapse(signal: AbortSignal) {
	const layout = $('[data-article-layout]') as HTMLElement | null;
	const collapseBtn = $('[data-sidebar-collapse]') as HTMLButtonElement | null;
	const expandBtn = $('[data-sidebar-expand]') as HTMLButtonElement | null;
	const dropdown = $('[data-sidebar-category-dropdown]') as HTMLElement | null;
	const items = $all<HTMLElement>('[data-sidebar-item]');
	const emptyHint = $('[data-sidebar-empty]') as HTMLElement | null;

	// 1. 自定义马卡龙圆角下拉菜单
	if (dropdown) {
		const trigger = $('[data-dropdown-trigger]', dropdown) as HTMLButtonElement | null;
		const triggerText = $('[data-dropdown-text]', dropdown) as HTMLElement | null;
		const panel = $('[data-dropdown-panel]', dropdown) as HTMLElement | null;
		const options = $all<HTMLButtonElement>('[role="option"]', panel ?? dropdown);

		const setDropdownOpen = (open: boolean) => {
			if (!panel || !trigger) return;
			panel.hidden = !open;
			panel.classList.toggle('is-open', open);
			trigger.setAttribute('aria-expanded', String(open));
			trigger.classList.toggle('is-active', open);
		};

		trigger?.addEventListener(
			'click',
			(e) => {
				e.stopPropagation();
				const isOpen = panel?.classList.contains('is-open') ?? false;
				setDropdownOpen(!isOpen);
			},
			{ signal },
		);

		// 点击外部收起下拉
		document.addEventListener(
			'click',
			(e) => {
				if (!dropdown.contains(e.target as Node)) {
					setDropdownOpen(false);
				}
			},
			{ signal },
		);

		// 按 Esc 收起下拉
		document.addEventListener(
			'keydown',
			(e) => {
				if (e.key === 'Escape') {
					setDropdownOpen(false);
				}
			},
			{ signal },
		);

		options.forEach((opt) => {
			opt.addEventListener(
				'click',
				(e) => {
					e.stopPropagation();
					const val = opt.getAttribute('data-value') ?? 'all';
					const label = opt.querySelector('.dropdown-option-label')?.textContent ?? '全部分类';

					options.forEach((o) => {
						const on = o === opt;
						o.classList.toggle('is-selected', on);
						o.setAttribute('aria-selected', String(on));
					});

					if (triggerText) triggerText.textContent = label;
					setDropdownOpen(false);

					let visible = 0;
					items.forEach((item) => {
						const match = val === 'all' || item.getAttribute('data-sidebar-category') === val;
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
		});
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

function initLazyImages() {
	$all<HTMLImageElement>('.prose img').forEach((img) => {
		if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
		if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
	});
}

function initPageProgressBar() {
	document.addEventListener('astro:before-preparation', () => {
		const bar = document.getElementById('page-progress');
		if (bar) {
			bar.classList.remove('is-loaded');
			bar.classList.add('is-loading');
		}
	});

	document.addEventListener('astro:after-preparation', () => {
		const bar = document.getElementById('page-progress');
		if (bar) {
			bar.classList.remove('is-loading');
			bar.classList.add('is-loaded');
			window.setTimeout(() => {
				bar.classList.remove('is-loaded');
			}, 360);
		}
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
	initArticleController(signal);
	initSidebarNavFilterAndCollapse(signal);
	initDetailsAnimation(signal);
	initBackToTop(signal);
	initLazyImages();
	scrollToHash();
}

initPageProgressBar();
document.addEventListener('click', onClick);
document.addEventListener('keydown', onKeydown);
document.addEventListener('astro:page-load', initPage);
initPage();
