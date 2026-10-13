// RSS 订阅（/rss.xml，构建时生成的静态文件）：每篇文章只放标题、摘要和链接，在阅读器里点开看全文
import type { APIRoute } from 'astro';
import { getSortedArticles } from '../lib/articles';
import { escapeXml, site } from '../lib/site';

export const GET: APIRoute = async ({ site: siteUrl }) => {
	const base = siteUrl ?? new URL('https://sutady.top');
	const articles = await getSortedArticles();
	const items = articles.map((post) => {
		const link = new URL(`/articles/${post.id}/`, base).href;
		return [
			'    <item>',
			`      <title>${escapeXml(post.data.title)}</title>`,
			`      <link>${link}</link>`,
			`      <guid isPermaLink="true">${link}</guid>`,
			`      <description>${escapeXml(post.data.description)}</description>`,
			`      <category>${escapeXml(post.data.category)}</category>`,
			`      <pubDate>${post.data.date.toUTCString()}</pubDate>`,
			'    </item>',
		].join('\n');
	});
	const xml = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
		'  <channel>',
		`    <title>${escapeXml(site.title)}</title>`,
		`    <link>${base.href}</link>`,
		`    <atom:link href="${new URL('/rss.xml', base).href}" rel="self" type="application/rss+xml" />`,
		`    <description>${escapeXml(site.description)}</description>`,
		'    <language>zh-CN</language>',
		...(articles[0] ? [`    <lastBuildDate>${articles[0].data.date.toUTCString()}</lastBuildDate>`] : []),
		...items,
		'  </channel>',
		'</rss>',
		'',
	].join('\n');
	return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
