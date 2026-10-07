import type { Env } from './http';

export const SLUG = /^[a-z0-9_-]{1,80}$/;

/** 只认真实存在的文章（问一下静态资源里有没有这一页），防止被刷出一堆垃圾记录 */
export async function articleExists(env: Env, request: Request, slug: string) {
	if (!SLUG.test(slug)) return false;
	const page = await env.ASSETS.fetch(new URL(`/articles/${slug}/`, request.url));
	await page.body?.cancel();
	return page.ok;
}
