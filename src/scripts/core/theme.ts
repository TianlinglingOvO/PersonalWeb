// 当前主题，即 <html data-theme>。页面绘制前 BaseLayout 的内联脚本已经按访客上次的选择设好；
// 切换时调用 setTheme：写到 <html> 上、记进 localStorage，并广播 theme-change
/** localStorage 键名；BaseLayout 的内联脚本也从这里取（构建时传进去） */
export const THEME_KEY = 'sutady:theme';

export const currentTheme = () => document.documentElement.dataset.theme ?? '';

export function setTheme(id: string) {
	document.documentElement.dataset.theme = id;
	try {
		localStorage.setItem(THEME_KEY, id);
	} catch {
		/* 隐私模式等情况下存不了，只影响下次打开 */
	}
	document.dispatchEvent(new CustomEvent('theme-change', { detail: id }));
}
