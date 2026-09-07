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
		date: z.coerce.string(),
		title: z.string(),
		tag: z.string().default('历程'),
		icon: z.string().default('spark'),
		isHighlight: z.boolean().default(false),
		isFuture: z.boolean().default(false),
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
