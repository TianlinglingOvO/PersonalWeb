// 站外链接一律在新标签打开。
// 跳到 #锚点 交给浏览器和 Astro：打开页面、换页时它们会自己滚过去（html 的 scroll-padding-top 留出顶栏高度），
// 后退时恢复原来的位置。不要在这里再手动 scrollIntoView，否则后退时会被强行拉回锚点。
// 时间线（#tl-…）、评论（#comment-…）这类要先展开内容才能定位的锚点，由各自的模块处理
export function setup() {
	document.addEventListener('click', (event) => {
		const anchor = (event.target as HTMLElement | null)?.closest('a');
		if (anchor && anchor.origin && anchor.origin !== window.location.origin) {
			anchor.target = '_blank';
			anchor.rel = 'noopener noreferrer';
		}
	});
}
