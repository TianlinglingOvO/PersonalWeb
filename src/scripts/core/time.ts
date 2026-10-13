/** 把秒级时间戳显示成“刚刚 / 5 分钟前 / 3 天前 / 2026年10月1日”（评论区、账号页共用） */
export function timeAgo(sec: number) {
	const diff = Date.now() / 1000 - sec;
	if (diff < 60) return '刚刚';
	if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
	if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
	if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
	const d = new Date(sec * 1000);
	return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 给 <time> 元素填上相对时间，鼠标悬停显示完整时间 */
export function fillTime(el: HTMLTimeElement, sec: number) {
	el.textContent = timeAgo(sec);
	el.dateTime = new Date(sec * 1000).toISOString();
	el.title = new Date(sec * 1000).toLocaleString('zh-CN');
}
