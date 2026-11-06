// 全站访问统计：每打开一个页面（含站内换页）向 /api/visits 报一次，站长在 /account/ 里看每天的数字。
// 站长本人登录着时不报（服务端也会再核对一次）；npm run dev 没有接口，不报
import { cachedAccount } from '../core/account';

export function init(signal: AbortSignal) {
	if (import.meta.env.DEV || cachedAccount()?.isAdmin) return;
	// keepalive：刚打开就马上离开的页面也能报出去；不挂 signal，换页不会把它取消
	const send = () => void fetch('/api/visits', { method: 'POST', keepalive: true }).catch(() => {});
	// 浏览器提前在后台加载页面时（如地址栏里还没按回车）脚本已经在跑，等真正打开了再报
	if ((document as Document & { prerendering?: boolean }).prerendering) {
		document.addEventListener('prerenderingchange', send, { once: true, signal });
	} else {
		send();
	}
}
