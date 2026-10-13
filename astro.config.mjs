// @ts-check
import { satteri } from '@astrojs/markdown-satteri';
import { defineConfig } from 'astro/config';
import contentCheck from './src/lib/content-check.mjs';
import markdownImages from './src/lib/markdown-images.mjs';

// https://astro.build/config
export default defineConfig({
	site: 'https://sutady.top',
	prefetch: {
		prefetchAll: true,
		defaultStrategy: 'viewport',
	},
	// 构建开始前检查所有 /images/... 引用的文件是否存在（大小写敏感），找不到就让构建失败
	integrations: [contentCheck({ root: new URL('./', import.meta.url) })],
	markdown: {
		// Astro 7 默认的 Markdown 处理器 Sätteri，只额外加一个图片插件：给正文图片补上宽高和懒加载属性。
		// 升级 astro 时，package.json 里 @astrojs/markdown-satteri 的版本要和 astro 依赖的版本保持一致
		processor: satteri({
			hastPlugins: [markdownImages({ publicDir: new URL('./public/', import.meta.url) })],
		}),
	},
});
