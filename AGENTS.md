# AGENTS.md — AI 编程助手协作守则 (AI Guidelines)

本文档写给所有接入本项目的 AI 编程助手（Claude Code、Gemini / Antigravity、Grok、Cursor、Copilot、ChatGPT 等），记录架构约定、踩过的坑和代码规范。

**怎么用这份守则**：改代码前先读完。这里的规则大多是踩坑后总结出来的，是参考而不是死规定。确实有更好的做法时可以调整，但要做到三点：

1. 说得清为什么要改；
2. 通过第 5 节的全部检查，涉及手机端顶栏这类界面时还要真机确认；
3. 同步更新本文件和 `CLAUDE.md`。

---

## 1. 技术底座与边界

* **页面**：[Astro 7](https://astro.build/) 纯静态生成（SSG），所有页面在构建时生成。
* **接口**：Cloudflare Pages Functions（`functions/`，部署为 `sutady.top/api/...`）+ D1 数据库，用于浏览量、账号、评论和回复提醒，详见第 6 节。
* **脚本**：原生 TypeScript，不用任何前端框架。入口是 `src/scripts/ui.ts`，功能按模块拆在 `src/scripts/core/`（通用工具）和 `src/scripts/features/`（各项功能）里，打包后仍然只有一个脚本。约定见第 7 节。
* **样式**：原生 CSS + CSS 变量。入口 `src/styles/global.css` 只负责按顺序 `@import` 各个分块文件，打包后仍是一个 CSS 文件。约定见第 7 节。
* **内容**：Astro Content Collections，内容放在仓库根目录的 `content/`。
* **部署**：推送到 GitHub 的 `main` 分支后，Cloudflare Pages 自动构建上线。动态接口依赖 Pages Functions，不能换成 GitHub Pages 这类纯静态托管。

### 不要做的事

1. 不引入 React、Vue、Svelte、Solid 等前端框架，站点不需要虚拟 DOM 运行时。
2. 不引入 Tailwind、UnoCSS、Sass/Less，现有的 CSS 变量体系已经够用。
3. 不在页面上加载外部的大型 JS 库。新的交互写成 `src/scripts/` 下的模块，由 `ui.ts` 统一引入。
4. 新增依赖要克制：几十行代码能解决的事不装包（例如 RSS、sitemap、图片尺寸读取都是自己写的）。

---

## 2. 手机端顶栏（踩坑最多的地方，改之前务必真机测试）

断点是 `@media (max-width: 860px)`，样式在 `src/styles/components/header.css`。

* **`.site-header` 用 `position: fixed`，不能改回 `sticky`**：菜单展开时会给 `body` 加 `overflow: hidden`，手机 Chrome / Safari 上 `sticky` 会因此失效，顶栏掉回文档顶部，屏幕上方露出 68px 的空洞。
* **`body` 在手机端保持 `padding-top: var(--header-h)`**，正文不会被固定顶栏挡住。
* **菜单打开时（`body.nav-open`），顶栏和下拉菜单要看起来是一整张白色圆角卡片**：
  * `.site-header` 与 `.nav` 的背景都是 `var(--surface)`；顶栏去掉下边框，菜单去掉上边框，菜单从 `top: var(--header-h)` 往下接；
  * 菜单底部 `border-radius: 0 0 24px 24px`，带柔和阴影；
  * 半透明遮罩 `.nav-backdrop` 从顶栏下沿（`top: var(--header-h)`）开始，**不能盖住顶栏**，否则顶栏会被压成灰色，和白色菜单断开。

---

## 3. 视觉设计系统

整体是**粉白马卡龙、温润治愈的二次元日系**风格。颜色一律用 CSS 变量，不要写死十六进制颜色。

```css
:root {
  --bg: #fbf7f2;            /* 全局米白微温底色 */
  --bg-soft: #f3ebe4;       /* 次级米色底（图片占位、标签底） */
  --surface: #ffffff;       /* 卡片、面板、纯白表面 */
  --ink: #2a262c;           /* 正文深灰黑 */
  --muted: #6d6570;         /* 次要文案柔和灰 */
  --line: #e8dfd8;          /* 暖色细边线 */
  --accent: #e25c7a;        /* 主题马卡龙粉 */
  --accent-soft: #f8d5dd;   /* 淡粉高亮底色 */
  --accent-deep: #c44763;   /* 交互强调深洋红 */
  --accent-2: #5c6bc0;      /* 辅助靛蓝（次要链接、时间线 Future） */
  --accent-2-soft: #dde1f5; /* 淡靛蓝底 */
  --shadow-tint: rgb(90 50 70); /* 暖色阴影底色，用 color-mix 调透明度 */
}
```

* **字体**：正文统一用 `var(--font)`，代码和等宽数字用 `var(--font-mono)`（已接上中文黑体，防止 Windows 把等宽文字里的中文显示成新宋体），不要在别处再写字体栈。
* 实际数值以 `src/styles/base/tokens.css` 为准；需要半透明色时用 `color-mix(in srgb, var(--accent) 30%, transparent)`，不要写死 rgba。
* **圆角层级**：胶囊标签和按钮 `999px`；普通卡片、下拉菜单 `18px ~ 20px`（`var(--radius)`）；大抽屉、宽面板 `24px`。
* **动效**：
  * 缓动优先用 `cubic-bezier(0.16, 1, 0.3, 1)`，时长 `0.18s ~ 0.28s`；
  * 展开 / 收起一律要有动画（站长明确要求），用 `src/scripts/core/motion.ts` 里的 `slide` / `animateHeight` / `staggerIn` / `shake`，不要各自手写；
  * 尊重系统的“减少动态效果”设置：脚本里用 `prefersReducedMotion()` 判断，样式里统一在 `base/motion.css` 的 `prefers-reduced-motion` 块中关闭动画。

---

## 4. 图片与内容

* **图片目录**：公共图片放在 `public/images/`，文章配图按文章建子目录（如 `public/images/how_vpn_work/`）。
* **Markdown 引用**：必须用根路径 `![描述](/images/目录/文件名.png)`；不要写相对路径（`./pic.png`），也不要写 `/public/...` 或本机绝对路径。
* **一律小写**：目录名和文件名全部用小写字母 + 下划线 / 中横线，Linux 上大小写不同就是不同文件。
* **构建时自动检查**：`src/lib/content-check.mjs` 在构建开始时扫描 `content/` 和 `src/` 里所有 `/images/...` 引用，文件不存在或大小写不一致就直接让构建失败，并列出是哪个文件里的哪张图（`npm run dev` 时只在终端提示）。
  * 不要改成在渲染 Markdown 时报错：Astro 渲染内容出错只会打一行日志、生成一篇空文章，构建照样“成功”。
* **图片属性自动补齐**：`src/lib/markdown-images.mjs`（Markdown 处理器 Sätteri 的插件）给正文图片补上宽高和懒加载属性，图片加载时页面不会跳动；文章页的图片可以点击放大（`features/lightbox.ts`）。
* **文章里的示例网址**：`www.xxx.com` 这类示例地址会被 Markdown 自动变成可点的链接，要用反引号包起来，或者换成专门用来举例的 `example.com`。

---

## 5. 改完之后必须做的检查

```bash
npm run check   # TypeScript 类型检查（astro check + functions/），必须 0 errors
npm run build   # 静态构建，必须 Complete!、0 错误、0 警告
npm run smoke   # 改了 functions/、migrations/ 或账号、评论相关前端时必须跑
```

* `astro build` 本身不做类型检查，所以 `check` 和 `build` 都要跑；
* `npm run smoke` 会自动构建，在**隔离的临时本地数据库**上启动完整站点（静态页 + 接口，端口 8913，调试端口 9913），走一遍注册、登录、浏览量、评论、回复提醒、改密码、注销等流程，不会动到线上数据，也不会动到 `preview:full` 用的本地数据；
* 没有通过这些检查的改动，不能向站长声明“已完成”。

---

## 6. 动态功能（Pages Functions + D1）

浏览量、账号（用户名 + 密码）、文章评论（含楼中楼）和回复提醒由 `functions/` 下的接口提供，数据存在 D1 数据库 `sutady-db`。

* **目录约定**：`functions/api/**` 每个文件对应一个接口；共用代码放 `functions/_lib/`（下划线目录不会变成路由）。`functions/` 有独立的 `tsconfig.json`，`npm run check` 会一并检查。
* **绑定与配置**：`wrangler.toml` 是 Pages 配置的唯一来源（数据库绑定名 `DB`），不要在 Cloudflare 后台另改绑定。
* **表结构只能“新增迁移”**：改表时新增 `migrations/000N_xxx.sql`，先 `npx wrangler d1 migrations apply sutady-db --local` 本地测试，再 `npm run db:migrate` 上线。**不要修改或删除已经应用过的迁移文件**，否则线上和本地会对不上。上线顺序：先迁移数据库，再推送代码。能不改表就不改表（例如回复提醒的“已读”时间存在浏览器里）。
* **同域调用**：前端一律请求相对路径 `/api/...`，不要换成 `*.pages.dev` 或第三方域名，`pages.dev` 在中国大陆经常打不开。
* **CPU 限制**：免费版每次请求约 10ms CPU，PBKDF2 五万次约 4.5ms，所以**每个请求最多只做一次密码哈希或校验**。改密码因此分两步：前端先用当前密码调用登录接口确认身份（同时换一个新会话），再调用改密码接口；改密码接口只接受 2 分钟内新建的会话。
* **安全红线**：
  1. 用户输入的内容（用户名、评论）在前端只能用 `textContent` 渲染，禁止 `innerHTML`，防止 XSS；
  2. 所有写操作接口先检查 `isSameOrigin`（防 CSRF），需要登录的再用 `getUser` / `getSession` 校验，删除等操作要核对是本人或站长；
  3. 密码只能用 `functions/_lib/auth.ts` 的 PBKDF2 加盐哈希保存，迭代次数不要超过 10 万（Workers 的上限），现在用 5 万次；
  4. 登录 Cookie 保持 `HttpOnly; Secure; SameSite=Lax` 和 `__Host-` 前缀，数据库里只存 token 的哈希；
  5. 不要把任何密钥写进仓库（`wrangler.toml` 里的 `database_id` 不是密钥，可以提交）；
  6. 限流一律用 `clientIp()`（IPv6 按 /64 计），登录同时按 IP 和按账号限流；路径或请求体里的编号用 `toId()` 校验；请求体用 `readJson()`（自带 16KB 上限）；
  7. 登录后的跳转地址必须用 `new URL()` 解析并确认仍是本站，防止开放重定向；
  8. `public/_headers` 里有内容安全策略（CSP），只允许本站脚本和接口。**接入任何外部脚本、字体、统计或接口前，先把对应域名加进 CSP**，否则会被浏览器静默拦截。Cloudflare Web Analytics 是线上自动注入的（本地看不到），CSP 已放行它的两个域名，不要删；
  9. `functions/api/_middleware.ts` 兜底捕获接口异常，返回统一的中文错误，不暴露内部细节。
* **接口不可用时要优雅降级**：`npm run dev` 没有接口，浏览量、账号、评论、回复提醒这时应安静隐藏或提示“加载不出来”，不能让页面报错。
* **本地完整测试**：`npm run preview:full`（构建后用 wrangler 同时跑静态页和接口，地址 http://localhost:8911 ）。

---

## 7. 代码组织（保证以后好改、好拆）

### 脚本 `src/scripts/`

* `ui.ts` 是唯一入口，只做“接线”：调用各模块的 `setup()`（整个会话只执行一次，注册文档级的事件委托和换页钩子），并在每次换页（`astro:page-load`）时依次调用各模块的 `init(signal)`。
* `core/` 放和具体页面无关的工具：DOM 查询、动效、滚动总线、提示、确认弹窗、接口请求、登录状态等。
* `features/` 每个文件负责一块功能（顶栏、时间线、评论……），对外只导出 `setup` / `init`。新功能就新建一个文件，再在 `ui.ts` 的列表里登记一行。
* 启用了 ClientRouter，换页时脚本不会重新加载：`init(signal)` 里新加的监听器、Observer、定时器都必须挂到 `signal` 上（`{ signal }` 或 `signal.addEventListener('abort', …)`），否则来回换页后会重复绑定。
* 首次打开页面时，`init` 会被脚本加载和 `astro:page-load` 各触发一次，`ui.ts` 用当前 `<body>` 去重（换页时 Astro 会替换整个 body）。不要删掉这个去重，否则每个接口都会被调用两次。
* 滚动统一走 `core/scroll.ts` 的 `subscribeScroll(cb, signal)`，不要自己再给 `window` 加 scroll 监听。
* 显示 / 隐藏统一用 `hidden` 属性（全局 `[hidden]` 是 `display: none !important`）；需要确认的操作用 `core/dialog.ts` 的 `confirmDialog()`，不要用浏览器自带的 `confirm()`。
* 组件和脚本之间通过 `data-*` 属性对接，改 DOM 结构时同步检查对应的模块。

### 构建期工具 `src/lib/`

* `site.ts`：站点信息、导航、日期格式（固定按北京时间）、阅读时长、XML 转义；`articles.ts`：按日期排好序的文章列表（首页、文章页、RSS、sitemap 共用）。
* `content-check.mjs`、`markdown-images.mjs`：见第 4 节，在 `astro.config.mjs` 里注册。Astro 会缓存渲染好的内容（`.astro/`），改了 `markdown-images.mjs` 后先删掉 `.astro/` 再构建才能看到效果。

### 样式 `src/styles/`

* `global.css` 只有 `@import`，**导入顺序就是层叠顺序**，不要随意调换。
* `base/`：设计变量、基础排版、动效与减少动态效果；`components/`：跨页面复用的部件（顶栏、按钮、卡片、弹窗……）；`sections/`：首页各区块；`pages/`：文章页、登录 / 账号页、评论区等。
* 每个文件只写一块功能的样式，这块功能在手机端的覆盖样式写在**同一文件末尾**的 `@media (max-width: 860px)` 里。
* 断点：`860px` 手机 / 电脑分界（脚本里用 `core/breakpoints.ts` 的 `MOBILE_QUERY`）；`1100px` 时间线详情改到年历右侧；`1180px` 文章页显示左侧栏。

### 锚点与滚动偏移

* 跳到锚点时留出顶栏高度，**只在 `html` 上用 `scroll-padding-top`**，不要再给元素加 `scroll-margin-top`（两者会叠加，跳过去后上方空出一大截）。
* 顶栏导航和文章目录的滚动高亮，判断线由 `core/scroll.ts` 的 `anchorOffset()` 从同一个值算出来，改偏移时不用再改脚本。
* `html` 开了平滑滚动；换页的那一刻 `features/transitions.ts` 会临时关掉它，否则浏览器后退时页面会从顶部一路滚到原来的位置。
