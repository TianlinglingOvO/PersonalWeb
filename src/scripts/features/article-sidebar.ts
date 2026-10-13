// 文章页左侧栏：分类下拉筛选、收起 / 展开（收起状态记在 localStorage）
import { $, $all } from '../core/dom';
import { ARTICLE_SIDEBAR_QUERY } from '../core/breakpoints';
import { animateHeight, staggerIn } from '../core/motion';

export function init(signal: AbortSignal) {
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
					const apply = () =>
						items.forEach((item) => {
							const match = val === 'all' || item.getAttribute('data-sidebar-category') === val;
							item.hidden = !match;
							if (match) visible++;
						});
					if (list) animateHeight(list, apply);
					else apply();
					staggerIn(items.filter((item) => !item.hidden), 30);

					if (emptyHint) emptyHint.hidden = visible > 0;
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
			if (window.matchMedia(ARTICLE_SIDEBAR_QUERY).matches && localStorage.getItem('article_sidebar_collapsed') === '1') {
				layout.classList.add('is-sidebar-collapsed');
			}
		} catch {}

		collapseBtn?.addEventListener('click', () => setCollapsed(true), { signal });
		expandBtn?.addEventListener('click', () => setCollapsed(false), { signal });
	}
}
