import siteJson from '../../content/site.json';
import socialJson from '../../content/social.json';

export type SocialAction = 'link' | 'copy' | 'qr';

export type SocialItem = {
	id: string;
	label: string;
	value: string;
	href?: string;
	action: SocialAction;
	qr?: string;
};

export const site = siteJson;

export const social = socialJson as {
	primary: SocialItem[];
	secondary: SocialItem[];
};

export const nav = [
	{ href: '/#about', label: '关于', section: 'about' },
	{ href: '/#projects', label: '项目', section: 'projects' },
	{ href: '/#articles', label: '文章', section: 'articles' },
	{ href: '/#services', label: '服务', section: 'services' },
	{ href: '/#connect', label: '联系', section: 'connect' },
] as const;

export function formatDate(date: Date) {
	return date.toLocaleDateString('zh-CN', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
}
