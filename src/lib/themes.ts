// 主题清单：每套主题的名字、开关上的图标和各位置的插画。配色写在 src/styles/themes/<主题名>.css。
// 新增主题：在这里加一项 + 新建同名的配色文件 + 插画放进 public/images/themes/<主题名>/。
// 默认主题由 content/site.json 的 defaultTheme 指定，写了不存在的主题名会让构建直接失败。
import { site } from './site';

export interface ThemeImage {
	src: string;
	width: number;
	height: number;
}

export interface Theme {
	/** 给访客看的名字（开关的提示文字、读屏） */
	name: string;
	/** 切换开关上的图标：Icon.astro 里的图标名 */
	icon: string;
	/** 只在这套主题下显示在页脚的说明（例如同人致敬声明） */
	credit?: string;
	/** 首页三处插画（竖版，显示时裁成 3:4）和 404 页插画；404 有多张时每次随机显示一张 */
	images: {
		hero: ThemeImage;
		about: ThemeImage;
		connect: ThemeImage;
		notFound: [ThemeImage, ...ThemeImage[]];
	};
}

export type ImageSlot = Exclude<keyof Theme['images'], 'notFound'>;

const img = (src: string, width: number, height: number): ThemeImage => ({ src, width, height });

export const themes = {
	macaron: {
		name: '粉色马卡龙',
		icon: 'bow',
		images: {
			hero: img('/images/themes/macaron/hero.jpg', 990, 1400),
			about: img('/images/themes/macaron/about.jpg', 990, 1400),
			connect: img('/images/themes/macaron/connect.jpg', 990, 1400),
			notFound: [img('/images/themes/macaron/not-found.jpg', 1030, 1400)],
		},
	},
	claude: {
		name: 'Claude',
		icon: 'spark',
		credit: 'Claude 主题为同人致敬，与 Anthropic 官方无关',
		images: {
			hero: img('/images/themes/claude/hero.webp', 990, 1485),
			about: img('/images/themes/claude/about.webp', 990, 1320),
			connect: img('/images/themes/claude/connect.webp', 940, 1254),
			notFound: [
				img('/images/themes/claude/404-suspended.webp', 960, 540),
				img('/images/themes/claude/404-region.webp', 960, 540),
				img('/images/themes/claude/404-avoid.webp', 640, 640),
				img('/images/themes/claude/404-noodle.webp', 600, 800),
			],
		},
	},
} satisfies Record<string, Theme>;

export type ThemeId = keyof typeof themes;

export const themeIds = Object.keys(themes) as ThemeId[];

const isThemeId = (value: string): value is ThemeId => value in themes;

if (!isThemeId(site.defaultTheme)) {
	throw new Error(`content/site.json 的 defaultTheme 写的是“${site.defaultTheme}”，可选的主题只有：${themeIds.join('、')}`);
}

export const defaultTheme: ThemeId = site.defaultTheme;

/**
 * 由清单生成的样式，BaseLayout 内联进 <head>（所以新增主题时不用手写）：
 * 主题总数和每套主题在开关上的序号（滑块位置），以及带 data-theme-only 的元素只在对应主题下显示
 */
export const themeCss =
	`:root{--theme-count:${themeIds.length}}` +
	themeIds
		.map(
			(id, i) =>
				`:root[data-theme="${id}"]{--theme-index:${i}}` +
				`:root[data-theme="${id}"] [data-theme-only]:not([data-theme-only="${id}"]){display:none!important}`,
		)
		.join('');
