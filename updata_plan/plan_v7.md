# PersonalWeb 优化方案 (v7)

## [Goal Description]
根据 `updata_plan/Updata-V7.md` 中的 5 项核心反馈与问题排查：
1. **修复文章分类筛选失效 Bug**：排查发现作者样式表中 `.card-link { display: flex; }` 的特异性压制了浏览器默认的 `[hidden] { display: none; }`，导致设置了 `hidden` 的文章卡片依然被 flex 布局强行显示。需全局补充 `[hidden] { display: none !important; }` 并强化脚本隐藏逻辑。
2. **解决手机端/高缩放比例下背景图案过淡**：此前矢量线条（1.15px）及低透明度（0.28）在手机高分辨率屏（DPI 2.5~3.0）或放大 250% 时会被稀释至不可见。需加粗线条（1.8~2.0px）、提高色彩不透明度（0.48~0.55）与实体色块填充，并针对手机屏幕尺寸（≤768px）调整适配信纸平铺比例（340px）。
3. **更换网站头像**：将头像资产替换为 `image/avatar_square.jpg`。
4. **文章页「软加载」与上下篇翻页导航**：
   - 引入 Astro View Transitions 客户端路由器（`<ClientRouter />`），消除整页刷新白屏，打造如翻阅绘本般丝滑的书本翻页（Book Page Turn）/ 淡入过渡效果；
   - 在文章详情页底部增加「上一篇 / 下一篇」直接跳转卡片，免去频繁返回首页。
5. **替换顶栏粉色「S」图标**：将 Header 左侧刻板的粉色方框「S」SVG 替换为来自 `image/Hello.jpg` 的可爱少女头像微缩标（高清晰度圆形/微圆角徽章，带粉色精致光晕微边框）。

---

## User Review Required

> [!IMPORTANT]
> **「软加载」技术原理**：
> 采用 Astro 原生 `<ClientRouter />`（基于现代浏览器 View Transition API）。无需加载几十上百 KB 的第三方臃肿动画库，即可将页面跳转升级为单页应用（SPA）式的无缝平滑过渡，在切换文章时呈现书本滑入翻页感。

> [!NOTE]
> **背景显色增强**：
> 本次调整了图案的可见度与实体填充（如猫爪肉垫、樱花瓣、蝴蝶结翅膀浮现柔和马卡龙粉与仙女紫），在手机和缩放高倍率下清晰可辨，同时卡片背景依然是纯白实色，不影响正文阅读。

---

## Open Questions

目前暂无未决疑问。各项需求与资产均已就绪。

---

## Proposed Changes

```mermaid
graph TD
    A[image/avatar_square.jpg] -->|1. 同步并替换| B[public/images/avatar.jpg]
    C[image/Hello.jpg] -->|2. 裁切优化输出| D[public/images/brand-avatar.jpg]
    D -->|3. 替换粉色 S 图标| E[Header.astro]
    F[global.css] -->|4. 补充 hidden !important + 移动端背景缩放 + 翻页动画| G[全局视觉与布局]
    H[public/images/bg-anime-cute.svg] -->|5. 加粗线条 1.8px + 提升不透明度与填充| G
    I[BaseLayout.astro] -->|6. 引入 ClientRouter 软加载| J[页面无缝切换]
    K[pages/articles/[slug].astro] -->|7. 增加上一篇/下一篇导航卡片| L[文章详情体验]
    M[ui.ts] -->|8. 双重保障 display: none 过滤| N[文章分类筛选]
```

<br/>

### 1. 静态素材处理 (Assets)

#### [MODIFY] [public/images/avatar.jpg](file:///home/sutady/PersonalWeb/public/images/avatar.jpg)
- 使用 `image/avatar_square.jpg` 覆盖更新。

#### [NEW] [public/images/brand-avatar.jpg](file:///home/sutady/PersonalWeb/public/images/brand-avatar.jpg)
- 提取并优化 `image/Hello.jpg` 的萌妹打招呼半身像作为顶栏品牌头像图标。

#### [MODIFY] [public/images/bg-anime-cute.svg](file:///home/sutady/PersonalWeb/public/images/bg-anime-cute.svg)
- 线宽由 `1.15px` 提升至 `1.9px`；
- 线条不透明度从 `0.28` 提升至 `0.50`；
- 猫爪肉垫、樱花瓣、蝴蝶结、爱心增加柔和半透明色块填充（`fill-opacity="0.18"`），确保在手机视网膜屏及 250% 缩放下图案清晰可爱。

---

### 2. 全局样式 (Styles)

#### [MODIFY] [src/styles/global.css](file:///home/sutady/PersonalWeb/src/styles/global.css)
- **修复筛选隐藏被覆盖问题**：
  ```css
  [hidden] {
    display: none !important;
  }
  ```
- **移动端背景平铺比例适配**：
  ```css
  @media (max-width: 768px) {
    .page-bg {
      background-size: auto, auto, auto, auto, 340px 340px;
    }
  }
  ```
- **顶栏新头像样式**：
  ```css
  .brand-avatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    object-fit: cover;
    object-position: 50% 12%;
    border: 2px solid var(--accent-soft);
    box-shadow: 0 2px 8px rgba(226, 92, 122, 0.18);
  }
  ```
- **书本翻页「软加载」动画定义**：
  ```css
  @keyframes pageTurnOut {
    from { opacity: 1; transform: translateX(0) scale(1); }
    to { opacity: 0; transform: translateX(-16px) scale(0.98); }
  }
  @keyframes pageTurnIn {
    from { opacity: 0; transform: translateX(16px) scale(0.98); }
    to { opacity: 1; transform: translateX(0) scale(1); }
  }
  ::view-transition-old(root) {
    animation: 0.28s cubic-bezier(0.16, 1, 0.3, 1) both pageTurnOut;
  }
  ::view-transition-new(root) {
    animation: 0.28s cubic-bezier(0.16, 1, 0.3, 1) both pageTurnIn;
  }
  ```
- **文章详情底部上一篇/下一篇卡片排版**。

---

### 3. 组件与布局 (Components & Layouts)

#### [MODIFY] [src/components/Header.astro](file:///home/sutady/PersonalWeb/src/components/Header.astro)
- 将旧的 `<svg class="brand-mark" ...>`（粉色S图标）替换为：
  ```html
  <img class="brand-avatar" src="/images/brand-avatar.jpg" alt={site.name} width="34" height="34" />
  ```

#### [MODIFY] [src/layouts/BaseLayout.astro](file:///home/sutady/PersonalWeb/src/layouts/BaseLayout.astro)
- 引入 `ClientRouter`：
  ```astro
  ---
  import { ClientRouter } from 'astro:transitions';
  ...
  ---
  <head>
    ...
    <ClientRouter />
  </head>
  ```

#### [MODIFY] [src/pages/articles/[slug].astro](file:///home/sutady/PersonalWeb/src/pages/articles/[slug].astro)
- `getStaticPaths` 中排序文章并注入 `prevPost` 与 `nextPost`；
- 在文章正文下方渲染「上一篇」与「下一篇」卡片导航，显示标题与箭头。

---

### 4. 客户端交互脚本 (Scripts)

#### [MODIFY] [src/scripts/ui.ts](file:///home/sutady/PersonalWeb/src/scripts/ui.ts)
- 在 `initArticleFilter` 的 `apply` 函数中，除设置 `card.hidden` 外，同步兜底设置 `card.style.display = match ? '' : 'none'`，实现 100% 可靠的分类过滤与过渡。

---

## Verification Plan

### Automated Tests
1. **静态打包构建**：
   ```bash
   npm run build
   ```
   验证所有动态文章路由（包含上下页 props）与主路由无类型错误并成功输出。

### Manual Verification
1. **文章分类筛选验证**：
   - 点击「教程」，确认仅保留带有「教程」徽章的文章卡片，带有「科普」的文章立即隐藏消失；
   - 点击「科普」，确认仅保留「科普」卡片；
   - 点击「全部」，两篇均正常展示。
2. **手机端与缩放背景验证**：
   - 切换手机视图模式或在电脑端缩放至 200%~250%，确认猫爪、蝴蝶结、樱花瓣和星芒轮廓清晰可见、颜色柔和可爱，不再出现惨白消失情况。
3. **头像与顶栏图标验证**：
   - 检查 Hero 大头像已换为方形新图；
   - 检查顶栏左侧品牌标志已替换为 `Hello.jpg` 的打招呼女孩头像徽章。
4. **文章软加载与上下页翻页验证**：
   - 在首页点击文章卡片，观察页面以轻柔翻页动效滑入，地址栏无硬刷新闪白；
   - 滚到文章底部，点击「上一篇」或「下一篇」，确认平滑翻页跳转到对应文章；
   - 点击「返回首页」，确认平滑退回首页。
