// 浏览量（features/views.ts）和全站访问统计（features/visits.ts）共用的前端守卫
import { cachedAccount, getAccount } from './account';

/** 是否为自动化浏览器（Playwright / Puppeteer / Selenium / --headless=new 等） */
export function isAutomated() {
	return Boolean(navigator.webdriver);
}

/** 当前访客是否确实以站长身份登录（先看缓存，命中时向服务器核实会话是否仍有效） */
export async function isAdminVisitor() {
	if (!cachedAccount()?.isAdmin) return false;
	return Boolean((await getAccount())?.isAdmin);
}

/** 等页面真正可见且非后台预渲染时执行一次；换页取消时自动解绑监听 */
export function whenPageVisible(fn: () => void, signal: AbortSignal) {
	if (signal.aborted) return;
	const isReady = () =>
		document.visibilityState === 'visible' && !(document as Document & { prerendering?: boolean }).prerendering;
	if (isReady()) {
		fn();
		return;
	}
	const local = new AbortController();
	const onAbort = () => local.abort();
	signal.addEventListener('abort', onAbort, { once: true });
	const check = () => {
		if (!isReady() || signal.aborted) return;
		local.abort();
		signal.removeEventListener('abort', onAbort);
		fn();
	};
	document.addEventListener('visibilitychange', check, { signal: local.signal });
	document.addEventListener('prerenderingchange', check, { signal: local.signal });
}
