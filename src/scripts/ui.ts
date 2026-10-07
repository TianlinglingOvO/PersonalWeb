import { navigate } from 'astro:transitions/client';

let pageAbort: AbortController | null = null;

let scrollTicking = false;
const scrollSubscribers = new Set<(scrollY: number) => void>();

function onGlobalScroll() {
	if (scrollTicking) return;
	scrollTicking = true;
	requestAnimationFrame(() => {
		scrollTicking = false;
		const sy = window.scrollY;
		scrollSubscribers.forEach((cb) => cb(sy));
	});
}

function subscribeScroll(cb: (scrollY: number) => void, signal: AbortSignal) {
	scrollSubscribers.add(cb);
	cb(window.scrollY);
	signal.addEventListener('abort', () => scrollSubscribers.delete(cb));
}

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

// ============ 通用动效工具 ============
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

// 高度变化用比较柔和的 ease-out（cubic），距离越长时间略长，避免第一帧就窜出一大截
const EASE_HEIGHT = 'cubic-bezier(0.33, 1, 0.68, 1)';
const durationFor = (distance: number) => Math.min(560, 280 + Math.abs(distance) * 0.15);

/**
 * 展开 / 收起：元素从当前高度滑到自然高度（open）或 0（收起，结束后调用 onClosed 真正隐藏）。
 * 内外边距一起缩放，结尾不会跳；动画中途再点会从当前位置折返。展开前调用方要先让元素可见。
 */
function slide(el: HTMLElement, open: boolean, onClosed?: () => void) {
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

/** 内容替换时（切分类、切月份、切标签）让容器高度平滑过渡到新高度：先量旧高度，执行 mutate，再量新高度 */
function animateHeight(el: HTMLElement, mutate: () => void) {
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
}

/** 一组元素依次淡入上浮 */
function staggerIn(els: Element[], step = 40) {
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

/**
 * 和网站风格一致的确认弹窗，代替浏览器自带的 confirm()。
 * 传 input 时弹窗里带一个输入框（如注销时确认密码）；传 onConfirm 时点确定会先执行它，
 * 返回字符串表示出错：在弹窗里显示错误并保持打开。
 */
function confirmDialog(
	message: string,
	{
		title = '确认一下',
		confirmText = '确定',
		cancelText = '取消',
		input,
		onConfirm,
	}: {
		title?: string;
		confirmText?: string;
		cancelText?: string;
		input?: { type?: string; placeholder?: string; autocomplete?: string };
		onConfirm?: (value: string) => Promise<string | void>;
	} = {},
) {
	return new Promise<boolean>((resolve) => {
		const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') => {
			const node = document.createElement(tag);
			node.className = className;
			node.textContent = text;
			return node;
		};
		const dialog = el('dialog', 'confirm-dialog');
		const card = el('form', 'confirm-card');
		const field = input ? el('input', 'confirm-input') : null;
		if (field && input) {
			field.type = input.type ?? 'text';
			field.placeholder = input.placeholder ?? '';
			field.autocomplete = (input.autocomplete ?? 'off') as AutoFill;
		}
		const error = el('p', 'confirm-error');
		error.hidden = true;
		const actions = el('div', 'confirm-actions');
		const cancel = el('button', 'btn btn-ghost', cancelText);
		cancel.type = 'button';
		const ok = el('button', 'btn btn-primary', confirmText);
		ok.type = 'submit';
		actions.append(cancel, ok);
		card.append(el('p', 'confirm-title', title), el('p', 'confirm-message', message), ...(field ? [field] : []), error, actions);
		dialog.append(card);
		document.body.append(dialog);

		let done = false;
		const finish = (result: boolean) => {
			if (done) return;
			done = true;
			resolve(result);
			const remove = () => {
				dialog.close();
				dialog.remove();
			};
			if (prefersReducedMotion()) return remove();
			dialog.classList.add('is-closing');
			card.addEventListener('animationend', remove, { once: true });
			window.setTimeout(remove, 300);
		};
		cancel.addEventListener('click', () => finish(false));
		card.addEventListener('submit', async (e) => {
			e.preventDefault();
			if (!onConfirm) return finish(true);
			ok.disabled = true;
			ok.classList.add('is-loading');
			const problem = await onConfirm(field?.value ?? '');
			ok.disabled = false;
			ok.classList.remove('is-loading');
			if (!problem) return finish(true);
			error.textContent = problem;
			error.hidden = false;
			card.animate(
				[
					{ transform: 'translateX(0)' },
					{ transform: 'translateX(-6px)' },
					{ transform: 'translateX(5px)' },
					{ transform: 'translateX(0)' },
				],
				{ duration: 280, easing: 'ease-out' },
			);
			field?.select();
		});
		dialog.addEventListener('cancel', (e) => {
			e.preventDefault();
			finish(false);
		});
		dialog.addEventListener('click', (e) => e.target === dialog && finish(false));
		dialog.showModal();
		(field ?? cancel).focus();
	});
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
	}, signal);
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

function initReveal(signal: AbortSignal) {
	const els = $all('.reveal');
	if (!els.length) return;
	// 区块内的卡片按顺序错落出场，延迟上限 8 个卡位
	$all<HTMLElement>('[data-stagger]').forEach((group) => {
		[...group.children].forEach((child, i) => {
			(child as HTMLElement).style.setProperty('--stagger-i', String(Math.min(i, 8)));
		});
	});
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
					// 切换分类：区块高度平滑过渡，留下的卡片依次浮现，下面的区块跟着滑动而不是跳动
					animateHeight(ctrl, render);
					staggerIn(cards.filter((c) => !c.hidden), 45);
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
					const list = items[0]?.parentElement;
					const apply = () => items.forEach((item) => {
						const match = val === 'all' || item.getAttribute('data-sidebar-category') === val;
						item.hidden = !match;
						item.style.display = match ? '' : 'none';
						if (match) visible++;
					});
					if (list) animateHeight(list, apply);
					else apply();
					staggerIn(items.filter((item) => !item.hidden), 30);

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
	subscribeScroll((sy) => {
		btn.classList.toggle('is-visible', sy > 640);
	}, signal);
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

	if (target.closest('[data-nav-backdrop]') || target.closest('[data-nav-link]') || target.closest('[data-account-login]')) {
		setNavOpen(false);
	}

	if (target.closest('[data-logout]')) {
		void logout();
		return;
	}

	if (target.closest('[data-close-account]')) {
		void closeAccount();
		return;
	}

	const copyBtn = target.closest('[data-copy]');
	if (copyBtn) {
		const text = copyBtn.getAttribute('data-copy') ?? '';
		if (text) void copyText(text);
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

// <details> 折叠块（服务卡片“展开说明”、手机端文章目录）：展开 / 收起都带滑动动画
function initDetailsAnimation(signal: AbortSignal) {
	$all<HTMLDetailsElement>('.service-card details, .mobile-toc-details').forEach((details) => {
		const summary = details.querySelector('summary');
		const content = details.querySelector<HTMLElement>(':scope > :not(summary)');
		if (!summary || !content) return;
		summary.addEventListener(
			'click',
			(e) => {
				e.preventDefault();
				const open = !details.open || details.classList.contains('is-closing');
				details.classList.toggle('is-closing', !open);
				details.open = true;
				slide(content, open, () => {
					details.open = false;
					details.classList.remove('is-closing');
				});
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
		const source = (e as Event & { sourceElement?: Element }).sourceElement;
		card = source?.closest<HTMLElement>('a.card-link[href^="/articles/"]') ?? null;
		card?.style.setProperty('view-transition-name', MORPH);
	});

	document.addEventListener('astro:before-swap', (e) => {
		if (!card) return;
		card = null;
		const { newDocument, viewTransition } = e as Event & { newDocument: Document; viewTransition?: ViewTransition };
		const page = newDocument.querySelector<HTMLElement>('.article-page');
		if (!page) return;
		page.style.setProperty('view-transition-name', MORPH);
		const cleanup = () => page.style.removeProperty('view-transition-name');
		if (viewTransition) viewTransition.finished.finally(cleanup);
		else cleanup();
	});
}

function initEmailFix() {
	$all<HTMLElement>('.contact-copy[data-copy]').forEach((btn) => {
		const text = btn.getAttribute('data-copy');
		const valueEl = btn.querySelector('.contact-value');
		if (text && valueEl && (valueEl.textContent?.includes('[email') || valueEl.querySelector('.__cf_email__'))) {
			valueEl.textContent = text;
		}
	});
}

// 历程年历：电脑端用年份标签切换年份、点月份格查看当月经历；手机端（≤860px）点年份标题折叠 / 展开
function initTimeline(signal: AbortSignal) {
	const section = document.querySelector<HTMLElement>('[data-timeline]');
	if (!section) return;

	const tabs = $all<HTMLButtonElement>('[data-timeline-tab]', section);
	const panels = $all<HTMLElement>('[data-timeline-panel]', section);
	const mobileQuery = window.matchMedia('(max-width: 860px)');
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const ease = 'cubic-bezier(0.16, 1, 0.3, 1)';

	// 切换年份：往后的年份从右侧翻入，往前的年份从左侧翻入
	const showYear = (index: number, focus = false) => {
		const current = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
		if (index < 0 || index >= tabs.length) return;
		tabs.forEach((tab, i) => {
			tab.setAttribute('aria-selected', String(i === index));
			tab.tabIndex = i === index ? 0 : -1;
		});
		const year = tabs[index].dataset.timelineTab;
		const container = panels[0]?.parentElement;
		const swap = () => panels.forEach((panel) => panel.classList.toggle('is-active', panel.dataset.timelinePanel === year));
		if (container && !mobileQuery.matches) animateHeight(container, swap);
		else swap();
		if (focus) tabs[index].focus();
		const panel = panels.find((p) => p.dataset.timelinePanel === year);
		if (panel && index !== current && !reducedMotion) {
			const dx = index > current ? 28 : -28;
			panel.animate(
				[
					{ opacity: 0, transform: `translateX(${dx}px)` },
					{ opacity: 1, transform: 'none' },
				],
				{ duration: 380, easing: ease },
			);
		}
	};

	tabs.forEach((tab, i) => {
		tab.addEventListener('click', () => showYear(i), { signal });
		tab.addEventListener(
			'keydown',
			(e) => {
				const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
				if (next === undefined) return;
				e.preventDefault();
				showYear(Math.min(Math.max(next, 0), tabs.length - 1), true);
			},
			{ signal },
		);
	});

	panels.forEach((panel) => {
		const cells = $all<HTMLButtonElement>('[data-timeline-month]', panel);
		const details = $all<HTMLElement>('[data-timeline-month-detail]', panel);

		// 选中月份：右侧（窄屏在下方）换成当月的全部经历；点的是某条小标签时，闪一下对应卡片
		cells.forEach((cell) => {
			cell.addEventListener(
				'click',
				(e) => {
					const month = cell.dataset.timelineMonth;
					cells.forEach((c) => {
						c.classList.toggle('is-selected', c === cell);
						c.setAttribute('aria-pressed', String(c === cell));
					});
					animateHeight(panel, () =>
						details.forEach((d) => d.classList.toggle('is-active', d.dataset.timelineMonthDetail === month)),
					);
					const detail = details.find((d) => d.dataset.timelineMonthDetail === month);
					if (!detail) return;
					if (!reducedMotion) {
						[...detail.children].forEach((child, i) =>
							(child as HTMLElement).animate(
								[
									{ opacity: 0, transform: 'translateY(10px)' },
									{ opacity: 1, transform: 'none' },
								],
								{ duration: 320, delay: i * 60, easing: ease, fill: 'backwards' },
							),
						);
					}
					const ref = (e.target as HTMLElement).closest<HTMLElement>('[data-entry-ref]')?.dataset.entryRef;
					const entry = ref ? detail.querySelector<HTMLElement>(`[data-entry="${CSS.escape(ref)}"]`) : null;
					if (entry) {
						entry.classList.remove('is-flash');
						void entry.offsetWidth;
						entry.classList.add('is-flash');
						// 窄屏时详情在年历下方，滚过去让用户看到
						if (entry.getBoundingClientRect().top > window.innerHeight) {
							entry.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
						}
					}
				},
				{ signal },
			);
		});

		// 手机端：年份标题折叠 / 展开。高度从 0 滑开、卡片依次浮现；收起时反向，动画中途再点会从当前高度折返
		const toggle = panel.querySelector<HTMLButtonElement>('[data-timeline-year-toggle]');
		const body = panel.querySelector<HTMLElement>('.timeline-year-body');
		toggle?.addEventListener(
			'click',
			() => {
				if (!mobileQuery.matches || !body) return;
				const expand = toggle.getAttribute('aria-expanded') !== 'true';
				toggle.setAttribute('aria-expanded', String(expand));
				panel.classList.remove('is-folded');
				slide(body, expand, () => panel.classList.add('is-folded'));
				if (expand) staggerIn($all('.timeline-detail-title, .timeline-entry, .timeline-future-note', body), 50);
			},
			{ signal },
		);
	});
}

// 浏览量：文章页打开时计一次并显示，文章卡片批量查询。接口不可用时（如 npm run dev）保持隐藏
function initViews(signal: AbortSignal) {
	const slots = $all<HTMLElement>('[data-views]');
	if (!slots.length) return;
	const show = (slot: HTMLElement, count?: number) => {
		if (!count) return;
		const num = slot.querySelector('[data-views-num]');
		if (num) num.textContent = count.toLocaleString('zh-CN');
		slot.title = `${count} 次阅读`;
		slot.hidden = false;
	};
	const getJson = (url: string, init?: RequestInit) =>
		fetch(url, { ...init, signal })
			.then((r) => (r.ok ? r.json() : null))
			.catch(() => null);

	const counter = slots.find((slot) => slot.hasAttribute('data-views-count'));
	if (counter) {
		getJson(`/api/views?slug=${encodeURIComponent(counter.dataset.views ?? '')}`, { method: 'POST' }).then(
			(data: { count?: number } | null) => show(counter, data?.count),
		);
	}
	const cards = slots.filter((slot) => slot !== counter);
	if (cards.length) {
		const slugs = [...new Set(cards.map((slot) => slot.dataset.views ?? ''))];
		getJson(`/api/views?slugs=${slugs.map(encodeURIComponent).join(',')}`).then(
			(data: Record<string, number> | null) => cards.forEach((slot) => show(slot, data?.[slot.dataset.views ?? ''])),
		);
	}
}

// ============ 账号（/api/auth/*，后端在 functions/） ============
interface Account {
	username: string;
	isAdmin: boolean;
}

const ACCOUNT_KEY = 'sutady:account';
let accountRequest: Promise<Account | null> | null = null;

/** 调用本站接口：失败时抛出带中文提示的 Error */
async function api<T>(url: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
	const offline = '网络好像出了点问题，请稍后再试';
	const res = await fetch(url, {
		method: options.method ?? (options.body ? 'POST' : 'GET'),
		headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
		body: options.body ? JSON.stringify(options.body) : undefined,
		credentials: 'same-origin',
		signal: options.signal,
	}).catch((err: Error) => {
		throw err.name === 'AbortError' ? err : new Error(offline);
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.error ?? offline);
	return data as T;
}

// 上次的登录状态记在本地，先用它渲染顶栏，避免“登录”闪一下再变成用户名
function cachedAccount(): Account | null {
	try {
		return JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null');
	} catch {
		return null;
	}
}

function storeAccount(account: Account | null) {
	try {
		if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
		else localStorage.removeItem(ACCOUNT_KEY);
	} catch {
		/* 隐私模式等情况下存不了，无所谓 */
	}
}

/** 当前登录用户。整页加载只问一次服务器，ClientRouter 换页时复用 */
function getAccount() {
	accountRequest ??= api<{ user: Account | null }>('/api/auth/me')
		.then(({ user }) => {
			storeAccount(user);
			return user;
		})
		.catch(() => cachedAccount());
	return accountRequest;
}

/** 登录 / 注册 / 退出后调用：更新缓存并通知顶栏、评论区、登录页刷新 */
function setAccount(account: Account | null) {
	accountRequest = Promise.resolve(account);
	storeAccount(account);
	document.dispatchEvent(new CustomEvent('account-change'));
}

async function logout() {
	try {
		await api('/api/auth/logout', { method: 'POST' });
	} catch {
		/* 服务器那边失败也照样清掉本地状态 */
	}
	setNavOpen(false);
	setAccount(null);
	toast('已退出登录');
}

// 注销账号：弹窗里再输一次密码确认
async function closeAccount() {
	setNavOpen(false);
	const account = await getAccount();
	if (!account) return;
	if (account.isAdmin) {
		toast('站长账号不能在网页上注销');
		return;
	}
	const closed = await confirmDialog(
		'注销后你的评论会被全部删除（别人回复你的内容会保留），用户名也会释放出来，无法恢复。请输入密码确认：',
		{
			title: `确定要注销「${account.username}」吗？`,
			confirmText: '确认注销',
			input: { type: 'password', placeholder: '当前密码', autocomplete: 'current-password' },
			onConfirm: async (password) => {
				if (!password) return '请输入密码';
				try {
					await api('/api/auth/delete', { body: { password } });
				} catch (err) {
					return (err as Error).message;
				}
			},
		},
	);
	if (!closed) return;
	setAccount(null);
	toast('账号已注销，江湖再见～');
}

const initialOf = (name: string) => (Array.from(name)[0] ?? '?').toUpperCase();
const loginUrl = (hash = '') => `/login/?next=${encodeURIComponent(location.pathname + hash)}`;

// 顶栏账号入口：未登录显示“登录”，登录后显示头像字母 + 用户名，电脑端点开是下拉菜单，手机端在抽屉里直接列出
function initAccount(signal: AbortSignal) {
	const root = $('[data-account]') as HTMLElement | null;
	if (!root) return;
	const login = root.querySelector<HTMLAnchorElement>('[data-account-login]')!;
	const user = root.querySelector<HTMLElement>('[data-account-user]')!;
	const toggle = root.querySelector<HTMLButtonElement>('[data-account-toggle]')!;

	const setMenu = (open: boolean) => {
		toggle.setAttribute('aria-expanded', String(open));
		root.classList.toggle('is-menu-open', open);
	};
	const render = (account: Account | null) => {
		login.hidden = Boolean(account);
		user.hidden = !account;
		if (account) {
			root.querySelector('[data-account-name]')!.textContent = account.username;
			root.querySelector('[data-account-initial]')!.textContent = initialOf(account.username);
			root.querySelector<HTMLElement>('[data-account-admin]')!.hidden = !account.isAdmin;
			// 站长账号不能在网页上注销，不显示入口
			root.querySelector<HTMLElement>('[data-account-close]')!.hidden = account.isAdmin;
		} else {
			setMenu(false);
		}
	};

	if (!location.pathname.startsWith('/login')) login.href = loginUrl();
	render(cachedAccount());
	void getAccount().then(render);
	document.addEventListener('account-change', () => void getAccount().then(render), { signal });

	toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'), { signal });
	document.addEventListener('click', (e) => !root.contains(e.target as Node) && setMenu(false), { signal });
	document.addEventListener('keydown', (e) => e.key === 'Escape' && setMenu(false), { signal });
}

// 登录页：登录 / 注册两个标签共用一张表单
function initAuthForm(signal: AbortSignal) {
	const root = $('[data-auth]') as HTMLElement | null;
	if (!root) return;
	const form = root.querySelector<HTMLFormElement>('[data-auth-form]')!;
	const signedIn = root.querySelector<HTMLElement>('[data-auth-signed-in]')!;
	const tabs = $all<HTMLButtonElement>('[data-auth-tab]', form);
	const error = form.querySelector<HTMLElement>('[data-auth-error]')!;
	const submit = form.querySelector<HTMLButtonElement>('[data-auth-submit]')!;
	const reveal = form.querySelector<HTMLButtonElement>('[data-auth-reveal]')!;
	const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const nextParam = new URLSearchParams(location.search).get('next') ?? '/';
	const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';

	const showState = (account: Account | null) => {
		signedIn.hidden = !account;
		form.hidden = Boolean(account);
		if (account) {
			signedIn.querySelector('[data-auth-current]')!.textContent = account.username;
			signedIn.querySelector<HTMLElement>('[data-account-close]')!.hidden = account.isAdmin;
		}
	};
	void getAccount().then(showState);
	document.addEventListener('account-change', () => void getAccount().then(showState), { signal });

	const showError = (message: string) => {
		if (error.hidden === !message && error.textContent === message) return;
		animateHeight(root, () => {
			error.textContent = message;
			error.hidden = !message;
		});
		if (message && !reducedMotion) {
			error.animate(
				[
					{ transform: 'translateX(0)' },
					{ transform: 'translateX(-6px)' },
					{ transform: 'translateX(5px)' },
					{ transform: 'translateX(-3px)' },
					{ transform: 'translateX(0)' },
				],
				{ duration: 320, easing: 'ease-out' },
			);
		}
	};

	const setMode = (mode: string) => {
		if (form.dataset.mode === mode) return;
		animateHeight(root, () => applyMode(mode));
		staggerInAuth();
	};
	const applyMode = (mode: string) => {
		form.dataset.mode = mode;
		tabs.forEach((tab) => {
			const on = tab.dataset.authTab === mode;
			tab.classList.toggle('is-active', on);
			tab.setAttribute('aria-selected', String(on));
		});
		$all<HTMLElement>('[data-auth-show]', form).forEach((el) => (el.hidden = el.dataset.authShow !== mode));
		field('password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
		showError('');
	};
	const staggerInAuth = () =>
		staggerIn(
			$all<HTMLElement>('.auth-title, .auth-sub, .auth-field, .auth-field-hint, .auth-submit', form).filter((el) => !el.hidden),
			30,
		);
	tabs.forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.authTab ?? 'login'), { signal }));
	// 表单底部“还没有账号？去创建一个吧～”这类切换提示
	$all<HTMLButtonElement>('[data-auth-switch]', form).forEach((button) =>
		button.addEventListener(
			'click',
			() => {
				setMode(button.dataset.authSwitch ?? 'login');
				field('username').focus({ preventScroll: true });
			},
			{ signal },
		),
	);
	if (location.hash === '#register') applyMode('register');

	reveal.addEventListener(
		'click',
		() => {
			const show = reveal.getAttribute('aria-pressed') !== 'true';
			reveal.setAttribute('aria-pressed', String(show));
			reveal.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
			field('password').type = field('confirm').type = show ? 'text' : 'password';
		},
		{ signal },
	);

	form.addEventListener(
		'submit',
		async (e) => {
			e.preventDefault();
			const mode = form.dataset.mode === 'register' ? 'register' : 'login';
			const username = field('username').value.normalize('NFKC').trim();
			const password = field('password').value;
			if (!username || !password) return showError('请填写用户名和密码');
			if (mode === 'register') {
				if (!/^[\p{L}\p{N}_]{2,16}$/u.test(username)) {
					return showError('用户名需为 2–16 个字符，只能包含中文、字母、数字和下划线');
				}
				if (password.length < 6) return showError('密码至少 6 位');
				if (password !== field('confirm').value) return showError('两次输入的密码不一样');
			}

			showError('');
			submit.disabled = true;
			submit.classList.add('is-loading');
			try {
				const { user } = await api<{ user: Account }>(`/api/auth/${mode}`, { body: { username, password } });
				setAccount(user);
				toast(mode === 'register' ? `注册成功，欢迎你，${user.username}！` : `欢迎回来，${user.username}～`);
				await navigate(next);
			} catch (err) {
				showError((err as Error).message);
			} finally {
				submit.disabled = false;
				submit.classList.remove('is-loading');
			}
		},
		{ signal },
	);
}

// ============ 评论区（/api/comments） ============
interface CommentData {
	id: number;
	user: Account | null;
	replyTo: string | null;
	content: string;
	createdAt: number;
	edited?: boolean;
	deleted: boolean;
	canEdit?: boolean;
	canDelete: boolean;
	replies?: CommentData[];
}

function timeAgo(sec: number) {
	const diff = Date.now() / 1000 - sec;
	if (diff < 60) return '刚刚';
	if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
	if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
	if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
	const d = new Date(sec * 1000);
	return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function initComments(signal: AbortSignal) {
	const root = $('[data-comments]') as HTMLElement | null;
	if (!root) return;
	const slug = root.dataset.comments ?? '';
	const list = root.querySelector<HTMLOListElement>('[data-comment-list]')!;
	const status = root.querySelector<HTMLElement>('[data-comment-status]')!;
	const countEl = root.querySelector<HTMLElement>('[data-comments-count]')!;
	const mainForm = root.querySelector<HTMLFormElement>('[data-comment-form]')!;
	const loginTip = root.querySelector<HTMLElement>('[data-comment-login]')!;
	const template = root.querySelector<HTMLTemplateElement>('[data-comment-template]')!;
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	let account: Account | null = null;
	let replyForm: HTMLFormElement | null = null;
	let editForm: HTMLFormElement | null = null;
	// 楼中楼超过 REPLY_PREVIEW 条时只显示前几条，其余收起；记住展开过的楼，刷新列表后保持展开
	const REPLY_PREVIEW = 2;
	const expandedThreads = new Set<number>();
	const setToggleLabel = (button: HTMLButtonElement, open: boolean) => {
		button.setAttribute('aria-expanded', String(open));
		button.textContent = open ? '收起回复' : `展开剩余 ${button.dataset.count} 条回复`;
	};
	const threadParts = (thread: HTMLElement) => {
		const replies = thread.querySelector<HTMLOListElement>(':scope > .comment-body > .comment-replies');
		return {
			replies,
			rest: replies?.querySelector<HTMLElement>(':scope > .comment-replies-rest') ?? null,
			toggle: replies?.querySelector<HTMLButtonElement>(':scope > .comment-replies-toggle-row > button') ?? null,
		};
	};
	const setThreadOpen = (thread: HTMLElement, open: boolean) => {
		const { rest, toggle } = threadParts(thread);
		if (!rest || !toggle || (toggle.getAttribute('aria-expanded') === 'true') === open) return;
		const id = Number(thread.dataset.commentId);
		setToggleLabel(toggle, open);
		if (open) {
			expandedThreads.add(id);
			rest.hidden = false;
			slide(rest, true);
			staggerIn($all('.comment', rest), 40);
		} else {
			expandedThreads.delete(id);
			slide(rest, false, () => (rest.hidden = true));
			// 收起后按钮可能跑到屏幕上方，把这一楼拉回视野
			if (toggle.getBoundingClientRect().top < 80) thread.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	};

	root.querySelector<HTMLAnchorElement>('[data-login-link]')!.href = loginUrl('#comments');

	const build = (c: CommentData, threadId: number) => {
		const li = template.content.firstElementChild!.cloneNode(true) as HTMLLIElement;
		const q = <T extends HTMLElement>(sel: string) => li.querySelector<T>(sel)!;
		li.dataset.commentId = String(c.id);
		li.dataset.threadId = String(threadId);
		if (c.deleted || !c.user) {
			li.classList.add('is-deleted');
			q('[data-c-content]').textContent = '这条评论已被删除';
			q('[data-c-name]').textContent = '';
			q('[data-c-reply]').hidden = true;
		} else {
			q('[data-c-avatar]').textContent = initialOf(c.user.username);
			q('[data-c-avatar]').classList.toggle('is-admin', c.user.isAdmin);
			q('[data-c-name]').textContent = c.user.username;
			q('[data-c-admin]').hidden = !c.user.isAdmin;
			q('[data-c-content]').textContent = c.content;
			li.dataset.author = c.user.username;
		}
		if (c.replyTo) {
			q('[data-c-reply-to]').textContent = `回复 @${c.replyTo}`;
			q('[data-c-reply-to]').hidden = false;
		}
		const time = q<HTMLTimeElement>('[data-c-time]');
		time.textContent = timeAgo(c.createdAt);
		time.dateTime = new Date(c.createdAt * 1000).toISOString();
		time.title = new Date(c.createdAt * 1000).toLocaleString('zh-CN');
		q('[data-c-delete]').hidden = !c.canDelete;
		q('[data-c-edit]').hidden = !c.canEdit;
		q('[data-c-edited]').hidden = !c.edited;
		const replies = q<HTMLOListElement>('[data-c-replies]');
		const items = (c.replies ?? []).map((r) => build(r, threadId));
		if (items.length > REPLY_PREVIEW) {
			const open = expandedThreads.has(threadId);
			const rest = document.createElement('li');
			rest.className = 'comment-replies-rest';
			rest.hidden = !open;
			const inner = document.createElement('ol');
			inner.className = 'comment-replies-inner';
			inner.append(...items.slice(REPLY_PREVIEW));
			rest.append(inner);
			const row = document.createElement('li');
			row.className = 'comment-replies-toggle-row';
			const toggle = document.createElement('button');
			toggle.type = 'button';
			toggle.className = 'comment-replies-toggle';
			toggle.dataset.cToggleReplies = '';
			toggle.dataset.count = String(items.length - REPLY_PREVIEW);
			setToggleLabel(toggle, open);
			row.append(toggle);
			replies.append(...items.slice(0, REPLY_PREVIEW), rest, row);
		} else if (items.length) {
			replies.append(...items);
		} else {
			replies.remove();
		}
		return li;
	};

	type CommentList = { count: number; comments: CommentData[] };
	const render = (data: CommentList, highlightId?: number) => {
		animateHeight(root, () => {
			replyForm = null;
			editForm = null;
			list.replaceChildren(...data.comments.map((c) => build(c, c.id)));
			countEl.textContent = data.count ? String(data.count) : '';
			status.textContent = '还没有评论，来抢沙发吧～';
			status.hidden = data.comments.length > 0;
		});
		const fresh = highlightId ? list.querySelector<HTMLElement>(`[data-comment-id="${highlightId}"]`) : null;
		if (fresh) {
			fresh.classList.add('is-new');
			const top = fresh.getBoundingClientRect().top;
			if (top > window.innerHeight || top < 0) {
				fresh.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
			}
		}
	};

	const load = async () => {
		try {
			render(await api<CommentList>(`/api/comments?slug=${encodeURIComponent(slug)}`, { signal }));
		} catch {
			if (signal.aborted) return;
			status.textContent = '评论暂时加载不出来，稍后刷新试试';
			status.hidden = false;
		}
	};

	const showAccount = (a: Account | null) => {
		account = a;
		mainForm.hidden = !a;
		loginTip.hidden = Boolean(a);
		const avatar = root.querySelector<HTMLElement>('[data-comment-form-avatar]')!;
		avatar.textContent = a ? initialOf(a.username) : '';
		avatar.classList.toggle('is-admin', Boolean(a?.isAdmin));
	};
	void getAccount().then(showAccount);
	void load();
	document.addEventListener(
		'account-change',
		() => {
			void getAccount().then(showAccount);
			void load();
		},
		{ signal },
	);

	// 发送时先把评论以“发送中”的样子放上去（乐观更新），服务器返回最新列表后再整体替换；失败就撤回并把文字还给输入框
	const send = async (form: HTMLFormElement, replyTo?: number) => {
		const textarea = form.querySelector('textarea')!;
		const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
		const content = textarea.value.trim();
		if (!content) {
			textarea.focus();
			return;
		}
		if (!account) return;

		const pending = build(
			{
				id: 0,
				user: account,
				replyTo: form.dataset.replyName ?? null,
				content,
				createdAt: Date.now() / 1000,
				deleted: false,
				canDelete: false,
			},
			0,
		);
		pending.classList.add('is-pending');
		pending.querySelector('[data-c-time]')!.textContent = '发送中…';
		pending.querySelector<HTMLElement>('[data-c-reply]')!.hidden = true;
		animateHeight(root, () => {
			if (replyTo) {
				// 在这一楼回复：先把收起的回复展开，新回复排在最后
				const thread = form.closest<HTMLElement>('.comment-list > .comment')!;
				expandedThreads.add(Number(thread.dataset.commentId));
				setThreadOpen(thread, true);
				const body = form.closest('.comment-body')!;
				let replies = body.querySelector<HTMLOListElement>(':scope > .comment-replies');
				if (!replies) {
					replies = document.createElement('ol');
					replies.className = 'comment-replies';
					body.insertBefore(replies, form);
				}
				(replies.querySelector('.comment-replies-inner') ?? replies).append(pending);
			} else {
				list.prepend(pending);
				status.hidden = true;
			}
		});
		staggerIn([pending]);
		textarea.value = '';
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
		button.disabled = true;

		try {
			const data = await api<CommentList & { id: number }>('/api/comments', { body: { slug, content, replyTo } });
			render(data, data.id);
			toast(replyTo ? '回复成功' : '评论成功，谢谢你的留言～');
		} catch (err) {
			animateHeight(root, () => {
				pending.remove();
				status.hidden = list.children.length > 0;
			});
			textarea.value = content;
			textarea.dispatchEvent(new Event('input', { bubbles: true }));
			toast((err as Error).message);
			if ((err as Error).message === '请先登录') setAccount(null);
		} finally {
			button.disabled = false;
		}
	};

	// 编辑：评论内容原地换成输入框，保存后先乐观显示新内容，服务器确认后整体刷新
	const closeEdit = () => {
		const form = editForm;
		editForm = null;
		if (!form) return;
		const content = form.previousElementSibling as HTMLElement | null;
		slide(form, false, () => {
			form.remove();
			if (content) {
				content.hidden = false;
				staggerIn([content]);
			}
		});
	};
	const openEdit = (li: HTMLElement) => {
		const content = li.querySelector<HTMLElement>(':scope > .comment-body > .comment-content')!;
		if (editForm && editForm.previousElementSibling === content) return closeEdit();
		closeEdit();
		const form = document.createElement('form');
		form.className = 'comment-form is-edit';
		form.dataset.editId = li.dataset.commentId;
		const textarea = document.createElement('textarea');
		textarea.rows = 3;
		textarea.maxLength = 1000;
		textarea.value = content.textContent ?? '';
		textarea.setAttribute('aria-label', '编辑评论');
		const foot = document.createElement('div');
		foot.className = 'comment-form-foot';
		const cancel = document.createElement('button');
		cancel.type = 'button';
		cancel.className = 'btn btn-ghost';
		cancel.textContent = '取消';
		cancel.dataset.editCancel = '';
		const save = document.createElement('button');
		save.type = 'submit';
		save.className = 'btn btn-primary comment-submit';
		save.textContent = '保存';
		foot.append(cancel, save);
		form.append(textarea, foot);
		content.after(form);
		content.hidden = true;
		editForm = form;
		textarea.focus({ preventScroll: true });
		textarea.setSelectionRange(textarea.value.length, textarea.value.length);
		slide(form, true);
	};
	const saveEdit = async (form: HTMLFormElement) => {
		const textarea = form.querySelector('textarea')!;
		const content = textarea.value.trim();
		const target = form.previousElementSibling as HTMLElement;
		if (!content) return textarea.focus();
		if (content === target.textContent?.trim()) return closeEdit();
		const li = form.closest<HTMLElement>('[data-comment-id]')!;
		const before = target.textContent ?? '';
		target.textContent = content;
		li.classList.add('is-pending');
		editForm = null;
		form.remove();
		target.hidden = false;
		try {
			render(await api<CommentList>(`/api/comments/${form.dataset.editId}`, { method: 'PATCH', body: { content } }), Number(form.dataset.editId));
			toast('已保存修改');
		} catch (err) {
			target.textContent = before;
			li.classList.remove('is-pending');
			toast((err as Error).message);
		}
	};

	const closeReply = () => {
		const form = replyForm;
		replyForm = null;
		if (form) slide(form, false, () => form.remove());
	};

	const openReply = (li: HTMLElement) => {
		const thread = list.querySelector<HTMLElement>(`:scope > [data-comment-id="${li.dataset.threadId}"]`);
		if (!thread) return;
		const target = Number(li.dataset.commentId);
		const same = replyForm && Number(replyForm.dataset.replyTo) === target;
		closeReply();
		if (same) return;

		const form = document.createElement('form');
		form.className = 'comment-form is-reply';
		form.dataset.replyTo = String(target);
		if (li.closest('.comment-replies') && li.dataset.author) form.dataset.replyName = li.dataset.author;
		const textarea = document.createElement('textarea');
		textarea.rows = 2;
		textarea.maxLength = 1000;
		textarea.placeholder = `回复 @${li.dataset.author ?? ''}：`;
		textarea.setAttribute('aria-label', textarea.placeholder);
		const foot = document.createElement('div');
		foot.className = 'comment-form-foot';
		const cancel = document.createElement('button');
		cancel.type = 'button';
		cancel.className = 'btn btn-ghost';
		cancel.textContent = '取消';
		cancel.dataset.replyCancel = '';
		const submit = document.createElement('button');
		submit.type = 'submit';
		submit.className = 'btn btn-primary comment-submit';
		submit.textContent = '回复';
		foot.append(cancel, submit);
		form.append(textarea, foot);
		thread.querySelector(':scope > .comment-body')!.append(form);
		replyForm = form;
		textarea.focus({ preventScroll: true });
		slide(form, true);
	};

	root.addEventListener(
		'click',
		async (e) => {
			const target = e.target as HTMLElement;
			const li = target.closest<HTMLElement>('[data-comment-id]');
			if (target.closest('[data-c-toggle-replies]')) {
				const thread = target.closest<HTMLElement>('.comment-list > .comment');
				const toggle = target.closest<HTMLButtonElement>('[data-c-toggle-replies]')!;
				if (thread) setThreadOpen(thread, toggle.getAttribute('aria-expanded') !== 'true');
			} else if (target.closest('[data-c-reply]') && li) {
				if (!account) {
					toast('登录后才能回复哦');
					await navigate(loginUrl('#comments'));
					return;
				}
				openReply(li);
			} else if (target.closest('[data-c-delete]') && li) {
				const hasReplies = Boolean(li.querySelector(':scope > .comment-body > .comment-replies'));
				const ok = await confirmDialog(
					hasReplies ? '删除后无法恢复，下面的回复会保留。' : '删除后无法恢复哦。',
					{ title: '要删除这条评论吗？', confirmText: '删除' },
				);
				if (!ok) return;
				li.classList.add('is-removing');
				try {
					render(await api<CommentList>(`/api/comments/${li.dataset.commentId}`, { method: 'DELETE' }));
					toast('评论已删除');
				} catch (err) {
					li.classList.remove('is-removing');
					toast((err as Error).message);
				}
			} else if (target.closest('[data-c-edit]') && li) {
				openEdit(li);
			} else if (target.closest('[data-reply-cancel]')) {
				closeReply();
			} else if (target.closest('[data-edit-cancel]')) {
				closeEdit();
			}
		},
		{ signal },
	);

	root.addEventListener(
		'submit',
		(e) => {
			e.preventDefault();
			const form = e.target as HTMLFormElement;
			if (form.dataset.editId) void saveEdit(form);
			else void send(form, form.dataset.replyTo ? Number(form.dataset.replyTo) : undefined);
		},
		{ signal },
	);
	root.addEventListener(
		'keydown',
		(e) => {
			const textarea = e.target as HTMLElement;
			if (textarea.tagName === 'TEXTAREA' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				(textarea.closest('form') as HTMLFormElement | null)?.requestSubmit();
			}
		},
		{ signal },
	);
	root.addEventListener(
		'input',
		(e) => {
			const textarea = e.target as HTMLTextAreaElement;
			if (textarea.closest('[data-comment-form]')) {
				root.querySelector('[data-comment-counter]')!.textContent = `${textarea.value.length} / 1000`;
			}
		},
		{ signal },
	);
}

function initPage() {
	pageAbort?.abort();
	pageAbort = new AbortController();
	const { signal } = pageAbort;
	initHeader(signal);
	initScrollSpy(signal);
	initTableOfContents(signal);
	initReadingProgress(signal);
	initReveal(signal);
	initTimeline(signal);
	initViews(signal);
	initAccount(signal);
	initAuthForm(signal);
	initComments(signal);
	initArticleController(signal);
	initSidebarNavFilterAndCollapse(signal);
	initDetailsAnimation(signal);
	initBackToTop(signal);
	initLazyImages();
	initEmailFix();
	scrollToHash();
}

initPageProgressBar();
initArticleMorph();
// ClientRouter 换页会用新文档的 <html> 属性覆盖当前属性，而 head 里的内联脚本不会重跑，
// 所以要在 swap 后补回 js 标记，否则 html.js 相关样式（入场动画、时间线吸顶）全部失效
document.addEventListener('astro:after-swap', () => document.documentElement.classList.add('js'));
document.addEventListener('click', onClick);
document.addEventListener('keydown', onKeydown);
window.addEventListener('scroll', onGlobalScroll, { passive: true });
window.addEventListener('resize', onGlobalScroll, { passive: true });
document.addEventListener('astro:page-load', initPage);
if (document.readyState !== 'loading') {
	initPage();
}
