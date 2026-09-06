# PersonalWeb 修改清单 v5

目标站点：`~/PersonalWeb`（Astro 静态站）· 线上 [sutady.top](https://sutady.top)

语气：给实现者的清晰 checklist。只改需求相关项，不扩 scope。

---

## 必须修改

### 1. 背景气质：从「聊天墙纸」换成二次元少女站

- [x] **现状问题**：全局 Telegram 式 doodle / emoji 平铺仍不对味，像稀疏办公/聊天墙纸，不像二次元少女站。
- [x] **替换全局背景方案**（`body` 或 `.page-bg`）：
  - 柔和 anime / pastel 气质：例如 **软渐变色洗**（奶油、浅粉、淡紫）+ **极淡星点 / 闪光 / 花瓣**；或 **浅色和纸 / 纹理**。
  - **不要**密密麻麻的随机 emoji doodle 平铺（聊天墙纸感）。
- [x] **可读性优先**：内容卡片 / 区块保持 **实色表面**；背景只在卡片缝隙与页面留白处可见，不与正文抢对比度。
- [x] **可选**：保留极淡的重复图案，但必须匹配「二次元少女站」气质（线稿小装饰、软色星屑等），密度低、对比低。
- [x] 实现提示：优先小 SVG/CSS 渐变 + 轻量 `background-image`；避免大图全屏照片。Connect 等区块 **继承同一套全局背景**，不要再单独铺一套聊天 doodle。

### 2. 「全部文章」控件：可点但要像按钮

- [x] 文章区 **右上角**「全部文章」目前像纯文字却可点击，交互暗示不足。
- [x] 改成与站点一致的 **清晰按钮样式**，任选其一并全站统一：
  - 描边 / pill 按钮（与筛选 chip 风格一致）；或
  - 带 padding 的下划线链接式按钮。
- [x] 悬停 / 焦点态可见（outline 或轻微底色），键盘可聚焦。

### 3. 滚动渐入动画

- [x] 为区块 / 卡片增加 **滚动进入时的轻微渐入**（详见下方「滚动渐入实现要点」）。
- [x] 时长约 **200–500ms**，位移与透明度都要克制，禁止花哨弹跳 / 大幅位移动效。
- [x] 必须尊重 `prefers-reduced-motion: reduce`（关闭或简化为瞬时显示）。

### 4. Sticky nav 高亮：滚到「联系我」时错停在「服务」

- [x] **现状问题**：滚到 `#connect` / 「联系我」时，粘性导航的 active 高亮仍停在「服务」，未切到「联系」。
- [x] **修复**：校正 scrollspy / `IntersectionObserver` 的 section 映射（id、阈值、阈值顺序与 nav 锚点一一对应），确保进入联系区块时 **「联系」正确高亮**，离开服务区后不再误亮「服务」。
- [x] 顺带核对：滚过各 section 时高亮切换连贯，无卡在上一节。

---

## 建议优化

- [x] **桌面横向溢出 / 页脚裁切**（若仍存在）：检查并修复 `overflow-x`（常见于 `html, body { overflow-x: hidden; }` 或修正过宽子元素），确保页脚完整可见、无横向滚动条。
- [x] **Services 卡片**：若展开后同行仍高低不齐或空白撑高，强制网格 `align-items: start`（或等价），**仅展开卡变高**，邻居保持顶部对齐、不被空白拉伸；若已修好则跳过。
- [x] **文章筛选「全部 / 教程 / 科普」**：已有则保持可用；某分类无文章时显示友好 **空状态**（短文案即可），不要空白一片或报错。
- [x] **Connect 群组**：现状可接受；占位外链 **非优先**，本轮可不处理。

---

## 滚动渐入实现要点

本站为 **Astro 静态输出**，优先轻量、无重型动画库。

### 推荐方案 A（兼容最好）

1. CSS：定义 `.reveal` 初始态（`opacity: 0` + 轻微 `translateY(12–20px)`），`.reveal.is-visible` 过渡到可见。
2. 用 `@keyframes` 或 `transition`（200–500ms，`ease-out`）。
3. 小脚本：`IntersectionObserver` 观察 `.reveal`；进入视口时加 `.is-visible`（可 `unobserve` 一次即可）。
4. 挂载位置：布局（如 `BaseLayout` / `Layout.astro`）底部一小段 `<script>`，或独立 `public/scripts/reveal.js` / `src/scripts/reveal.ts` 再在布局引入。

### 可选方案 B

- 若目标浏览器支持：可用 `animation-timeline: view()` 等；**必须**提供无不依赖 timeline 的 fallback（回到方案 A）。

### 无障碍

```css
@media (prefers-reduced-motion: reduce) {
  .reveal {
    opacity: 1;
    transform: none;
    transition: none;
    animation: none;
  }
}
```

### 应用范围

- 首页各 **section**、文章卡、服务卡等块级元素；不要给每个字/图标单独做动画。
- 初始在视口内的首屏元素：可直接带 `.is-visible`，或 observer 立即触发，避免首屏「空白再闪入」。

### 可能涉及的文件

- 全局样式：`src/styles/global.css`（或项目中等价的全局 CSS）
- 布局 / 组件：布局 Astro 文件，以及需要加 `class="reveal"` 的 section / card 组件
- 脚本：布局内联 script 或 `src/scripts/` / `public/` 下的轻量 JS

---

## 验收

- [x] 全页背景为柔和二次元 / pastel 气质；**不再**像 Telegram emoji 聊天墙纸。
- [x] 卡片与正文对比清晰，背景不干扰阅读。
- [x] 「全部文章」一眼可辨为可点控件，样式与站点（chip / 描边按钮）一致。
- [x] 向下滚动时区块/卡片有轻微渐入；刷新首屏不突兀闪烁。
- [x] `prefers-reduced-motion: reduce` 下无位移/渐入动画（或等价简化）。
- [x] 桌面无异常横向滚动；页脚不被裁切（若该项曾复现）。
- [x] 滚到 `#connect` / 「联系我」时，导航高亮为「联系」而非「服务」。
- [x] Services 展开不造成邻卡空白拉伸；网格为 `align-items: start`，仅展开卡变高（若该项曾复现）。
- [x] 文章筛选「全部 / 教程 / 科普」正常；空分类有空状态。
- [x] Connect 保持可用；占位链接本轮可不改。

---

## 范围说明

- 本文件仅为修改清单；**不要**在本轮借机大改信息架构或重做整站视觉系统。
- 实现落在 `~/PersonalWeb`；本清单文件本身不代替代码修改。

---

# 我的个人建议

1.我觉得这个背景还是不好看，没有那种二次元少女风格。
2.文章中有一个“全部文章”的标签按钮可以点击，但是却没有做按钮轮廓。
3.如果要实现一些动画效果，例如下拉逐渐出现的视觉风格，怎么做呢？
