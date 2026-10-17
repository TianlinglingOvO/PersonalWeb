---
title: 如何让Cloudflare托管自己的域名？
date: 2026-10-17
description: 教你如何购买域名以及将域名托管到Cloudflare上
category: 教程
---

## 前言

### 为什么要将自己的域名托管到Cloudflare？

Cloudflare 是全球知名的 CDN 和域名解析服务商，我们平时访问网站时看到的人机验证，很多就是他们家的= w =

将域名托管到 Cloudflare 上，可以白嫖到一些在原来域名厂商那里享受不到的服务，比如`免费的 CDN 加速`、`免费的 HTTPS 证书`、`隐藏服务器的真实 IP`，还能用 `Cloudflare Pages 免费部署网站`(～￣▽￣)～

俗话说：有便宜不占--王八蛋(bushi)

## 购买域名

域名网站千千万，选一个自己喜欢的地方买就好了。

虽然说 Cloudflare 上也可以买域名，不过在 Cloudflare 买的域名`默认就托管在它上面`，为了演示托管流程，这次就没在上面买啦OwO

我是在[Spaceship](https://www.spaceship.com/)上购买的域名。

关于域名的购买操作我就简单带过一下吧，毕竟emmmm，真的没有技术含量喵= w =

![STEP1](/images/move_domain_to_cloudflare/1.png)

*打开网站，搜索你想要注册的域名*

这里需要说明一点：

便宜的域名可以搜索`数字 + .xyz` 后缀，一年`不到 7 块钱`。

如果你想要带字母又相对便宜的域名（例如我的网站网址：[sutady.top](https://sutady.top/)），可以搜索`字母 + .top` 后缀，一般`首年 10 块钱，续费 30 块左右`。

![STEP2](/images/move_domain_to_cloudflare/2.png)

*加入购物车*

![STEP3](/images/move_domain_to_cloudflare/3.png)

*支付*

![STEP4](/images/move_domain_to_cloudflare/4.png)

*选择支付方式（推荐支付宝）*

## 域名托管

### 找到NS服务器(名称服务器)

![STEP5](/images/move_domain_to_cloudflare/5.png)

*所有产品->域名->域名管理器*

![STEP6](/images/move_domain_to_cloudflare/6.png)

*选择你的域名->高级DNS*

![STEP7](/images/move_domain_to_cloudflare/7.png)

*这里就是名称服务器*

以上这几个步骤是为了找到 `NS 服务器`，也叫`名称服务器`。

我们要将这里的名称服务器修改为 `Cloudflare 的名称服务器`。不同的网站可能位置有差异，但是功能是一样的。

### 在 Cloudflare 添加域名

首先需要`注册一个 Cloudflare 账号`。

![STEP8](/images/move_domain_to_cloudflare/8.png)

*域名(Domain)->概览(overview)->添加域名(Add domain)*

![STEP9](/images/move_domain_to_cloudflare/9.png)

*点击“连接域名”*

![STEP10](/images/move_domain_to_cloudflare/10.png)

*输入你的域名->继续*

![STEP11](/images/move_domain_to_cloudflare/11.png)

*选择Free Plan*

### 修改名称服务器

![STEP12](/images/move_domain_to_cloudflare/12.png)

*点击“继续前往激活”*

这里蓝色框框中的内容`不是报错，只是提示`。因为我们还没有添加任何 DNS 记录。

![STEP13](/images/move_domain_to_cloudflare/13.png)

*点击“确认”*

![STEP14](/images/move_domain_to_cloudflare/14.png)

*复制Cloudflare的名称服务器*

![STEP15](/images/move_domain_to_cloudflare/15.png)

*返回到原来的名称服务器，点击“更改”*

![STEP16](/images/move_domain_to_cloudflare/16.png)

*选择“自定义”，添加Cloudflare的名称服务器*

![STEP17](/images/move_domain_to_cloudflare/17.png)

*返回Cloudflare，点击“已更新域名服务器”*

![STEP18](/images/move_domain_to_cloudflare/18.png)

*查询名称服务器的情况*

![STEP19](/images/move_domain_to_cloudflare/19.png)

*名称服务器状态*

更换名称服务器后，需要等它在全网生效，Cloudflare 会定时检查，生效后就会显示托管成功。

一般需要等待 `30 分钟到 2 小时`，慢的话可能要 `24 小时`。

### 验证托管是否成功

![STEP20](/images/move_domain_to_cloudflare/20.png)

*成功托管显示，点击“DNS记录”*

![STEP21](/images/move_domain_to_cloudflare/21.png)

*点击“添加记录”，随便填写一个测试记录*

注意`要关掉代理状态`，也就是灰色云朵的“仅 DNS”。如果开着代理（橙色云朵），ping 出来的会是 Cloudflare 的 IP，而不是我们填的 `1.1.1.1`，看起来就像失败了一样。

![STEP22](/images/move_domain_to_cloudflare/22.png)

*测试能不能ping通，以及返回的IP*

在 cmd 或 PowerShell 里输入 `ping test.你的域名` 就可以了= w =

ping 上我们刚刚添加的域名之后，可以看到返回了 `1.1.1.1` 的 IP 地址，表示`成功解析域名`了。

测试成功后，`记得把这条 test 记录删掉`哦。

## 结语

由于感冒，脑细胞有点罢工了QwQ，所以教程截图的视觉体验可能较差，还请见谅喵= w =

如果想要了解如何上传自己的网页，让别人通过网址访问你的网页，还请移步[网页部署教程](/articles/how_to_deploy_web/)

