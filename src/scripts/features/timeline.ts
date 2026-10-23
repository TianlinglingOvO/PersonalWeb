// 历程年历（Section 02）
//   电脑端：年份标签切换年份（←/→ 键也行），点月份格查看当月经历，点格子里的小标签会闪一下对应卡片；
//           同月经历较多时折叠，只展开一张，其余是一行“日期 + 标题”，点哪行展开哪张
//   手机端（≤860px）：按年份折叠的竖向时间线；展开的年份只显示最近几条，更早的收在“展开这一年更早的 N 条”里
//   链接 /#tl-<节点文件名>（如文章页的“收录于成长历程”）会打开对应年份和月份，定位并闪一下那张卡片
import { $all } from '../core/dom';
import { MOBILE_QUERY } from '../core/breakpoints';
import { animateHeight, EASE_OUT, prefersReducedMotion, slide, staggerIn } from '../core/motion';

/** 只保留当前真正显示出来的元素（手机端收起的“更早的经历”不参与浮现动画） */
const visible = (els: Element[]) => els.filter((el) => el.getClientRects().length > 0);

/** 卡片闪一下（重新触发 CSS 动画） */
function flash(entry: HTMLElement) {
	entry.classList.remove('is-flash');
	void entry.offsetWidth;
	entry.classList.add('is-flash');
}

export function init(signal: AbortSignal) {
	const section = document.querySelector<HTMLElement>('[data-timeline]');
	if (!section) return;

	const tabs = $all<HTMLButtonElement>('[data-timeline-tab]', section);
	const panels = $all<HTMLElement>('[data-timeline-panel]', section);
	const mobileQuery = window.matchMedia(MOBILE_QUERY);
	const reducedMotion = prefersReducedMotion();

	// 切换年份：往后的年份从右侧翻入，往前的年份从左侧翻入
	const showYear = (index: number, { focus = false, animate = true } = {}) => {
		const current = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
		if (index < 0 || index >= tabs.length) return;
		tabs.forEach((tab, i) => {
			tab.setAttribute('aria-selected', String(i === index));
			tab.tabIndex = i === index ? 0 : -1;
		});
		const year = tabs[index].dataset.timelineTab;
		const container = panels[0]?.parentElement;
		const swap = () => panels.forEach((panel) => panel.classList.toggle('is-active', panel.dataset.timelinePanel === year));
		if (animate && container && !mobileQuery.matches) animateHeight(container, swap);
		else swap();
		if (focus) tabs[index].focus();
		const panel = panels.find((p) => p.dataset.timelinePanel === year);
		if (animate && panel && index !== current && !reducedMotion) {
			const dx = index > current ? 28 : -28;
			panel.animate(
				[
					{ opacity: 0, transform: `translateX(${dx}px)` },
					{ opacity: 1, transform: 'none' },
				],
				{ duration: 380, easing: EASE_OUT },
			);
		}
	};

	// 选中月份：右侧（窄屏在下方）换成当月的全部经历，返回这个月的详情块
	const selectMonth = (panel: HTMLElement, cell: HTMLElement, animate = true) => {
		const month = cell.dataset.timelineMonth;
		$all<HTMLButtonElement>('[data-timeline-month]', panel).forEach((c) => {
			c.classList.toggle('is-selected', c === cell);
			c.setAttribute('aria-pressed', String(c === cell));
		});
		const details = $all<HTMLElement>('[data-timeline-month-detail]', panel);
		const swap = () => details.forEach((d) => d.classList.toggle('is-active', d.dataset.timelineMonthDetail === month));
		if (animate) animateHeight(panel, swap);
		else swap();
		const detail = details.find((d) => d.dataset.timelineMonthDetail === month);
		if (detail && animate) staggerIn([...detail.children], 60);
		return detail;
	};

	// 折叠的月份（电脑端）：展开这一张、收起同月其余的。animate 为 false 时直接切换（如月份还没显示出来时）
	const openEntry = (entry: HTMLElement, animate = true) => {
		const detail = entry.closest<HTMLElement>('.timeline-month-detail.is-foldable');
		if (!detail || entry.classList.contains('is-open')) return;
		const mutate = () => $all<HTMLElement>('[data-entry]', detail).forEach((e) => e.classList.toggle('is-open', e === entry));
		if (!animate || mobileQuery.matches) return mutate();
		animateHeight(detail, mutate);
		const card = entry.querySelector('.timeline-micro-card');
		if (card) staggerIn([card]);
	};

	// 手机端：显示 / 收起这一年里“更早的经历”
	const setEarly = (panel: HTMLElement, show: boolean, animate = true) => {
		const button = panel.querySelector<HTMLButtonElement>('[data-timeline-early]');
		const body = panel.querySelector<HTMLElement>('.timeline-year-body');
		if (!button || !body) return;
		const count = button.dataset.timelineEarly;
		button.setAttribute('aria-expanded', String(show));
		button.textContent = show ? `收起更早的 ${count} 条` : `展开这一年更早的 ${count} 条`;
		const mutate = () => panel.classList.toggle('is-showing-early', show);
		if (!animate) return mutate();
		animateHeight(body, mutate);
		if (show) staggerIn(visible($all('.timeline-month-detail.is-early > .timeline-detail-title, .timeline-entry.is-early', panel)), 50);
	};

	tabs.forEach((tab, i) => {
		tab.addEventListener('click', () => showYear(i), { signal });
		tab.addEventListener(
			'keydown',
			(e) => {
				const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
				if (next === undefined) return;
				e.preventDefault();
				showYear(Math.min(Math.max(next, 0), tabs.length - 1), { focus: true });
			},
			{ signal },
		);
	});

	panels.forEach((panel) => {
		// 点月份格；点的是某条小标签时，展开（折叠的月份）并闪一下对应卡片
		$all<HTMLButtonElement>('[data-timeline-month]', panel).forEach((cell) => {
			cell.addEventListener(
				'click',
				(e) => {
					const ref = (e.target as HTMLElement).closest<HTMLElement>('[data-entry-ref]')?.dataset.entryRef;
					const entry = ref ? panel.querySelector<HTMLElement>(`[data-entry="${CSS.escape(ref)}"]`) : null;
					// 换到别的月份时先直接展开那张，随月份一起出现；已经在看这个月时带动画展开
					const shown = entry?.closest('.timeline-month-detail')?.classList.contains('is-active');
					if (entry && !shown) openEntry(entry, false);
					selectMonth(panel, cell);
					if (!entry) return;
					if (shown) openEntry(entry);
					flash(entry);
					// 窄屏时详情在年历下方，滚过去让用户看到
					if (entry.getBoundingClientRect().top > window.innerHeight) {
						entry.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
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
				if (expand) staggerIn(visible($all('.timeline-early-toggle, .timeline-detail-title, .timeline-entry, .timeline-future-note', body)), 50);
			},
			{ signal },
		);

		const early = panel.querySelector<HTMLButtonElement>('[data-timeline-early]');
		early?.addEventListener('click', () => setEarly(panel, early.getAttribute('aria-expanded') !== 'true'), { signal });

		// 折叠的月份里点收起的那一行
		$all<HTMLButtonElement>('[data-timeline-row]', panel).forEach((row) => {
			row.addEventListener(
				'click',
				() => {
					const entry = row.closest<HTMLElement>('[data-entry]');
					if (entry) openEntry(entry);
				},
				{ signal },
			);
		});
	});

	// 链接 /#tl-<节点文件名>：打开那一年（电脑端选中那个月，手机端展开年份和更早的经历），定位并闪一下
	const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
	const entry = target?.matches('[data-entry]') ? target : null;
	const panel = entry?.closest<HTMLElement>('[data-timeline-panel]');
	if (!entry || !panel) return;
	openEntry(entry, false);
	if (mobileQuery.matches) {
		panel.querySelector('[data-timeline-year-toggle]')?.setAttribute('aria-expanded', 'true');
		panel.classList.remove('is-folded');
		if (entry.classList.contains('is-early')) setEarly(panel, true, false);
	} else {
		showYear(
			tabs.findIndex((tab) => tab.dataset.timelineTab === panel.dataset.timelinePanel),
			{ animate: false },
		);
		const month = entry.closest<HTMLElement>('[data-timeline-month-detail]')?.dataset.timelineMonthDetail;
		const cell = month != null ? panel.querySelector<HTMLElement>(`[data-timeline-month="${month}"]`) : null;
		if (cell) selectMonth(panel, cell, false);
	}
	requestAnimationFrame(() => {
		entry.scrollIntoView({ block: 'center', behavior: 'instant' });
		flash(entry);
	});
}
