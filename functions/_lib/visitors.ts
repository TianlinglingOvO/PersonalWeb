// 浏览量（views.ts）和全站访问统计（visits.ts）共用：北京时间的日期、哪些请求不该计数、访客标识
import { clientIp, sha256 } from './http';

/** 北京时间的日期，例如 2026-10-07；offsetDays 往前推几天 */
export const dayOf = (offsetDays = 0) =>
	new Date(Date.now() + 8 * 3600_000 - offsetDays * 86400_000).toISOString().slice(0, 10);

// 预览部署（<分支或编号>.personalweb-5c2.pages.dev）和正式站共用一个数据库，验收时点开页面不能算进去；
// 正式站 sutady.top 和 personalweb-5c2.pages.dev 照常计数
const PREVIEW_HOST = /\.[^.]+\.pages\.dev$/;
// 会执行页面脚本的爬虫（Googlebot、Baiduspider、无头浏览器等）。(?<!cu) 排除 Cubot 牌手机
const BOT_UA = /(?<!cu)bot|spider|crawl|slurp|headless|lighthouse|inspectiontool/i;

/** 预览部署、没有 User-Agent 或爬虫发来的请求，只查询不计数 */
export function skipCounting(request: Request) {
	const ua = request.headers.get('User-Agent') ?? '';
	return PREVIEW_HOST.test(new URL(request.url).hostname) || !ua || BOT_UA.test(ua);
}

/** 当天的访客标识：IP + UA + 日期的哈希，不存原始 IP，第二天自然换一个 */
export async function visitorOf(request: Request, day: string) {
	return (await sha256(`${clientIp(request)}|${request.headers.get('User-Agent') ?? ''}|${day}`)).slice(0, 32);
}
