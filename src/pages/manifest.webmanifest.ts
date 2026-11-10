// 网站清单（/manifest.webmanifest，构建时生成的静态文件）：手机“添加到桌面”后从桌面打开时，
// 系统按这里的名字、图标和底色画开屏画面。没有它时浏览器只能拿 180px 的小图标放大、垫一张白底，又糊又突兀。
// 开屏画面是系统画的，读不到访客在站内选的主题，所以底色固定用默认主题的
import type { APIRoute } from 'astro';
import { site } from '../lib/site';
import { defaultTheme, themeColors } from '../lib/themes';

// 换图标后把这个数字和 BaseLayout.astro 里图标链接的 ?v= 一起加一
const ICON_VERSION = 9;

export const GET: APIRoute = () => {
	const color = themeColors[defaultTheme];
	const icon = (file: string, size: number, purpose: 'any' | 'maskable') => ({
		src: `/${file}?v=${ICON_VERSION}`,
		sizes: `${size}x${size}`,
		type: 'image/png',
		purpose,
	});
	const manifest = {
		name: site.title,
		short_name: site.name,
		description: site.description,
		lang: 'zh-CN',
		id: '/',
		start_url: '/',
		scope: '/',
		display: 'standalone',
		// 开屏底色和状态栏颜色都用页面底色，开屏结束后和页面无缝衔接
		background_color: color,
		theme_color: color,
		icons: [
			// 带圆角、四角透明：开屏画面和不裁图标的系统用
			icon('icon-192.png', 192, 'any'),
			icon('icon-512.png', 512, 'any'),
			// 铺满、四周留边：系统会把图标裁成圆形 / 水滴形时用
			icon('icon-maskable-512.png', 512, 'maskable'),
		],
	};
	return new Response(JSON.stringify(manifest, null, '\t'), {
		headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
	});
};
