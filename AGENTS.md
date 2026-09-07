# AGENTS.md — AI 编程助手与结对协作守则 (AI Guidelines)

本文档是针对后续所有接入本项目的 AI 编程助手（包括 Google Antigravity、Cursor、Claude Code、GitHub Copilot、ChatGPT、Grok 等）的**架构守则、红线禁区与代码规范**。

在对本项目进行任何代码修改前，AI 必须完整阅读并严格遵守以下准则。

---

## 1. 技术底座与依赖约束 (Tech Stack & Boundaries)

* **核心框架**：[Astro v7](https://astro.build/)（Pure Static SSG 纯静态模式）
* **脚本逻辑**：原生 TypeScript (`src/scripts/ui.ts`)，无任何前端运行时框架
* **样式方案**：纯原生 CSS (`src/styles/global.css`)，基于标准 CSS 自定义属性（CSS Variables）
* **内容驱动**：Astro Content Collections (`content/`)
* **部署平台**：Cloudflare Pages / GitHub Pages

### 🚫 严厉禁止的行为（绝对红线）
1. **严禁引入重量级前端框架**：禁止安装 React、Vue、Svelte、Solid 等框架依赖，站点不需要臃肿的虚拟 DOM 运行时；
2. **严禁引入 CSS 预处理器或 Utility 框架**：禁止引入 Tailwind CSS、UnoCSS、Sass/Less。站点已有极其完善、体积轻巧的 CSS 变量系统；
3. **严禁破坏现有的零客户端水合特性**：除 `BaseLayout.astro` 底部加载的单一 `ui.ts` 交互脚本外，不要给页面强加外部大型 JS 库。

---

## 2. 移动端顶栏与交互架构（重点保护区域）

本项目在移动端经历过深度的排版演进与 Bug 修复，以下布局规则是经过严格真机测试确认的**不可动摇规则**：

### 移动端顶栏固定定位约束
* **媒体查询**：`@media (max-width: 860px)`
* **`.site-header`**：**必须且只能使用 `position: fixed !important; top: 0 !important; width: 100% !important; z-index: 100 !important;`**
  * ❌ **绝对禁止改回 `position: sticky`**：在移动端 Chrome/Safari 中，菜单展开时会对 `body` 施加 `overflow: hidden`，这会使 `sticky` 容器滚动上下文坍缩，导致顶栏掉回文档顶部、屏幕上方产生 68px 镂空透明漏洞！
* **`body` 顶部留白**：移动端 `body` 必须显式保持 `padding-top: var(--header-h);`，确保页面内容不被固定顶栏遮挡。

### 移动端抽屉无缝卡片规范
* 菜单打开时（`body.nav-open`）：
  * `.site-header` 与 `.nav` 必须统一使用纯白背景 `background: var(--surface) !important;`（`#ffffff`）；
  * `.site-header` 的下边框必须为 `border-bottom: none !important;`；
  * `.nav` 的上边框必须为 `border-top: none !important;`，自 `top: var(--header-h)` 无缝向下延伸；
  * 抽屉底部保持 `border-radius: 0 0 24px 24px;` 大圆角与柔和阴影；
  * **设计目的**：使从屏幕顶端到菜单最后一项视觉上呈现为同一张无缝、完整的圆角卡片。

---

## 3. 视觉设计系统与 Token 规范 (Design Tokens)

本项目采用**粉白马卡龙、温润治愈的二次元日系美学**，任何代码改动必须严格调用以下 CSS 变量，**严禁硬编码十六进制颜色**：

```css
:root {
  --bg: #fdfbf7;          /* 全局米白微温底色 */
  --surface: #ffffff;     /* 卡片、面板、纯净白表面 */
  --ink: #2a262c;         /* 正文字体深灰黑 */
  --muted: #6b6370;       /* 次要文案柔和灰 */
  --line: #f1dfd6;        /* 极细微粉边界线 */
  --accent: #f28b9f;      /* 主题马卡龙粉红 */
  --accent-soft: #fde8ee; /* 极淡粉红高亮背景底色 */
  --accent-deep: #b8435f; /* 交互强调深洋红 */
}
```

* **圆角层级规范**：
  * 胶囊标签 / 交互按钮：`border-radius: 999px;`
  * 普通卡片 / 下拉菜单：`border-radius: 18px ~ 20px;`
  * 大抽屉 / 宽幅面板：`border-radius: 24px;`
* **交互动效原则**：
  * 过渡曲线优先使用弹性贝塞尔曲线：`cubic-bezier(0.16, 1, 0.3, 1)`；
  * 动画持续时间保持在 `0.18s ~ 0.28s` 之间，兼顾跟手感与灵动性。

---

## 4. 资源引用与路径规范 (Assets & Content)

* **图片资源目录**：所有公共静态图片均存放于 `public/images/`。
* **Markdown 配图引用规范**：
  * 必须使用 Web 根相对路径：`![描述](/images/分类文件夹/文件名.png)`；
  * ❌ 严禁使用相对路径 `./pic.png` 或 `../../public/...`；
  * ❌ 严禁写入宿主机操作系统绝对路径（如 `/home/sutady/...`）。
* **大小写敏感红线**：
  * 所有新建图片目录与文件名称**一律使用全小写字母 + 下划线**（如 `public/images/article_demo/cover.png`）；
  * 杜绝任何大写字母混用，避免 Linux 生产环境触发 404。

---

## 5. 变更与提交强制校验 (Pre-commit Verification)

任何 AI 助手在完成代码或内容修改后，**必须在终端执行静态构建测试**：

```bash
npm run build
```

* **验收标准**：
  1. 所有静态路由（当前包括首页、文章列表、各文章详情页、404 等）100% 编译通过；
  2. 终端显示 `Complete!` 且 **0 错误、0 警告**；
  3. 未经 `npm run build` 验证通过的代码，绝对不可向用户声明已完成。
