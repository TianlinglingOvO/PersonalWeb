/**
 * Markdown 图片的构建期处理。这是 Astro 7 默认 Markdown 处理器 Sätteri 的 hast 插件，在 astro.config.mjs 里注册；
 * 文章、关于我、时间线、服务说明里的站内图片（以 / 开头）都会经过这里：
 *   1. 读取图片文件头补上 width / height，图片加载出来之前就占好位置，正文不会跳动；
 *   2. 补上 loading="lazy" 和 decoding="async"，没滑到的图片不会提前下载。
 * 图片是否存在由 src/lib/content-check.mjs 在构建开始时统一检查（这里找不到文件就跳过）。
 * 注意：Astro 会缓存渲染好的内容（.astro/data-store.json），改了这个文件后先删掉 .astro/ 再构建才能看到效果。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @param {{ publicDir: URL }} options publicDir：public 目录 */
export default function markdownImages(options) {
	const publicDir = fileURLToPath(options.publicDir);
	return {
		name: 'site-markdown-images',
		element: {
			filter: ['img'],
			visit(/** @type {any} */ node, /** @type {any} */ ctx) {
				const props = node.properties ?? {};
				const src = typeof props.src === 'string' ? props.src : '';
				if (!src.startsWith('/') || src.startsWith('//')) return;

				if (props.width == null && props.height == null) {
					const size = imageSize(path.join(publicDir, decodeURIComponent(src.split(/[?#]/)[0])));
					if (size) {
						ctx.setProperty(node, 'width', size.width);
						ctx.setProperty(node, 'height', size.height);
					}
				}
				if (props.loading == null) ctx.setProperty(node, 'loading', 'lazy');
				if (props.decoding == null) ctx.setProperty(node, 'decoding', 'async');
			},
		},
	};
}

/**
 * 读取 PNG / JPEG / GIF / WebP 的宽高（只看文件头，不解码图片）。读不出来时返回 null，这时只补懒加载属性。
 * @param {string} file
 * @returns {{ width: number, height: number } | null}
 */
export function imageSize(file) {
	let buf;
	try {
		buf = readFileSync(file);
	} catch {
		return null;
	}
	// PNG：IHDR 块紧跟在 8 字节签名之后
	if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
		return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
	}
	// GIF
	if (buf.length >= 10 && buf.toString('latin1', 0, 3) === 'GIF') {
		return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
	}
	// WebP：RIFF....WEBP 后面是 VP8（有损）/ VP8L（无损）/ VP8X（扩展）块
	if (buf.length >= 30 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
		const chunk = buf.toString('latin1', 12, 16);
		if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
		if (chunk === 'VP8L') {
			const bits = buf.readUInt32LE(21);
			return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
		}
		if (chunk === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
		return null;
	}
	// JPEG：逐个跳过标记段，直到 SOF（帧头）段
	if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
		let i = 2;
		while (i + 9 < buf.length) {
			if (buf[i] !== 0xff) return null;
			const marker = buf[i + 1];
			if (marker === 0xff) {
				i++;
				continue;
			}
			const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
			if (isSof) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
			i += 2 + buf.readUInt16BE(i + 2);
		}
	}
	return null;
}
