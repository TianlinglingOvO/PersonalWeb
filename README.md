<div align="center">

<img src="public/images/avatar_square.jpg" width="120" alt="Sutady 的头像" />

# Sutady 的小屋

*Study makes perfect, what Sutady wants to be.*

粉白治愈系的个人网站与技术博客

[![网站](https://img.shields.io/badge/在线访问-sutady.top-e25c7a?style=flat-square)](https://sutady.top)
[![版本](https://img.shields.io/github/v/release/TianlinglingOvO/PersonalWeb?style=flat-square&color=f0a5b5&label=版本)](./CHANGELOG.md)
[![Astro](https://img.shields.io/badge/Astro-7-ff5d01?style=flat-square&logo=astro&logoColor=white)](https://astro.build)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages%20%2B%20D1-f38020?style=flat-square&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com)

</div>

<table>
  <tr>
    <td width="78%" align="center"><img src="docs/screenshots/home.webp" alt="首页" /><br /><sub>首页</sub></td>
    <td width="22%" align="center"><img src="docs/screenshots/mobile.webp" alt="手机端" /><br /><sub>手机端</sub></td>
  </tr>
</table>
<table>
  <tr>
    <td width="50%" align="center"><img src="docs/screenshots/timeline.webp" alt="年历式时间线" /><br /><sub>年历式成长时间线</sub></td>
    <td width="50%" align="center"><img src="docs/screenshots/article.webp" alt="文章页" /><br /><sub>文章页：切换侧栏、目录、浏览量</sub></td>
  </tr>
</table>

---

## ✨ 特色

| 功能 | 说明 |
| :--- | :--- |
| 🌸 **粉白插画风** | 马卡龙配色、手绘插画和浮动小图案背景，所有颜色都来自统一的设计变量 |
| ⏳ **年历式时间线** | 电脑端按年份翻页，每年一张 12 个月的格子，点月份看当月经历；手机端按年份折叠 |
| 📖 **舒服的阅读体验** | 阅读时长、阅读进度条、目录跟随、文章切换侧栏、上一篇 / 下一篇 |
| 🎬 **细腻的动效** | 首屏依次浮现、卡片错落出场、换页翻书、从卡片展开成文章；所有展开 / 收起都有过渡；尊重系统的“减少动态效果”设置 |
| 👀 **浏览量** | 文章卡片和文章页显示阅读次数，同一访客一天只算一次 |
| 💬 **账号与评论** | 用户名 + 密码注册（支持中文用户名），评论支持楼中楼、编辑、删除；站长评论带“站长”标签 |
| 📱 **手机端适配** | 固定顶栏 + 一体化下拉菜单、折叠目录、回到顶部 |
| 🔒 **安全** | 密码加盐哈希、HttpOnly 会话、按 IP 限流、同源校验、CSP 等安全响应头 |

## 🧱 技术栈

- **页面**：[Astro 7](https://astro.build) 纯静态生成，不用 React / Vue 等前端框架；交互全部由一个原生 TypeScript 脚本完成
- **样式**：原生 CSS + CSS 变量，没有 UI 库
- **接口**：[Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)，部署在同域 `/api/...`
- **数据库**：[Cloudflare D1](https://developers.cloudflare.com/d1/)（SQLite），存浏览量、账号和评论
- **部署**：推送到 `main` 后 Cloudflare Pages 自动构建上线，不需要服务器

## 🗂️ 项目结构

```text
PersonalWeb/
├── content/              # ✏️ 网站内容：改这里就能更新网站
│   ├── site.json         #    昵称、标语、插画等全局信息
│   ├── social.json       #    联系方式
│   ├── about.md          #    关于我
│   ├── articles/         #    文章
│   ├── timeline/         #    时间线经历
│   └── services/         #    服务卡片
├── public/images/        # 🖼️ 图片素材
├── src/
│   ├── components/       #    页面各区块（Hero、Timeline、Comments…）
│   ├── pages/            #    首页、文章页、登录页、404
│   ├── scripts/ui.ts     #    全部前端交互
│   └── styles/global.css #    全部样式
├── functions/            # ⚙️ 后端接口（浏览量、账号、评论）
├── migrations/           # 🗄️ 数据库表结构
└── scripts/admin.mjs     # 👑 站长管理命令
```

## 📝 更新内容

日常只需要改 `content/` 里的文件，推送后网站自动更新。

| 想改什么 | 改哪个文件 |
| :--- | :--- |
| 昵称、标语、简介 | `content/site.json` |
| 关于我 | `content/about.md` |
| 发新文章 | 在 `content/articles/` 新建 `.md`，必填 `title`、`date`、`description`、`category` |
| 时间线经历 | `content/timeline/*.md`，日期写成 `年.月`，决定它落在年历的哪个月 |
| 服务卡片 | `content/services/*.md` |
| 联系方式 | `content/social.json`，可以是跳转链接（`link`）或点击复制（`copy`） |
| 图片 | 放进 `public/images/`，文件名全小写，Markdown 里用 `/images/...` 引用 |

> 💡 发文规范、插图防 404、发布前检查清单都在 [MAINTENANCE.md](./MAINTENANCE.md)。

## 🛠️ 本地运行

需要 [Node.js](https://nodejs.org/) 22.12 或更高版本。

```bash
npm install        # 安装依赖
npm run dev        # 开发预览 → http://localhost:4321（只有静态页）
```

| 命令 | 作用 |
| :--- | :--- |
| `npm run check` | 类型检查，需要 0 errors |
| `npm run build` | 打包到 `dist/`，上线前必须通过 |
| `npm run preview` | 预览打包结果（只有静态页） |
| `npm run preview:full` | 完整预览，含浏览量、登录、评论 → http://localhost:8911<br />第一次运行前先建本地表：`npx wrangler d1 migrations apply sutady-db --local` |
| `npm run db:migrate` | 把新的数据库表结构应用到线上 |
| `npm run admin -- users` | 站长管理：查看用户、重置密码、设站长，详见 [ADMIN_GUIDE.md](./ADMIN_GUIDE.md) |

## 🚀 部署

项目已接入 Cloudflare Pages，**推送到 `main` 就是上线**：

1. Cloudflare 自动运行 `npm run build`，一两分钟后 [sutady.top](https://sutady.top) 更新；
2. `functions/` 自动部署为 `/api/...` 接口，数据库绑定写在 `wrangler.toml`（D1 数据库 `sutady-db`，绑定名 `DB`）；
3. 数据库结构有变化时，另外运行 `npm run db:migrate`。

<details>
<summary>Cloudflare Pages 构建设置</summary>

| 设置项 | 值 |
| :--- | :--- |
| Framework preset | `Astro` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Production branch | `main` |

</details>

## 📚 文档

| 文档 | 写给谁 | 内容 |
| :--- | :--- | :--- |
| [MAINTENANCE.md](./MAINTENANCE.md) | 站长 | 发文流程、插图规范、时间线和服务卡片维护、发布前检查、待办事项 |
| [ADMIN_GUIDE.md](./ADMIN_GUIDE.md) | 站长 | 零基础手册：查看用户、重置密码、设站长、删评论、在 Cloudflare 后台看数据 |
| [CHANGELOG.md](./CHANGELOG.md) | 所有人 | 每个正式版本更新了什么 |
| [AGENTS.md](./AGENTS.md) | AI 助手 | 所有 AI 共用的开发守则：设计变量、手机端红线、安全规则 |
| [CLAUDE.md](./CLAUDE.md) | AI 助手 | 代码架构速览和常用命令 |

---

<div align="center">

Copyright © 2026 Sutady. All rights reserved.

</div>
