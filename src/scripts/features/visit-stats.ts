// 账号页（/account/）的访问统计，只有站长能看到：四个汇总格子 + 最近 30 天的柱状图。
// 数据来自 GET /api/visits（functions/api/visits.ts），访问记录由 features/visits.ts 在每个页面上报。
// 柱状图：浅色宽柱是浏览次数，深色窄柱是访客数（访客不会多于浏览）；鼠标移上去、点一下或用方向键切换日期，
// 上方显示那天的数字，默认显示今天。鼠标、键盘事件在 setup() 里用文档级委托处理，当前页的图表状态放在 chart 里
import { api } from '../core/api';
import { getAccount } from '../core/account';
import { el } from '../core/dom';
import { animateHeight, slide } from '../core/motion';

interface DayStat {
	day: string; // 北京时间的日期，例如 2026-11-06
	pv: number;
	uv: number;
}

interface Stats {
	/** 最近 30 天，从早到晚，没人来的日子是 0 */
	days: DayStat[];
	/** 累计浏览次数 */
	total: number;
	/** 第一天有记录的日期 */
	since: string | null;
}

// 汇总格子（键名和 account.astro 的 statRanges 对应）。近 7 / 30 天的访客是每天相加
const RANGES: Record<string, (days: DayStat[]) => DayStat[]> = {
	today: (days) => days.slice(-1),
	yesterday: (days) => days.slice(-2, -1),
	week: (days) => days.slice(-7),
	month: (days) => days,
};

const fmt = (n: number) => n.toLocaleString('zh-CN');
const partsOf = (day: string) => day.split('-').map(Number);
const WEEKDAYS = '日一二三四五六';
// 日期字符串当作 UTC 解析，取到的星期就是这一天本身的星期，和浏览器所在时区无关
const weekday = (day: string) => `周${WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]}`;
const sum = (days: DayStat[], key: 'pv' | 'uv') => days.reduce((total, d) => total + d[key], 0);
const closest = (target: EventTarget | null, selector: string) =>
	target instanceof Element ? target.closest<HTMLElement>(selector) : null;

/** 纵轴刻度：步长取 1 / 2 / 5 × 10ⁿ 的整数，大约分 3 格；数据很少时至少画到 3 */
function niceScale(max: number) {
	const target = Math.max(max, 3);
	const raw = target / 3;
	const magnitude = 10 ** Math.floor(Math.log10(raw));
	const step = Math.max(1, [1, 2, 5, 10].map((k) => k * magnitude).find((s) => s >= raw) ?? raw);
	return { step, top: Math.ceil(target / step) * step };
}

/** 当前页面上已经画好的图表（没有时为 null，换页时清空） */
let chart: { days: DayStat[]; active: number; bars: HTMLElement; readout: HTMLElement } | null = null;

/**
 * 选中某一天：整列淡淡地标出来，上方显示那天的数字。
 * announce 只在键盘切换时为 true：读屏软件这时才播报，鼠标扫过一排柱子时不会连着念几十条
 */
function select(index: number, announce = false) {
	if (!chart) return;
	const { days, bars, readout } = chart;
	const i = Math.max(0, Math.min(days.length - 1, index));
	if (i === chart.active || !days[i]) return;
	bars.children[chart.active]?.classList.remove('is-active');
	bars.children[i]?.classList.add('is-active');
	chart.active = i;
	const { day, pv, uv } = days[i];
	const [, month, date] = partsOf(day);
	const when = i === days.length - 1 ? '今天' : i === days.length - 2 ? '昨天' : weekday(day);
	readout.setAttribute('aria-live', announce ? 'polite' : 'off');
	readout.replaceChildren(el('strong', '', `${month}月${date}日`), ` ${when} · 访客 `, el('strong', '', fmt(uv)), ' · 浏览 ', el('strong', '', fmt(pv)));
}

export function setup() {
	// 鼠标移到哪天显示哪天；手机上点一下也会触发 pointerover
	document.addEventListener('pointerover', (e) => {
		const column = closest(e.target, '[data-stats-bars] [data-i]');
		if (column) select(Number(column.dataset.i));
	});
	// 鼠标移出图表回到今天（触摸不算，手机上点哪天就停在哪天）
	document.addEventListener('pointerout', (e) => {
		if (!chart || e.pointerType !== 'mouse') return;
		const plot = closest(e.target, '[data-stats-plot]');
		if (plot && !(e.relatedTarget instanceof Node && plot.contains(e.relatedTarget))) select(chart.days.length - 1);
	});
	// 图表获得焦点时，←/→ 切换日期，Home / End 跳到最早 / 今天
	document.addEventListener('keydown', (e) => {
		if (!chart || !closest(e.target, '[data-stats-plot]')) return;
		const { active, days } = chart;
		const next = ({ ArrowLeft: active - 1, ArrowRight: active + 1, Home: 0, End: days.length - 1 } as Record<string, number>)[e.key];
		if (next === undefined) return;
		e.preventDefault();
		select(next, true);
	});
}

export function init(signal: AbortSignal) {
	chart = null;
	const card = document.querySelector<HTMLElement>('[data-visit-stats]');
	if (!card) return;
	signal.addEventListener('abort', () => (chart = null));
	const q = <T extends HTMLElement = HTMLElement>(selector: string) => card.querySelector<T>(selector)!;
	const status = q('[data-stats-status]');
	const body = q('[data-stats-body]');

	const render = (stats: Stats) => {
		const { days } = stats;
		for (const [key, pick] of Object.entries(RANGES)) {
			const part = pick(days);
			q(`[data-stat-uv="${key}"]`).textContent = fmt(sum(part, 'uv'));
			q(`[data-stat-pv="${key}"]`).textContent = fmt(sum(part, 'pv'));
		}
		card.style.setProperty('--stats-days', String(days.length));

		// 横向参考线和纵轴数字
		const { step, top } = niceScale(Math.max(0, ...days.map((d) => d.pv)));
		const ticks = Array.from({ length: top / step + 1 }, (_, k) => {
			const line = el('span');
			line.style.setProperty('--y', `${((k * step) / top) * 100}%`);
			line.append(el('span', '', fmt(k * step)));
			return line;
		});
		q('[data-stats-grid]').replaceChildren(...ticks);
		// 左侧留给纵轴数字的宽度按最宽的那个数字量出来（“1,000”“10,000”也放得下），和 CSS 里数字与参考线的间距一致
		const widest = Math.max(0, ...ticks.map((line) => line.firstElementChild!.getBoundingClientRect().width));
		if (widest) card.style.setProperty('--stats-gutter', `calc(${Math.ceil(widest)}px + 0.5rem)`);

		// 每天一列：整列都是鼠标的感应区，两根柱子用 ::before（浏览）和 ::after（访客）画
		const bars = q('[data-stats-bars]');
		bars.replaceChildren(
			...days.map((d, i) => {
				const column = el('li');
				column.dataset.i = String(i);
				column.style.setProperty('--i', String(i));
				column.style.setProperty('--pv', `${(d.pv / top) * 100}%`);
				column.style.setProperty('--uv', `${(d.uv / top) * 100}%`);
				return column;
			}),
		);
		// 横轴：从今天往前每隔 7 天标一个日期
		q('[data-stats-axis]').replaceChildren(
			...days.flatMap((d, i) => {
				const fromEnd = days.length - 1 - i;
				if (fromEnd % 7) return [];
				const [, month, date] = partsOf(d.day);
				const label = el('span', '', fromEnd === 0 ? '今天' : `${month}/${date}`);
				label.style.gridColumn = String(i + 1);
				return [label];
			}),
		);

		const [year, month, date] = partsOf(stats.since ?? days[days.length - 1].day);
		q('[data-stats-foot]').textContent =
			`从 ${year}年${month}月${date}日 开始统计，累计浏览 ${fmt(stats.total)} 次。` +
			'同一个人一天里来多少次都只算一位访客（近 7 天、近 30 天是把每天的访客相加），你自己登录时的浏览不算在内。';
		chart = { days, active: -1, bars, readout: q('[data-stats-readout]') };
		select(days.length - 1);
	};

	// 显示 / 隐藏整张卡片：页面刚打开时跟着账号面板一起出场，不单独动画；面板已经在屏幕上时（登录状态变了）滑开 / 收起
	let shown = false;
	const setShown = (show: boolean, animate: boolean) => {
		if (show === shown) return;
		shown = show;
		if (!animate || card.parentElement?.closest('[hidden]')) {
			card.hidden = !show;
			return;
		}
		if (show) card.hidden = false;
		slide(card, show, () => {
			if (!shown) card.hidden = true;
		});
	};

	let loaded = false;
	const load = async (animate: boolean) => {
		const account = await getAccount();
		if (signal.aborted) return;
		setShown(Boolean(account?.isAdmin), animate);
		if (!account?.isAdmin || loaded) return;
		loaded = true;
		try {
			const stats = await api<Stats>('/api/visits', { signal });
			if (!stats.days?.length) throw new Error('empty');
			// 先让内容区显示出来再画图：量纵轴数字的宽度需要它在页面上
			animateHeight(card, () => {
				status.hidden = true;
				body.hidden = false;
				render(stats);
			});
		} catch (err) {
			if ((err as Error).name === 'AbortError') return;
			loaded = false;
			status.textContent = '统计数据加载不出来，稍后刷新试试';
		}
	};
	void load(false);
	document.addEventListener('account-change', () => void load(true), { signal });
}
