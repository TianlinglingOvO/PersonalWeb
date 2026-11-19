// 浏览量（views.ts）和全站访问统计（visits.ts）共用：北京时间的日期、哪些请求不该计数、访客标识
import { clientIp, sha256 } from './http';

/** 北京时间的日期，例如 2026-10-07；offsetDays 往前推几天 */
export const dayOf = (offsetDays = 0, now = Date.now()) =>
	new Date(now + 8 * 3600_000 - offsetDays * 86400_000).toISOString().slice(0, 10);

// *.pages.dev（含预览部署和默认镜像域名）和正式站共用一个数据库，不能写入正式统计；
// 仅正式域名 sutady.top（及本地调试地址）计数
const PAGES_DEV_HOST = /\.pages\.dev$/i;
// 会执行页面脚本或发请求抓页面的爬虫、预览器、测速监控、自动化工具与 HTTP 客户端。
// (?<!cu) 保留，避免误伤 Cubot 手机
const BOT_UA =
	/(?<!cu)bot|spider|crawl|slurp|headless|lighthouse|inspectiontool|bingpreview|facebookexternalhit|meta-external|googleother|google-read-aloud|mediapartners-google|apis-google|perplexity-user|claude-web|anthropic-ai|ia_archiver|pagespeed|gtmetrix|pingdom|\bptst\b|phantomjs|playwright|puppeteer|selenium|curl\/|wget\/|python-requests|python-httpx|go-http-client|scrapy|postmanruntime|node-fetch|axios\//i;

/** *.pages.dev 域名、没有 User-Agent 或爬虫 / 自动化工具发来的请求，只查询不计数 */
export function skipCounting(request: Request) {
	const ua = request.headers.get('User-Agent') ?? '';
	return PAGES_DEV_HOST.test(new URL(request.url).hostname) || !ua || BOT_UA.test(ua);
}

/** 当天的访客标识：IP + UA + 日期的哈希，不存原始 IP，第二天自然换一个 */
export async function visitorOf(request: Request, day: string) {
	return (await sha256(`${clientIp(request)}|${request.headers.get('User-Agent') ?? ''}|${day}`)).slice(0, 32);
}
