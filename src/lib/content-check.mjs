/**
 * 构建开始前的内容检查（Astro 集成，在 astro.config.mjs 里注册）：
 * 扫描 content/ 和 src/ 里所有 /images/... 引用，检查文件是否存在，而且大小写完全一致
 * （Linux 上大小写不同就是不同文件，本地看着正常、上线就 404）。
 *
 * 为什么不在渲染 Markdown 时检查：Astro 渲染内容出错只会打一行日志、生成一篇空文章，构建照样“成功”，
 * 有问题的文章会悄悄上线。所以单独在构建开始时检查，发现问题直接让构建失败。
 * `npm run dev` 时只在终端里提示，不打断开发。
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 只认带图片扩展名的站内路径，避免把注释里的“/images/...”这类说明文字当成引用
const IMAGE_REF = /\/images\/[^\s"'`()<>?#\\]+?\.(?:png|jpe?g|gif|webp|avif|svg)\b/gi;
const SCAN = [
	{ dir: 'content', ext: /\.(md|json)$/ },
	{ dir: 'src', ext: /\.(astro|ts|css)$/ },
];

/** @param {{ root: URL }} options root：项目根目录 */
export default function contentCheck({ root }) {
	const rootDir = fileURLToPath(root);
	return {
		name: 'site-content-check',
		hooks: {
			'astro:build:start': () => {
				const problems = findMissingImages(rootDir);
				if (problems.length) {
					throw new Error(
						`有 ${problems.length} 处图片引用找不到文件（图片放在 public/images/ 下，引用写 /images/...，大小写必须完全一致）：\n` +
							problems.map((p) => `  - ${p}`).join('\n'),
					);
				}
			},
			'astro:server:start': ({ logger }) => {
				for (const p of findMissingImages(rootDir)) logger.warn(`图片找不到：${p}`);
			},
		},
	};
}

/** @param {string} rootDir */
function findMissingImages(rootDir) {
	const publicDir = path.join(rootDir, 'public');
	/** @type {Map<string, Set<string>>} */
	const listing = new Map();
	/** 逐级比对目录内容，保证大小写完全一致（在 macOS / Windows 这类不区分大小写的系统上也能查出来） */
	const existsExact = (/** @type {string} */ relative) => {
		let dir = publicDir;
		for (const part of relative.split('/').filter(Boolean)) {
			let names = listing.get(dir);
			if (!names) {
				try {
					names = new Set(readdirSync(dir));
				} catch {
					names = new Set();
				}
				listing.set(dir, names);
			}
			if (!names.has(part)) return false;
			dir = path.join(dir, part);
		}
		return true;
	};

	/** @type {string[]} */
	const problems = [];
	for (const { dir, ext } of SCAN) {
		for (const file of walk(path.join(rootDir, dir))) {
			if (!ext.test(file)) continue;
			const text = readFileSync(file, 'utf8');
			for (const [ref] of text.matchAll(IMAGE_REF)) {
				if (!existsExact(decodeURI(ref))) problems.push(`${ref}（${path.relative(rootDir, file)}）`);
			}
		}
	}
	return problems;
}

/** 递归列出目录下的所有文件 */
function* walk(/** @type {string} */ dir) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else yield full;
	}
}
