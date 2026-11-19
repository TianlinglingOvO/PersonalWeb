// 全站访问统计：每打开一个内容页（含站内前向换页）向 /api/visits 报一次，站长在 /account/ 里看每天的数字。
// 站长本人登录着、404 / 登录 / 账号页、同页自点、浏览器后退 / 前进、后台或自动化页面不报；npm run dev 没有接口，不报
import { TransitionBeforeSwapEvent } from 'astro:transitions/client';
import { isAdminVisitor, isAutomated, whenPageVisible } from '../core/visitors';

let skipNextVisit = false;
let lastCountedPath = '';

export function setup() {
	document.addEventListener('astro:before-swap', (e) => {
		if (!(e instanceof TransitionBeforeSwapEvent)) return;
		skipNextVisit = e.navigationType === 'traverse' || e.from.pathname === e.to.pathname;
	});
}

export function init(signal: AbortSignal) {
	// 最先消费并重置标志，防止早退分支把“跳过”状态泄露到下一次导航
	const skipped = skipNextVisit;
	skipNextVisit = false;
	if (import.meta.env.DEV || document.body.hasAttribute('data-no-visit') || isAutomated()) return;
	if (skipped) {
		lastCountedPath = location.pathname;
		return;
	}
	if (location.pathname === lastCountedPath) return;

	whenPageVisible(() => {
		void (async () => {
			if ((await isAdminVisitor()) || signal.aborted) return;
			lastCountedPath = location.pathname;
			// keepalive：刚打开就马上离开的页面也能报出去；不挂 signal，换页不会把它取消
			void fetch('/api/visits', { method: 'POST', credentials: 'same-origin', keepalive: true }).catch(() => {});
		})();
	}, signal);
}
