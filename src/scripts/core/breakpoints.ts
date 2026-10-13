// 断点，要和 CSS 里的 @media 保持一致（AGENTS.md 第 7 节）
/** 手机 / 电脑分界：≤860px 用手机端布局 */
export const MOBILE_QUERY = '(max-width: 860px)';
/** 文章页左侧栏（切换文章）只在宽于 1180px 时显示 */
export const ARTICLE_SIDEBAR_QUERY = '(min-width: 1181px)';
