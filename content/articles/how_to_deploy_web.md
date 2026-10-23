---
title: 如何把自己的网页部署上线（超级简单版）
date: 2026-10-23
description: 谁能拒绝点点点就部署网页呢=w=
category: 教程
---

## 前言
> 教程使用 Cloudflare 进行演示。
>
> 如果想要将自己的域名托管到 Cloudflare 上，可以参考[Cloudflare域名托管](/articles/move_domain_to_cloudflare/)哦~ OvO

现在AI也是越来越强大了喵，可能有不少人跟我一样沉迷于 Vibe Coding 无法自拔(bushi

可能自己vibe了一个好看的网页，想要发给朋友体验一下，但是发现不只是单单一个HTML文件，可能还有CSS、JS等文件，总不能发一个压缩包过去吧w(ﾟДﾟ)w

所以将网页**部署上线**不失为一种优雅的方式了喵= w =

本期讲的方法比较简单，但也比较笨，只要`动动鼠标点点点`就可以完成了OwO

进阶的方法是搭配 GitHub 使用，不过这要涉及 git 操作，对小白来说还是有点难度和劝退，就不放在一起讲了喵

## 网页部署

首先我们进入 Cloudflare 控制台

![STEP1](/images/how_to_deploy_web/1.png)

*域名→概览*

先确认自己的域名已经托管好，状态显示为`活动`，后面绑定域名的时候会用到。

![STEP2](/images/how_to_deploy_web/2.png)

*计算→Workers 和 Pages→创建应用*

![STEP3](/images/how_to_deploy_web/3.png)

*点击“继续前往Pages”*

`Workers` 主要用来**跑代码**，`Pages` 专门用来**放网页**。我们只是放一个网页，用 Pages 就够了，杀鸡焉用牛刀呢喵= w =

![STEP4](/images/how_to_deploy_web/4.png)

*选择拖放文件的方式*

![STEP5](/images/how_to_deploy_web/5.png)

*给项目命名*

![STEP6](/images/how_to_deploy_web/6.png)

*将全部文件压缩为压缩包的形式*

上传前有两点需要注意：

- 网站的首页文件必须叫 `index.html`，而且要放在**最外层**。也就是打开文件夹（或者压缩包）的第一层就能看到 `index.html`，不能再套一层文件夹，否则打开网址会显示 `404`。
- 上传的**所有文件都会公开**。比如我这里一起上传了 `README.md`，别人访问 `网址/README.md` 就能看到它的内容。所以不想公开的文件，`不要放进去`哦。

![STEP7](/images/how_to_deploy_web/7.png)

*将压缩包拖入*

其实不压缩也可以，上传框里写着“上传内容`或文件夹`”，直接把整个网页文件夹拖进去也是一样的= w =

![STEP8](/images/how_to_deploy_web/8.png)

*上传成功→部署站点*

![STEP9](/images/how_to_deploy_web/9.png)

*部署成功→继续处理项目*

这里我们就可以看到部署完成了，通过蓝色的网址就可以预览当前的网站，别人也可以通过这个网址来浏览网站内容，只不过这个`网址有点丑`了QwQ

而且 `*.pages.dev` 这类网址在**中国大陆经常打不开**，所以最好还是`绑定自己的域名`，后面会讲到喵。

## 部署前后对比

![STEP10](/images/how_to_deploy_web/10.png)

*本地打开效果*

![STEP11](/images/how_to_deploy_web/11.png)

*部署后打开效果*

## 添加自己的域名

![STEP12](/images/how_to_deploy_web/12.png)

*自定义域→设置自定义域*

![STEP13](/images/how_to_deploy_web/13.png)

*设置自己的网站网址*

这里需要说明一下，蓝色框框中的 `demo` 叫做**子域名**，就是加在你的域名前面的那一段，可以`随便取`。

可以理解成在你的域名下面再开一个“分站”，形式是 `子域名.你的域名`。比如 `blog.你的域名`、`shop.你的域名` 就可以分别放不同的网站。

![STEP14](/images/how_to_deploy_web/14.png)

*点击激活域*

![STEP15](/images/how_to_deploy_web/15.png)

*查看状态*

## 部署结果

![STEP16](/images/how_to_deploy_web/16.png)

*自定义域名部署成果*

## 注意事项

> OK，到这里就已经将网页成功部署啦。别人就可以直接输入网址来访问你的网页了= w =
>
> 不过通过这种方式部署的话，**修改本地文件后就需要重新上传一遍**了，稍微有点繁琐捏
>
> 这里简单说一下更新方法

![STEP17](/images/how_to_deploy_web/17.png)

*回到Pages→点击项目*

![STEP18](/images/how_to_deploy_web/18.png)

*创建部署*

![STEP19](/images/how_to_deploy_web/19.png)

*选择生产→重新上传压缩包→保存并部署*

![STEP20](/images/how_to_deploy_web/20.png)

*更新后结果*

还要说明一点，因为浏览器缓存的存在，更新后需要按下 `Ctrl+F5` 强制刷新一下喵= w =

## 结语

以上就是简单的网页部署操作了，其实跟使用 git 相比的话，没差多少，git 的优势也就是`省去了后面重新上传的步骤`而已啦OwO

对于使用 Git 和 GitHub 进行部署感兴趣的话，可以移步[网页部署(进阶教程)](/articles/how_to_deploy_web_2/)

拜拜~
