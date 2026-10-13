// 站点地图（/sitemap.xml，构建时生成）：告诉搜索引擎有哪些页面。登录页、账号页不需要收录，不放进来
import type { APIRoute } from 'astro';
import { getSortedArticles } from '../lib/articles';
import { escapeXml } from '../lib/site';

export const GET: APIRoute = async ({ site: siteUrl }) => {
	const base = siteUrl ?? new URL('https://sutady.top');
	const articles = await getSortedArticles();
	const pages: { path: string; lastmod?: Date }[] = [
		{ path: '/' },
		{ path: '/articles/' },
		...articles.map((post) => ({ path: `/articles/${post.id}/`, lastmod: post.data.date })),
	];
	const xml = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		...pages.map(({ path, lastmod }) => {
			const loc = `<loc>${escapeXml(new URL(path, base).href)}</loc>`;
			return `  <url>${loc}${lastmod ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}</url>`;
		}),
		'</urlset>',
		'',
	].join('\n');
	return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
