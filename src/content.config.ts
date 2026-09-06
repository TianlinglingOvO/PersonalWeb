import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const about = defineCollection({
	loader: glob({ pattern: 'about.md', base: './content' }),
	schema: z.object({
		title: z.string().optional(),
	}),
});

const projects = defineCollection({
	loader: glob({ pattern: '*.md', base: './content/projects' }),
	schema: z.object({
		title: z.string(),
		summary: z.string(),
		tags: z.array(z.string()).default([]),
		url: z.string().optional(),
		order: z.number().default(0),
	}),
});

const articles = defineCollection({
	loader: glob({ pattern: '*.md', base: './content/articles' }),
	schema: z.object({
		title: z.string(),
		date: z.coerce.date(),
		description: z.string(),
		category: z.enum(['教程', '科普']),
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

export const collections = { about, projects, articles, services };
