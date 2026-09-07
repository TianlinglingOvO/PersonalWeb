# Sutady's Personal Web · 个人空间与技术博客

这是一个基于 **Astro v7** 构建的**极简、轻量、治愈系粉白二次元美学**个人空间与技术博客静态网站。

> 🎀 **在线站点**：[https://sutady.top](https://sutady.top)
> 
> *“Study makes perfect, what Sutady wants to be.”*

---

## ✨ 核心特性

- 🌸 **温润马卡龙设计系统**：采用粉白与柔和深洋红配色，搭配手绘插画与浮动二次元矢量背景，视觉清新治愈；
- ⚡ **零前端运行时负担**：全静态生成（SSG），采用原生 TypeScript 驱动交互逻辑与平滑滚动，极速轻量秒开；
- ⏳ **丝滑个人历程时间线**：支持滚轮阻尼横向滑动、卡片靠近视口时的动态呼吸缩放与最新节点脉冲光环；
- 📱 **移动端深度适配**：移动端顶栏绝对锁定（`position: fixed`）吸附，下拉菜单与顶栏 100% 融合成一张无缝纯白大圆角卡片，手势防穿透体验极佳；
- 📖 **优雅的文章阅读体系**：
  - 桌面端支持文章切换侧栏、自定义马卡龙圆角分类下拉选择器、右侧大纲目录树（TOC）；
  - 文章底部支持上一篇 / 下一篇平滑切换与书本翻页过渡；
  - 移动端配备折叠式目录与流畅回顶部按钮；
- 📋 **即时反馈交互**：社交联系方式一键点击复制与马卡龙 Toast 浮层提醒。

---

## 📚 维护与开发文档导航

| 文档 | 适用对象 | 内容说明 |
| :--- | :--- | :--- |
| [📘 MAINTENANCE.md](./MAINTENANCE.md) | **站长自用** | 日常发文 SOP、文章插图防 404 规范、时间线/服务卡片维护、发布前安全检查清单与 Git 一键部署 |
| [🤖 AGENTS.md](./AGENTS.md) | **AI 助手** | 后续任何 AI（Cursor/Claude/Antigravity/Grok 等）辅助开发时的架构底线、移动端排版红线与 Token 约束 |
| [📂 updata_plan/](./updata_plan/) | **版本历史** | 站点历经 13 个版本的迭代需求、规划与补丁实现文档（支持 `update_plan` 软链接快捷访问） |

---

## 🛠️ 本地运行与预览

### 依赖环境
- [Node.js 20+](https://nodejs.org/)（推荐 Node.js 22 LTS）
- npm 或 pnpm

### 启动步骤
```bash
# 1. 安装依赖
npm install

# 2. 启动本地开发服务（热更新预览）
npm run dev
```
启动后访问终端输出的地址（通常是 `http://localhost:4321`）。

### 静态生产构建与测试
```bash
# 执行完整静态打包（验证所有页面路由）
npm run build

# 本地预览打包产物
npm run preview
```

---

## 📝 内容快速维护指南

> 💡 **详细发文规范与避坑技巧，请务必参阅 [MAINTENANCE.md](./MAINTENANCE.md)**。

所有站内数据与正文均采用 Markdown 或 JSON 托管于 `content/` 目录中，修改对应文件即可自动更新全站：

| 想修改的内容 | 对应文件路径 | 说明 |
| :--- | :--- | :--- |
| **站点昵称 / 标语 / 简介** | `content/site.json` | 修改网站标题、个人签名等全局信息 |
| **关于我正文** | `content/about.md` | 支持富文本 Markdown 讲述个人故事 |
| **撰写 / 发布新文章** | `content/articles/*.md` | 必填 `title, date, description, category` |
| **个人历程时间线** | `content/timeline/*.md` | 节点标题、时间标签、图标与跳转链接 |
| **服务与协助卡片** | `content/services/*.md` | 标题、简介与展开后的详细服务说明 |
| **社交账号与联系方式** | `content/social.json` | 支持跳转链接（`link`）或一键复制（`copy`） |
| **头像 / 插画 / 背景素材** | `public/images/` | 静态图片存放目录，在 Markdown 中用 `/images/...` 引用 |

---

## 🚀 部署上线 (Cloudflare Pages)

本项目已接入 Cloudflare Pages CI/CD 自动部署流水线：

1. **自动构建部署**：每次向 GitHub 仓库的 `main` 分支执行 `git push`，Cloudflare Pages 会自动监听并执行 `npm run build`，1~2 分钟内全球 CDN 同步生效；
2. **构建设置参考**：
   - **Framework preset**：`Astro`
   - **Build command**：`npm run build`
   - **Build output directory**：`dist`
   - **Production branch**：`main`

---

## 📄 开源与版权

Copyright © 2026 Sutady. All rights reserved.
