# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Sutady 的个人网站与技术博客，线上地址 https://sutady.top 。Astro 纯静态站点（SSG），不用任何前端运行时框架。

## 协作背景（先读）

- **`AGENTS.md` 是所有 AI 助手共用的强制守则**，改代码前必须读完。本仓库由多个 AI 共同开发：Gemini 为主，Grok 少量参与。
- 工作区里常有其他 AI 留下的**未提交改动**（例如时间线排版重构），所以本地代码可能和 GitHub 上的不同步。动手前先看 `git status` / `git diff`；没有明确授权时，不要 `git restore`、`reset` 或 `stash` 这些改动。
- **推送到 `main` 等于上线生产环境**：Cloudflare Pages 会监听 `main`，自动执行 `npm run build`，并部署 `dist/` 到 sutady.top。

## 命令

```bash
npm run dev       # 本地开发服务器，默认 http://localhost:4321
npm run build     # 静态构建到 dist/，这是唯一的验收手段
npm run preview   # 预览 dist/ 构建产物
npm run check     # astro check：对 .astro / .ts 做 TypeScript 类型检查
```

- 项目没有测试和 lint。`astro build` 不做类型检查，所以改完代码先跑 `npm run check`（需 0 errors），再按 AGENTS.md 的要求跑 `npm run build`，输出 `Complete!`、0 错误、0 警告后才能声明完成。
- Node 版本以 `package.json` 的 `engines` 为准（`>=22.12.0`，`.nvmrc` 写的是 22）。

## 架构要点

**内容层**
- 内容放在仓库根目录的 `content/`，不在 `src/content/`。集合定义和 zod schema 在 `src/content.config.ts`，使用 `glob` loader，共有四个集合：`about`、`articles`、`services`、`timeline`。
- `content/site.json` 和 `content/social.json` 不是集合，它们由 `src/lib/site.ts` 直接 `import` 并加上类型；导航项 `nav` 也定义在这个文件里。
- 文章的 URL slug 就是文件名（`post.id`）。`src/pages/articles/[slug].astro` 在 `getStaticPaths` 里按日期排序，计算上一篇和下一篇。文章分类从各文章的 `category` 动态收集；`site.ts` 里的 `articleCategories` 只在没有任何分类时作为兜底。

**页面组成**
- 首页 `src/pages/index.astro` 是单页，由 Hero、About、Timeline、Articles、Services、Connect 几个 section 拼成。各集合的**排序逻辑都写在这个页面里**，不在组件中。
- 所有页面都套用 `src/layouts/BaseLayout.astro`，其中启用了 `<ClientRouter />`（View Transitions），并在 body 底部加载唯一的客户端脚本 `src/scripts/ui.ts`。

**客户端脚本 `src/scripts/ui.ts`（约 1000 行，所有交互都在这里）**
- 由于启用了 ClientRouter，页面切换时不会重新加载脚本。`initPage()` 挂在 `astro:page-load` 上，每次导航都会 `abort` 上一个 `AbortController`，再依次调用各个 `initXxx(signal)`。**新加的监听器、Observer、rAF 都必须挂到这个 `signal` 上**（`{ signal }` 或 `signal.addEventListener('abort', …)`），否则页面来回切换后会重复绑定。
- 滚动事件统一走一条 rAF 节流的总线：用 `subscribeScroll(cb, signal)` 订阅，不要自己再加 `window` 的 scroll 监听。
- 点击和键盘事件在文档级别用事件委托处理（`onClick` / `onKeydown`），只绑定一次，靠 `data-*` 属性分发。组件和脚本之间通过 `data-*` 钩子（如 `data-timeline-track`、`data-article-controller`）对接，改 DOM 结构时要同步检查 `ui.ts`。

**样式 `src/styles/global.css`（约 2800 行，单文件）**
- 只写原生 CSS 和 CSS 变量，按 section 分块。设计 token、圆角层级、动效曲线都以 AGENTS.md 第 3 节为准，禁止硬编码颜色。

**时间线（Section 02）**
- 排序在 `index.astro` 里完成，**时间正序**：order 越小越早（2006 出生在最前），`isFuture` 永远排在最后。
- 电脑端（>860px）是**年历**：顶部年份标签（`role="tablist"`）切换年份，每年一张 12 个月的格子；同月多条经历在格子里显示为标题小胶囊（最多 `MAX_CHIPS` 条，超出显示“+N”），点月份后在右侧（<1100px 时在下方）显示当月全部完整卡片。高度只取决于经历最多的那个月，不会随条目总数变长。`Future` 是单独一页，没有月份格。
- 手机端（≤860px）是按年份折叠的竖向时间线，同一套 DOM：隐藏年历，所有月份详情依次铺开；默认只展开最近一年和 Future。
- 月份取自 `date` 的 `年.月`；没写月份的归入“全年”（月份 0，年历顶部通栏一格）。单张卡片是 `TimelineEntry.astro`，每条经历只渲染一次（在月份详情里），年历格里的小胶囊只是标题。
- 交互全部在 `ui.ts` 的 `initTimeline`：切年份（带左右翻入动画、←/→ 键）、选月份、点小胶囊时闪烁对应卡片、手机端折叠。
- 历史教训：横向滚动画卷（滚轮劫持、吸顶驱动）和会无限变长的蛇形排布都被站长否决过。**不要再引入横向滚动或拦截滚轮**。
- 新增或修改节点的 frontmatter 字段见 MAINTENANCE.md 第 1.4 节。`Timeline事件簿.md` 是站长按年月记录的原始备忘，`content/timeline/*.md` 就是根据它整理出来的（该文件已被 gitignore）。

**页面过场**
- 顶栏和回到顶部按钮用 `transition:name` 固定，换页时只有正文“翻页”；浏览器后退时用 `html[data-astro-transition="back"]` 反向翻页。
- 从文章卡片进入文章页的“卡片展开”效果由 `ui.ts` 的 `initArticleMorph` 临时挂上 `view-transition-name`，过场结束后移除。**不要把这个名字写死在模板里**，否则文章之间切换会失去翻页效果。

## 仓库约定

- 图片放在 `public/images/`，Markdown 里用 `/images/...` 根路径引用，目录和文件名一律全小写，详见 AGENTS.md 第 4 节。`public/_headers` 把 `/images/*` 缓存 7 天，所以替换同名图片时，需要在引用处把 `?v=N` 加一来刷新缓存。
- **移动端顶栏的固定定位和抽屉卡片样式是反复踩坑后确定的红线**，包括 `position: fixed` 不能改回 `sticky`，完整规则见 AGENTS.md 第 2 节。
- 以下内容都被 gitignore，只存在于本地：`update_plan/`（历次需求和方案档案，`updata_plan`、`update` 是指向它的软链接）、`my_image/`（原图）、`Timeline事件簿.md`。
- Commit 信息使用 `feat:` / `fix:` / `style:` / `docs:` / `chore:` 等前缀，并带 scope，描述用中文，例如 `feat(timeline): …`。
