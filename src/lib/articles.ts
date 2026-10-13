import { getCollection } from 'astro:content';

/** 全部文章，按日期从新到旧排好序（首页、文章列表、文章页、RSS、sitemap 共用） */
export async function getSortedArticles() {
	return (await getCollection('articles')).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}
