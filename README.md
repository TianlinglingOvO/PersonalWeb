# 个人 About me 站点（第一期）

这是一个**静态**个人简介站：自我介绍、活动、文章、服务占位和联系方式。第一期全部是中文占位，风格认可后再把内容换成真实信息。

- 技术：Astro，构建后是普通 HTML/CSS/JS
- 托管：Cloudflare Pages（连 Git 仓库，推送即部署）
- 第一期**没有**登录、后台、评论、数据库、支付或下单

## 本地预览

需要先安装 [Node.js 22](https://nodejs.org/)（已有的话可跳过）。在项目文件夹打开终端，执行：

```bash
npm install
npm run dev
```

终端会出现一个地址，一般是 `http://localhost:4321`。用浏览器打开即可。按 `Ctrl + C` 结束预览。

想确认正式构建：

```bash
npm run build
npm run preview
```

## 如何换成真实信息

**只改 `content/` 和 `public/images/`，不要改 `src/` 里的布局代码。** 改完后重新预览或推送到 Git，网站就会更新。

| 想改什么 | 改哪个文件 |
| --- | --- |
| 昵称、一句话、网页标题/简介、用哪张图 | `content/site.json` |
| 关于我 | `content/about.md` |
| 活动卡片 | `content/projects/` 下的 `.md`（增删文件即可） |
| 文章 | `content/articles/` 下的 `.md`（支持自定义 `category`，如教程、科普、日常等，会自动生成标签筛选） |
| 服务卡片 | `content/services/` 下的 `.md` |
| 联系方式（主联系 / 次要） | `content/social.json` |
| 头像、插画、矢量纹理 | `public/images/` |

### 活动 / 文章 / 服务怎么写

每个 Markdown 文件开头是一段 YAML（两行 `---` 之间），后面才是正文。

活动示例：

```md
---
title: 活动名称
summary: 一两句简介
tags:
  - 标签
url: https://example.com
order: 1
---
```

`url` 可以删掉，卡片就不可点击。`order` 数字越小越靠前。

文章必须有 `title`、`date`、`description`、`category`。`category` 可以填写如 `教程`、`科普`、`日常`、`随笔` 等。正文用普通 Markdown。文件名会变成网址，例如 `hello-site.md` → `/articles/hello-site/`。

```md
---
title: 文章标题
date: 2026-04-01
description: 一两句摘要
category: 教程
---
```

首页文章区和 `/articles/` 列表会自动根据已有文章聚合出分类筛选标签，文章详情页底部提供「上一篇 / 下一篇」翻页卡片与书本翻页软加载过渡。

服务卡片的按钮默认指向联系区块。`ctaHref` 请继续用 `/#connect`，第一期不要接到支付或下单。在电脑上点「展开说明」时，只有当前卡片平滑展开，旁边的卡片保持原来的高度。

### 联系方式

`content/social.json` 的 `primary` 是六个主联系：QQ、微信、X、Telegram、Gmail、GitHub。

按 `group` 分成三块：社交账号（QQ / 微信）、海外账号（X / Telegram）、其他方式（Gmail / GitHub）。

每条可以是：

- `"action": "link"`：打开 `href`
- `"action": "copy"`：点击复制 `value`

## 图片

站点使用的静态资源在 `public/images/`（以及 `public/` 根目录下的图标）：

| 文件 | 用途 |
| --- | --- |
| `avatar_square.jpg` | 个人头像（Hero 圆形头像） |
| `brand-avatar.jpg` | 顶栏左侧圆形微缩头像 |
| `welcome.jpg` | 首页右侧欢迎插画 |
| `bedroom.jpg` | 关于我插画 |
| `rain.jpg` | 联系方式插画 |
| `cake.jpg` | 404 页插画 |
| `bg-anime-cute.svg` | 全页可爱二次元纹理背景（猫爪、蝴蝶结、樱花、星芒、爱心） |
| `favicon.png` / `favicon.ico` / `favicon.svg` | 浏览器标签栏图标（裁切自 Hello.jpg） |

把同名文件换成你的图即可。建议头像使用 1:1 正方形图；插画使用竖图即可。如果修改了图片，建议在引用路径后加上 `?v=9` 等参数避免浏览器本地强缓存。

## 推到 GitHub

1. 在 GitHub 新建一个空仓库（不要勾选自动加 README）
2. 在本机项目目录执行（把用户名和仓库名换掉）：

```bash
git init
git add .
git commit -m "第一期：个人站点占位壳子"
git branch -M main
git remote add origin https://github.com/你的用户名/仓库名.git
git push -u origin main
```

之后每次改内容，只要 `git add`、`git commit`、`git push`。

## 部署到 Cloudflare Pages

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages**
2. **创建** → **Pages** → **导入 Git 仓库**
3. 选中刚才的 GitHub 仓库
4. 构建设置：

| 项 | 值 |
| --- | --- |
| 框架预设 | Astro |
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |
| 生产分支 | `main` |

5. 保存并部署。完成后天会得到 `*.pages.dev` 地址，可再绑定自己的域名。

以后每次推送到 `main`，Pages 会自动重新构建。

## 以后若要动态化（第一期不要做）

现在内容都在 `content/`，布局在 `src/`。以后如果需要在线改文案、表单后端或登录，可以：

- 继续用这一套前端，把 `content/` 迁到无头 CMS（例如 Notion、Contentful）或自己的 API
- 或给 Cloudflare 加上 Functions / Workers，只给「表单提交」这类功能，首页仍保持静态生成

**第一期不要加后台、数据库或服务端渲染。** 先把占位壳子看顺眼，再换真实内容。

## 明确不会出现的东西

- 留言 / 评论 / 账号系统
- 支付、购物车、订单
- WhatsApp、Proton
- 多语种
- 独立「后续待办」页面
