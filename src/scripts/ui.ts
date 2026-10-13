// 全站唯一的客户端脚本入口（BaseLayout 底部加载）。这里只负责“接线”，具体功能都在 features/ 里：
//   setup()       整个会话只执行一次：注册文档级事件委托、换页钩子
//   init(signal)  每次换页执行一次；监听器等都挂在 signal 上，换页时自动解绑
// 新功能：在 features/ 新建一个文件，再加进下面的 features 列表。约定见 AGENTS.md 第 7 节
import { setupScrollBus } from './core/scroll';
import * as accountMenu from './features/account-menu';
import * as accountPage from './features/account-page';
import * as articleList from './features/article-list';
import * as articleSidebar from './features/article-sidebar';
import * as authForm from './features/auth-form';
import * as comments from './features/comments';
import * as contact from './features/contact';
import * as disclosure from './features/disclosure';
import * as header from './features/header';
import * as lightbox from './features/lightbox';
import * as links from './features/links';
import * as reveal from './features/reveal';
import * as timeline from './features/timeline';
import * as toc from './features/toc';
import * as transitions from './features/transitions';
import * as views from './features/views';

interface Feature {
	setup?: () => void;
	init?: (signal: AbortSignal) => void;
}

// 每次换页按这个顺序初始化
const features: Feature[] = [
	transitions,
	header,
	toc,
	reveal,
	timeline,
	views,
	accountMenu,
	authForm,
	accountPage,
	comments,
	articleList,
	articleSidebar,
	lightbox,
	disclosure,
	contact,
	links,
];

let pageAbort: AbortController | null = null;
let initializedBody: HTMLElement | null = null;

function initPage() {
	// 首次打开页面时，脚本加载后会先直接初始化一次，整页 load 后 Astro 又会派发一次 astro:page-load；
	// 换页时 Astro 会换掉整个 <body>，所以同一个 body 只初始化一次，否则每个接口都会被请求两次
	if (document.body === initializedBody) return;
	initializedBody = document.body;
	pageAbort?.abort();
	pageAbort = new AbortController();
	const { signal } = pageAbort;
	for (const feature of features) feature.init?.(signal);
}

setupScrollBus();
for (const feature of features) feature.setup?.();
document.addEventListener('astro:page-load', initPage);
// 脚本是 module，执行时页面已经解析完：直接初始化，不用等图片都加载完才触发的 astro:page-load
if (document.readyState !== 'loading') initPage();
