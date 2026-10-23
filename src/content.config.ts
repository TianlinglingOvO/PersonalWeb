import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const about = defineCollection({
	loader: glob({ pattern: 'about.md', base: './content' }),
	schema: z.object({
		title: z.string().optional(),
	}),
});

const articles = defineCollection({
	loader: glob({ pattern: '*.md', base: './content/articles' }),
	schema: z.object({
		title: z.string(),
		date: z.coerce.date(),
		description: z.string(),
		category: z.string().default('教程'),
	}),
});

const services = defineCollection({
	loader: glob({ pattern: '*.md', base: './content/services' }),
	schema: z.object({
		title: z.string(),
		summary: z.string(),
		ctaLabel: z.string().default('了解更多 / 联系我'),
		ctaHref: z.string().default('/#connect'),
		order: z.number().default(0),
	}),
});

const timeline = defineCollection({
	loader: glob({ pattern: '*.md', base: './content/timeline' }),
	schema: z.object({
		/** "2026.10.18"（年.月.日）或 "2026.10"（记不清哪天时）；只写年份归入“全年”；未来节点写 "Future"。不加引号时 2026.10 会被当成小数 2026.1，所以月和日都要求两位 */
		date: z.coerce
			.string()
			.regex(/^(\d{4}(\.(0[1-9]|1[0-2])(\.(0[1-9]|[12]\d|3[01]))?)?|Future)$/, '时间线的 date 要写成 "2026.10.18"、"2026.10" 或 "Future"（加英文引号，月和日都写两位）'),
		title: z.string(),
		tag: z.string().default('历程'),
		isHighlight: z.boolean().default(false),
		isFuture: z.boolean().default(false),
		/** 关联的文章（content/articles 里的文件名，不带 .md）：卡片上自动生成“阅读文章”按钮，文章页也会反过来链接到这一条 */
		article: z.string().optional(),
		links: z
			.array(
				z.object({
					label: z.string(),
					href: z.string(),
					isExternal: z.boolean().default(false),
				}),
			)
			.default([]),
		order: z.number().default(0),
	}),
});

export const collections = { about, articles, services, timeline };
