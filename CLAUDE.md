# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Sutady 的个人网站与技术博客，线上地址 https://sutady.top 。Astro 纯静态站点（SSG），不用任何前端运行时框架；浏览量、账号、评论和回复提醒由 Cloudflare Pages Functions + D1 提供。

## 协作背景（先读）

- **`AGENTS.md` 是所有 AI 助手共用的协作守则**，改代码前先读完。里面的规则是参考：确有更好的做法时可以调整，但要说清原因、通过全部检查，并同步更新 AGENTS.md 和本文件。本仓库由多个 AI 共同开发（Gemini 为主，Grok 少量参与）。
- 工作区里可能有其他 AI 留下的**未提交改动**，本地代码不一定和 GitHub 上一致。动手前先看 `git status` / `git diff`；没有明确授权时，不要 `git restore`、`reset` 或 `stash` 这些改动。
- **推送到 `main` 等于上线生产环境**：Cloudflare Pages 监听 `main`，自动执行 `npm run build` 并部署 `dist/` 到 sutady.top。

## 命令

```bash
npm run dev       # 本地开发服务器，默认 http://localhost:4321（只有静态页，没有 /api）
npm run build     # 静态构建到 dist/
npm run preview   # 预览 dist/ 构建产物（只有静态页）
npm run check     # astro check + functions/ 的 tsc：TypeScript 类型检查
npm run smoke     # 构建后在隔离的临时本地数据库上跑一遍接口冒烟测试（见 scripts/smoke.mjs）
npm run preview:full  # 构建后用 wrangler 在本地同时跑静态页和 /api 接口（本地模拟 D1），http://localhost:8911
npm run db:migrate    # 把 migrations/ 里的新表结构应用到线上 D1（需先 npx wrangler login）
npm run admin -- users   # 站长管理账号：列用户、设站长、重置密码（见 scripts/admin.mjs）
```

- 要测浏览量、登录、评论用 `npm run preview:full`；改了接口或账号 / 评论相关的前端，跑 `npm run smoke`。
- 没有单元测试和 lint。`astro build` 不做类型检查，所以改完代码先跑 `npm run check`（需 0 errors），再跑 `npm run build`（输出 `Complete!`、0 错误、0 警告），涉及接口的再跑 `npm run smoke`，全部通过才能声明完成。
- Node 版本以 `package.json` 的 `engines` 为准（`>=22.12.0`，`.nvmrc` 写的是 22）。

## 架构要点

**内容层**
- 内容放在仓库根目录的 `content/`，不在 `src/content/`。集合定义和 zod schema 在 `src/content.config.ts`，使用 `glob` loader，共四个集合：`about`、`articles`、`services`、`timeline`。
- `content/site.json` 和 `content/social.json` 不是集合，由 `src/lib/site.ts` 直接 `import` 并加上类型；导航项 `nav`、日期格式化（固定北京时间）、阅读时长估算也在这个文件里。
- 文章的 URL slug 就是文件名（`post.id`）。`src/lib/articles.ts` 提供按日期排好序的文章列表，首页、文章页、RSS、sitemap 共用。
- 时间线节点可以写 `article: 文章slug` 关联一篇文章：卡片上自动生成“阅读文章 / 阅读教程”按钮，文章页底部反过来显示“收录于成长历程”，点了跳到时间线上对应的那一条。slug 写错时构建直接报错。
- 图片：`src/lib/content-check.mjs`（Astro 集成）在构建开始时检查 `content/`、`src/` 里所有 `/images/...` 引用是否存在（大小写敏感），有问题直接让构建失败；`src/lib/markdown-images.mjs`（Sätteri 的 hast 插件）给 Markdown 图片补上 `width` / `height` / `loading="lazy"` / `decoding="async"`。两者都在 `astro.config.mjs` 里注册。Astro 7 默认用 Sätteri 处理 Markdown，`markdown.rehypePlugins` 这类 unified 插件不能直接用。

**页面**
- 首页 `src/pages/index.astro` 是单页，由 Hero、About、Timeline、Articles（最新 3 篇）、Services、Connect 拼成；各集合的排序写在页面或 `src/lib/` 里，不在组件中。
- `/articles/` 是文章列表（带分类筛选），`/articles/[slug]/` 是文章页（左侧切换文章、右侧目录、底部上一篇 / 下一篇和评论区），`/login/` 登录 / 注册，`/account/` 账号页（回复我的、改密码、退出、注销），`/rss.xml` 和 `/sitemap.xml` 是构建时生成的静态文件。
- 所有页面套用 `src/layouts/BaseLayout.astro`：启用 `<ClientRouter />`（View Transitions），带 Open Graph / Twitter 分享信息，并在 body 底部加载唯一的客户端脚本 `src/scripts/ui.ts`。

**客户端脚本 `src/scripts/`**
- `ui.ts` 是入口，只负责接线：每个功能模块导出 `setup()`（整个会话只执行一次）和 `init(signal)`（每次换页执行一次）。`astro:page-load` 时会 `abort` 上一页的 `AbortController`，再依次调用各模块的 `init`；同一个 `<body>` 只初始化一次（首次打开页面时脚本加载和 `astro:page-load` 都会触发）。**新加的监听器、Observer、rAF 都必须挂到这个 `signal` 上**。
- `core/`：`dom.ts`（`$` / `$all`）、`motion.ts`（动效工具）、`scroll.ts`（rAF 节流的滚动总线 `subscribeScroll`、锚点偏移 `anchorOffset`）、`breakpoints.ts`、`toast.ts`、`dialog.ts`（`confirmDialog`）、`api.ts`（请求本站接口）、`account.ts`（登录状态缓存 `getAccount` / `setAccount`，变化时广播 `account-change`）、`replies.ts`（回复提醒：拉取、已读时间、未读数，变化时广播 `replies-change`）。
- `features/`：`header.ts`（顶栏、手机菜单、滚动高亮、回到顶部）、`transitions.ts`（换页进度条、卡片展开过场、换页时的滚动修正）、`reveal.ts`（滚动浮现）、`timeline.ts`、`article-list.ts`（文章列表页分类筛选）、`toc.ts`（文章目录、阅读进度）、`article-sidebar.ts`（文章页左侧栏）、`lightbox.ts`（文章图片点击放大）、`views.ts`、`account-menu.ts`（顶栏账号入口、小红点，以及全站的退出 / 注销按钮）、`auth-form.ts`（`/login/`）、`account-page.ts`（`/account/`）、`comments.ts`、`disclosure.ts`（`<details>` 折叠动画）、`contact.ts`（点击复制联系方式）、`links.ts`（站外链接新标签打开）。
- 锚点由浏览器和 Astro 自己滚动（`html` 的 `scroll-padding-top` 留出顶栏高度），脚本里不要再手动滚到 `location.hash`，否则后退时会被拉回锚点；`#tl-…`、`#comment-…` 这类要先展开内容的锚点由 `timeline.ts`、`comments.ts` 自己处理。
- **展开 / 收起一律要有动画**（站长明确要求）：用 `core/motion.ts` 的工具，不要直接切 `hidden` / `display`。`slide(el, open, onClosed)` 用于折叠块，中途反向会从当前高度折返；`animateHeight(container, mutate)` 用于内容替换导致高度变化的地方；`staggerIn(els)` 让新出现的元素依次浮现，`shake(el)` 输错时晃一下。缓动用 `EASE_OUT` / `EASE_HEIGHT`，减少动态效果用 `prefersReducedMotion()` 判断。显示隐藏统一用 `hidden` 属性，需要确认的操作用 `confirmDialog()`。
- 点击和键盘事件尽量在文档级别用事件委托处理（写在模块的 `setup()` 里，只绑定一次），靠 `data-*` 属性分发。组件和脚本之间通过 `data-*` 钩子（如 `data-timeline-panel`、`data-article-filter`）对接，改 DOM 结构时要同步检查对应模块。

**样式 `src/styles/`**
- 只写原生 CSS 和 CSS 变量。`global.css` 只有按顺序排列的 `@import`（顺序就是层叠顺序）：`base/`（变量、基础、动效）、`components/`（顶栏、按钮、卡片、反馈部件、弹窗、图片放大）、`sections/`（首页各区块）、`pages/`（文章页、登录与账号页、评论区、404）。
- 每块功能的手机端覆盖写在同一文件末尾的 `@media (max-width: 860px)` 里。设计变量、圆角层级、动效曲线以 AGENTS.md 第 3 节为准，禁止硬编码颜色。

**时间线（Section 02）**
- 排序在 `index.astro` 里完成，**时间正序**：order 越小越早（2006 出生在最前），`isFuture` 永远排在最后。
- 电脑端（>860px）是**年历**：顶部年份标签（`role="tablist"`）切换年份，每年一张 12 个月的格子；同月多条经历在格子里显示为标题小胶囊（最多 `MAX_CHIPS` 条，超出显示“+N”），点月份后在右侧（<1100px 时在下方）显示当月全部完整卡片。同月有 `FOLD_FROM`（3）条及以上时折叠：只展开一张（默认第一张），其余收成一行“日期 + 标题”（`timeline-entry-row`），点哪行展开哪张；点年历小胶囊、`/#tl-…` 链接会展开对应那张。折叠只在电脑端，无 JS 时全部完整显示。高度只取决于当前月份，不会随条目总数变长。`Future` 是单独一页，没有月份格。
- 手机端（≤860px）是按年份折叠的竖向时间线，同一套 DOM：隐藏年历，所有月份详情依次铺开；默认只展开最近一年和 Future；展开的年份只显示最近 `MOBILE_RECENT` 条，更早的收在“展开这一年更早的 N 条”里。
- 月份取自 `date` 的 `年.月`；没写月份的归入“全年”（月份 0，年历顶部通栏一格）。`date` 可写到日（`"2026.10.17"`），格式由 `content.config.ts` 的正则校验（月、日两位，写错构建报错）；卡片上的日期标签只显示“10月17日”，没写日子的显示“10月”（`TimelineEntry.astro`），文章页“收录于成长历程”仍显示完整日期。单张卡片是 `TimelineEntry.astro`，每条经历只渲染一次（在月份详情里），年历格里的小胶囊只是标题。
- 链接 `/#tl-<节点文件名>` 会打开对应年份和月份并闪一下那张卡片（文章页的“收录于成长历程”就是这样跳过来的）。
- 交互全部在 `features/timeline.ts`：切年份（带左右翻入动画、←/→ 键）、选月份、点小胶囊时闪烁对应卡片、手机端折叠与“更早的经历”。
- 历史教训：横向滚动画卷（滚轮劫持、吸顶驱动）和会无限变长的蛇形排布都被站长否决过。**不要再引入横向滚动或拦截滚轮**。
- 新增或修改节点的 frontmatter 字段见 MAINTENANCE.md 第 1.4 节。`Timeline事件簿.md` 是站长按年月记录的原始备忘，`content/timeline/*.md` 就是根据它整理出来的（该文件已被 gitignore）。

**页面过场**
- 顶栏和回到顶部按钮用 `transition:name` 固定，换页时只有正文“翻页”；浏览器后退时用 `html[data-astro-transition="back"]` 反向翻页。
- 从文章卡片进入文章页的“卡片展开”效果由 `features/transitions.ts` 临时挂上 `view-transition-name`，过场结束后移除。**不要把这个名字写死在模板里**，否则文章之间切换会失去翻页效果。
- `html` 开了平滑滚动，但换页的那一刻会临时关掉（`astro:before-swap` 关、`astro:after-swap` 恢复），否则后退时页面会从顶部一路滚到原来的位置。

**动态接口（Cloudflare Pages Functions + D1）**
- 站点仍是纯静态构建；`functions/` 下的文件由 Cloudflare Pages 部署为 `/api/...` 接口，数据存在 D1 数据库 `sutady-db`（绑定名 `DB`，配置见 `wrangler.toml`）。前端用 `fetch` 调用，接口不可用时（如 `npm run dev`）静默隐藏对应 UI。
- 接口必须走 `sutady.top/api/...` 同域调用：`*.pages.dev` 在中国大陆经常无法访问。
- 表结构改动只能新增 `migrations/000N_xxx.sql`，再本地 `wrangler d1 migrations apply sutady-db --local` 测试、`npm run db:migrate` 上线；不要改已应用过的迁移文件。
- 已有功能：
  - 浏览量 `functions/api/views.ts`：文章页 POST 计数，同一访客（IP + UA）同一天只算一次；文章卡片 GET 批量查询。前端用 localStorage（`sutady:viewed`）记下今天计过的文章，再打开只查询，换 IP 也不重复算；站长登录时同样只查询。服务端对预览部署（`<分支>.personalweb-5c2.pages.dev`，和正式站共用数据库）、爬虫 UA、跨站请求不计数。
  - 账号 `functions/api/auth/*`：用户名 + 密码注册登录，用户名不区分大小写、允许中文；PBKDF2 哈希；30 天的 HttpOnly Cookie；登录和注册按 IP 限流。
  - 改密码 `functions/api/auth/password.ts`：前端先用当前密码调一次登录接口（确认身份并换新会话），改密码接口只接受 2 分钟内新建的会话，改完让该账号其他设备上的登录全部失效。这样每个请求最多只做一次 PBKDF2，不会超出免费版 CPU 限制。
  - 评论 `functions/api/comments.ts` 与 `comments/[id].ts`：仅限文章页，登录后可发；两层结构（顶层 + 楼中楼，回复楼中楼时记“回复 @谁”；超过 2 条回复时前端折叠其余，`REPLY_PREVIEW`）；本人或站长可删，有回复的顶层评论只标记删除；`PATCH /api/comments/:id` 编辑只限本人（`edited_at` 记录，显示“已编辑”）。评论可以用 `#comment-<id>` 直接定位。
  - 回复提醒 `functions/api/replies.ts`：返回别人回复我的最近 10 条（回复我的顶层评论，或在楼中楼里 @ 我）。“已读到哪”存在浏览器的 localStorage 里（按用户名区分），不改表；顶栏头像和手机菜单按钮上显示小红点，`/account/` 里列出来，看过即已读。
  - 注销 `functions/api/auth/delete.ts`：需密码，站长不能注销；评论按删除规则处理，账号行匿名化为“已注销用户”（`username_key = 'closed:<id>'`，无法登录、名字可被重新注册），不物理删除，避免级联删掉别人的回复。
  - 共用代码在 `functions/_lib/`：`http.ts`（json、限流、同源检查）、`auth.ts`（密码、会话）、`articles.ts`（校验文章是否存在）、`comments.ts`（评论列表的查询与整理）。
- 用户内容一律用 `textContent` 渲染。
- 性能约定：D1 在亚太，访客请求常落在美国等远端节点，每次查询都可能要跨洋往返。所以：互不依赖的查询用 `Promise.all` 并行；写入和随后的读取放进同一个 `env.DB.batch`（评论的发表 / 删除直接返回最新列表，前端不再二次请求）；`wrangler.toml` 开启了 Smart Placement；前端发评论、删评论先做乐观更新。
- 站长操作手册（给不懂代码的站长看的）在 `ADMIN_GUIDE.md`，改动管理命令或访客规则时要同步更新它。
- 站长管理：`npm run admin -- users | set-admin <名> | reset-password <名> <新密码>`（`scripts/admin.mjs`，加 `--local` 操作本地库）。安全红线和迁移规则见 AGENTS.md 第 6 节。
- `functions/` 有独立的 `tsconfig.json`（Workers 类型），根 tsconfig 排除了它。本地调试端口 8788 在站长电脑上被占用，用 `wrangler pages dev --port 8911`；冒烟测试用 8913（调试端口 9913）。同时开两个 wrangler 时，默认调试端口 9229 会冲突，第二个会报 `Address already in use`；wrangler 启动失败后残留的 `workerd` 进程也会一直占着端口，要先结束它们。

## 待办

已讨论但暂缓的事项（Cloudflare 速率限制规则、评论图片、QQ 二维码 / 跳转、统一字号档位）记在 `MAINTENANCE.md` 第六章，站长说“做待办里的某条”时去那里看。

## 仓库约定

- 图片放在 `public/images/`，Markdown 里用 `/images/...` 根路径引用，目录和文件名一律全小写，详见 AGENTS.md 第 4 节。`public/_headers` 把 `/images/*` 缓存 7 天，所以替换同名图片时，需要在引用处把 `?v=N` 加一来刷新缓存。
- `docs/screenshots/` 是 README 用的网站截图（webp，不会部署到网站）；界面大改后可以重新截图替换。
- **移动端顶栏的固定定位和抽屉卡片样式是反复踩坑后确定的**，包括 `position: fixed` 不能改回 `sticky`、遮罩不能盖住顶栏，完整规则见 AGENTS.md 第 2 节。
- 以下内容都被 gitignore，只存在于本地：`update_plan/`（历次需求和方案档案，`updata_plan`、`update` 是指向它的软链接）、`my_image/`（原图）、`Timeline事件簿.md`。
- Commit 信息使用 `feat:` / `fix:` / `style:` / `docs:` / `chore:` / `refactor:` 等前缀，并带 scope，描述用中文，例如 `feat(timeline): …`。
