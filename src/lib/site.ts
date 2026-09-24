import siteJson from '../../content/site.json';
import socialJson from '../../content/social.json';

export type SocialAction = 'link' | 'copy';
export type SocialGroup = 'im' | 'social' | 'dev';

export type SocialItem = {
	id: string;
	label: string;
	value: string;
	href?: string;
	action: SocialAction;
	group: SocialGroup;
};

export const site = siteJson;

export const social = socialJson as {
	primary: SocialItem[];
};

export const nav = [
	{ href: '/#about', label: '关于', section: 'about' },
	{ href: '/#timeline', label: '历程', section: 'timeline' },
	{ href: '/#articles', label: '文章', section: 'articles' },
	{ href: '/#services', label: '服务', section: 'services' },
	{ href: '/#connect', label: '联系', section: 'connect' },
] as const;

export const articleCategories = ['教程', '科普'] as const;
export type ArticleCategory = (typeof articleCategories)[number];

export function formatDate(date: Date) {
	return date.toLocaleDateString('zh-CN', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
}

// 预计阅读时长：中文按每分钟 400 字、英文按每分钟 200 词估算，代码块与链接地址不计入
export function readingMinutes(body = '') {
	const text = body
		.replace(/```[\s\S]*?```/g, '')
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>/g, '');
	const cjk = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
	const words = text.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9]+/g)?.length ?? 0;
	return Math.max(1, Math.round(cjk / 400 + words / 200));
}
