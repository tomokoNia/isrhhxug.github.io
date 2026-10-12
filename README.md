# 像素笔记 · 一个 Markdown 静态博客

这是一个可以直接用的个人博客模板：**用 Markdown 写文章**，用 Node.js 脚本生成纯静态的 HTML，最后由 **GitHub Pages** 托管。

没有数据库，没有后端服务器，没有 React / Vue / Next.js，也没有需要付费的云服务。

```text
src/posts/*.md        ← 你写文章的地方
        ↓
tools/build.js        ← 构建脚本（Node.js）
        ↓
docs/*.html           ← 生成出来的静态网站
        ↓
GitHub Actions        ← push 之后自动构建
        ↓
GitHub Pages          ← 别人访问的地址
```

读完这份 README，你应该能做到：在本地看到自己的博客、写出第一篇文章、把它发布到互联网上。

---

## 目录

1. [这个项目是什么](#1-这个项目是什么)
2. [准备工作](#2-准备工作)
3. [如何在本地运行](#3-如何在本地运行)
4. [如何写一篇文章](#4-如何写一篇文章)
5. [Markdown 支持哪些语法](#5-markdown-支持哪些语法)
6. [文章开头的元信息（front matter）](#6-文章开头的元信息front-matter)
7. [如何构建](#7-如何构建)
8. [如何部署到 GitHub Pages](#8-如何部署到-github-pages)
9. [如何修改网站名称和简介](#9-如何修改网站名称和简介)
10. [如何修改个人信息](#10-如何修改个人信息)
11. [如何修改视觉样式](#11-如何修改视觉样式)
12. [哪些文件以后基本不用碰](#12-哪些文件以后基本不用碰)
13. [项目结构详解](#13-项目结构详解)
14. [常见问题](#14-常见问题)
15. [技术选择说明](#15-技术选择说明)

---

## 1. 这个项目是什么

它是一个**静态网站生成器 + 一套现成的博客外观**。

- 你只需要写 Markdown 文件；
- 构建脚本会把 Markdown 变成完整的 HTML 网站；
- 生成的网站只有 HTML、CSS、JS 三种文件，任何静态托管服务都能放。

它的设计目标是**低维护成本**：

| 目标 | 做法 |
| --- | --- |
| 写文章简单 | 一个 `.md` 文件就是一篇文章，开头写几行元信息 |
| 不碰前端代码 | 文章里只有 Markdown，没有任何 HTML 结构 |
| 换风格不影响旧文章 | 模板和样式全部独立在 `src/templates/`、`src/styles/` |
| 依赖少 | 运行只用到 3 个 markdown 相关的小依赖 |
| 部署简单 | 配好一次，以后只需要 `git push` |

---

## 2. 准备工作

你需要安装两样东西：

### Node.js

到 <https://nodejs.org/> 下载 **LTS 版本**（长期支持版）并安装。

安装完成后，打开终端（Windows 上是「PowerShell」或「终端」，macOS 上是「终端」），输入：

```bash
node --version
```

如果显示类似 `v20.11.0` 的版本号，说明装好了。

> 本项目要求 Node.js 18 或更高版本。

### Git

到 <https://git-scm.com/downloads> 下载安装。

装好后输入：

```bash
git --version
```

能显示版本号就行。

> 如果你还不熟悉 Git，可以先只用本地预览，等文章写顺了再考虑发布。
> 发布部分在第 8 节。

### 一个编辑器

推荐 [Visual Studio Code](https://code.visualstudio.com/)，它对 Markdown 支持很好。

---

## 3. 如何在本地运行

在项目目录里打开终端，依次执行三条命令：

```bash
npm install     # 安装依赖，只需要执行一次
npm run dev     # 启动本地预览
```

然后打开浏览器访问：

```text
http://127.0.0.1:4321/
```

你会看到博客已经在本地运行了。

### `npm run dev` 做了什么

1. 先构建一次网站；
2. 启动一个本地服务器；
3. 监听 `src/` 里的文件变化——你一保存 Markdown，它就自动重新构建并刷新浏览器。

也就是说，**写作的时候让这个命令一直开着就行**。

按 `Ctrl + C` 停止。

### 其它几个命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地预览 + 自动重建 + 自动刷新页面 |
| `npm run build` | 只构建一次，结果放在 `docs/` |
| `npm run serve` | 只把 `docs/` 当静态网站发出来（不监听变化） |
| `npm run new -- "标题"` | 生成一篇新文章的骨架文件 |
| `npm run clean` | 删除 `docs/` 目录 |
| `node tools/verify.js` | 自检：检查生成结果里有没有坏链接 |

> **本地预览会显示草稿**（`draft: true` 的文章），正式构建不会。这是刻意的。

---

## 4. 如何写一篇文章

### 最快的方法

在 `src/posts/` 目录里新建一个 `.md` 文件，文件名建议这样写：

```text
src/posts/2026-10-15-my-new-post.md
     ▲         ▲        ▲
   放在这里   日期    英文短标题
```

文件内容：

````markdown
---
title: 我的新文章
date: 2026-10-15
category: 随笔
excerpt: 这是显示在首页列表里的摘要。
draft: false
---

# 我的新文章

这里开始写正文，用 Markdown 语法。

## 一个小标题

正文……
````

保存，本地预览会自动刷新。完成。

### 用命令生成骨架

```bash
npm run new -- "我的新文章"
npm run new -- "读《人月神话》" --category=阅读
```

它会创建 `src/posts/日期-标题.md`，并填好元信息（`draft: true`），你只要打开写正文。

### 文件名、标题、网址的关系

| 内容 | 来自哪里 | 示例 |
| --- | --- | --- |
| 显示在页面上的标题 | 元信息里的 `title` | 我的新文章 |
| 网址 | 文件名去掉日期部分 | `/posts/my-new-post/` |
| 列表里的日期 | 元信息里的 `date`，没有就用文件名前缀的日期 | 2026-10-15 |

所以你可以随意改文件名里的英文标题，网址会跟着变。**但改网址会让旧链接失效**，如果文章已经被别人引用过，尽量不要再改文件名。

---

## 5. Markdown 支持哪些语法

下表里的语法都经过测试，可以直接用。`src/posts/2026-06-05-markdown-cheatsheet.md` 就是一份可以照着抄的示例。

| 语法 | 写法 |
| --- | --- |
| 标题 | `# 一级`、`## 二级`、`### 三级` |
| 粗体 | `**粗体**` |
| 斜体 | `*斜体*` |
| 删除线 | `~~删除线~~` |
| 引用 | `> 引用内容` |
| 无序列表 | `- 项目` |
| 有序列表 | `1. 项目` |
| 链接 | `[文字](https://example.com)` |
| 图片 | `![说明](/assets/pic.png)` |
| 表格 | 用 `\|` 分隔，第二行写 `\| --- \|` |
| 行内代码 | `` `code` `` |
| 代码块 | 三个反引号包起来，第一行写语言名 |
| 脚注 | 正文写 `[^1]`，下面写 `[^1]: 内容` |
| 自动链接 | 直接写 `https://example.com` 会自动变成链接 |
| 分隔线 | `---` |
| 直接写 HTML | 支持，但一般不需要 |

### 代码块会高亮

写清楚语言名就会自动上色：

````markdown
```js
const x = 1;
```
````

支持的语言包括：`js` `ts` `jsx` `tsx` `json` `html` `css` `scss` `bash` `shell`
`powershell` `python` `ruby` `go` `rust` `java` `c` `cpp` `csharp` `php` `sql`
`yaml` `toml` `ini` `docker` `make` `markdown` 等。

> 高亮的实现很简单，是项目自带的一小段词法着色（见 `tools/lib/highlighter.js`），
> 不追求 100% 准确。如果某个词颜色不对，不影响阅读。

### 图片放在哪

放在 `src/assets/` 里，构建时会自动复制到网站：

| 你放的位置 | 文章里怎么写 |
| --- | --- |
| `src/assets/photo.jpg` | `![照片](/assets/photo.jpg)` |

以 `/` 开头是推荐的写法：**如果你部署在 `用户名.github.io/仓库名/` 这种子路径下，
构建脚本会自动帮你加上前缀**，不需要改文章。

### 目录（TOC）是自动的

文章里只要有**两个以上的二级或三级标题**，右侧就会自动出现目录，并跟随滚动高亮当前小节。
不需要你写任何东西。

想调整收录层级，改 `blog.config.json` 里的 `markdown.tocMin` / `tocMax`。

---

## 6. 文章开头的元信息（front matter）

两个 `---` 之间的部分是文章的元信息，**不是正文**。

```yaml
---
title: 文章标题
date: 2026-09-29
category: 随笔
excerpt: 摘要
draft: false
pinned: false
---
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 否 | 不写就用文件名 |
| `date` | 否 | 格式 `YYYY-MM-DD`；不写先看文件名前缀，再没有就用文件修改时间 |
| `category` | 否 | 分类，**只能有一个**，会生成对应的分类页 |
| `excerpt` | 否 | 摘要，显示在首页列表里；不写就自动截取正文开头 |
| `draft` | 否 | `true` 表示草稿，正式构建时会被完全跳过 |
| `pinned` | 否 | `true` 表示置顶，会出现在首页顶部并带「置顶」标记 |
| `slug` | 否 | 手动指定网址片段，一般不用写 |

> 写在这张表以外的字段会被忽略（不会有副作用，只是不生效）。

### 关于 `draft`

- `draft: true` → `npm run dev` 能看到，`npm run build` 和 GitHub Pages 上看不到；
- 写完了把它改成 `draft: false`（或删掉这一行）再发布。

这是防止你把没写完的东西发出去的最简单办法。

---

## 7. 如何构建

```bash
npm run build
```

构建结果全部在 `docs/` 目录里：

```text
docs/
├── index.html                    首页
├── page/2/index.html             首页第 2 页（只有文章多的时候才有）
├── posts/文章名/index.html        每篇文章
├── archive/index.html            归档（按年份）
├── categories/index.html         分类总览
├── categories/分类名/index.html   每个分类一页
├── about/index.html              关于页（来自 src/pages/about.md）
├── 404.html                      404 页面
├── feed.xml                      RSS
├── sitemap.xml                   站点地图
├── robots.txt
├── favicon.svg
└── assets/                       样式、脚本、你的图片
```

构建完成时终端会打印统计信息，例如：

```text
构建完成：20 个页面，用时 45 ms
文章 8 篇 · 独立页面 1 个 · RSS 8 条 · Sitemap 14 条
```

### 自检

```bash
node tools/verify.js
```

它会检查生成结果里有没有坏链接、有没有残留的模板占位符等。**部署前跑一下心里更踏实。**

### 关于 `docs/` 目录

- 它是**构建产物**，不要手动改里面的文件，下次构建会被覆盖；
- 它**需要提交到 Git**（GitHub Pages 要靠它，同时你也多了一份历史备份）。

---

## 8. 如何部署到 GitHub Pages

配好一次之后，以后发布只需要 `git add` → `git commit` → `git push` 三条命令。

### 第一步：在 GitHub 上建一个仓库

1. 登录 <https://github.com/>；
2. 点右上角 `+` → `New repository`；
3. 填写仓库名，例如 `blog`；
4. **可以选 Public，也可以选 Private**（GitHub Pages 对私有仓库的支持取决于你的账户类型）；
5. **不要**勾选 "Add a README file"；
6. 点 `Create repository`。

### 第二步：把本地项目推上去

在项目目录里执行（把 `你的用户名` 和 `仓库名` 换成你自己的）：

```bash
git init
git add .
git commit -m "第一次提交：我的博客"
git branch -M main
git remote add origin https://github.com/你的用户名/仓库名.git
git push -u origin main
```

> 如果 `git push` 要求登录，推荐用 [GitHub CLI](https://cli.github.com/) 的 `gh auth login`，
> 或者配置 SSH key。用账号密码推送已经被 GitHub 停用了。

### 第三步：把 Pages 的来源设为 GitHub Actions

1. 打开仓库页面 → `Settings` → 左侧菜单 `Pages`；
2. 在 **Build and deployment** → **Source** 里选择 **`GitHub Actions`**；
3. 保存。

> 这一步只需要做一次。项目里已经带好了 `.github/workflows/deploy.yml`，
> 你不需要自己写任何配置。

### 第四步：等它跑完

1. 打开仓库的 `Actions` 标签页；
2. 会看到一个叫「构建并部署到 GitHub Pages」的任务在运行；
3. 大约一分钟后它变成绿色的对勾；
4. 回到 `Settings` → `Pages`，页面上会显示你的网站地址。

### 你的网站地址是什么

有两种情况，工作流会自动判断，**你不需要改任何文件**：

| 仓库名 | 网站地址 |
| --- | --- |
| `你的用户名.github.io` | `https://你的用户名.github.io/` |
| 其它名字（例如 `blog`） | `https://你的用户名.github.io/blog/` |

### 第一次之后，怎么发布新文章

```bash
git add .
git commit -m "新增：一篇文章"
git push
```

推送完成后 GitHub Actions 会自动构建并发布，一两分钟后网站就更新了。
**不需要在本地运行任何构建命令。**

### 想让 RSS 和 sitemap 里的链接正确

打开 `blog.config.json`，把 `site.url` 改成你的真实网址：

```json
"url": "https://你的用户名.github.io",
```

部署到 GitHub Pages 时，工作流会用环境变量自动设置这个值，
所以即使你不改也能正常工作；但如果你绑定了自己的域名，就应该在这里写清楚。

### 绑定自己的域名（可选）

1. 在仓库的 `Settings` → `Pages` → `Custom domain` 里填你的域名；
2. 按 GitHub 的提示在你的域名服务商那里配置 DNS；
3. 勾选 `Enforce HTTPS`。

---

## 9. 如何修改网站名称和简介

**全部在 `blog.config.json` 这一个文件里。** 它就是一个普通的文本文件。

```json
{
  "site": {
    "title": "像素笔记",
    "tagline": "一个安静的个人博客",
    "description": "显示在搜索引擎结果和 RSS 里的更长的一段介绍。",
    "author": "你的名字",
    "lang": "zh-CN",
    "timezone": "Asia/Shanghai",
    "url": "https://你的用户名.github.io",
    "base": "/",
    "postsPerPage": 8,
    "themeColor": "#2f6fc4",
    "nav": [
      { "label": "首页", "href": "/" },
      { "label": "归档", "href": "/archive/" },
      { "label": "分类", "href": "/categories/" },
      { "label": "关于", "href": "/about/" }
    ],
    "footerText": "页脚的一句话。",
    "social": [
      { "label": "GitHub", "href": "https://github.com/你的用户名" }
    ]
  }
}
```

| 字段 | 作用 |
| --- | --- |
| `title` | 网站名称，出现在页头、浏览器标签页标题、RSS 里 |
| `tagline` | 网站名称下面的那句话 |
| `description` | 更长的介绍，用于 SEO 和 RSS |
| `author` | 作者名，显示在页脚 |
| `lang` | 页面语言，中文用 `zh-CN` |
| `timezone` | 时区，影响日期处理 |
| `url` | 你的网站地址，影响 RSS 和 sitemap 里的绝对链接 |
| `base` | 部署子路径。**通常留 `/`**，工作流会自动判断 |
| `postsPerPage` | 首页每页显示几篇文章 |
| `themeColor` | 浏览器地址栏的主题色 |
| `nav` | 顶部导航，可以自由增删条目 |
| `footerText` | 页脚的文字 |
| `social` | 页脚右侧的链接列表 |

**改完记得重新构建**（`npm run build`）或者直接 `git push`，网页不会立刻变。

> 注意：JSON 文件不能写注释，也不能漏逗号，最后一项后面**不能**有逗号。
> 改完如果构建报错，多半是这里的问题（终端会明确告诉你）。

### 增删导航条目

比如想加一个「友链」页面：先在 `src/pages/links.md` 里写好内容，
然后在 `nav` 里加一行：

```json
{ "label": "友链", "href": "/links/" }
```

---

## 10. 如何修改个人信息

分两处：

### 页脚和网站级别的信息 → `blog.config.json`

- `site.author`：作者名（页脚显示）
- `site.social`：页脚的链接列表（GitHub、邮箱、微博等）

```json
"social": [
  { "label": "GitHub", "href": "https://github.com/你的用户名" },
  { "label": "邮箱", "href": "mailto:you@example.com" }
]
```

### 「关于」页面 → `src/pages/about.md`

这是一个普通的 Markdown 文件，直接改就行：

```markdown
---
title: 关于
excerpt: 关于这个博客，以及关于我。
---

# 关于

你好，我是 **你的名字**……

## 联系我

- GitHub：`https://github.com/你的用户名`
- 邮箱：`you@example.com`
```

### 想加更多独立页面

在 `src/pages/` 里新建 `.md` 文件即可，文件名就是网址：

| 文件 | 网址 |
| --- | --- |
| `src/pages/about.md` | `/about/` |
| `src/pages/links.md` | `/links/` |

加完记得在 `blog.config.json` 的 `nav` 里加上链接。

> `src/pages/` 里的文件**不会**出现在首页列表、归档、分类和 RSS 里，
> 它们只是独立页面。

---

## 11. 如何修改视觉样式

**所有样式都在 `src/styles/main.css` 一个文件里**，构建时会原样变成 `docs/assets/style.css`。

文件开头有一大段注释说明结构，大致是：

| 段落 | 内容 |
| --- | --- |
| `01 变量` | 颜色、圆角、阴影、字体、宽度上限 |
| `02 基础` | reset、排版、链接 |
| `03 布局` | 页头、页脚、栅格 |
| `04 组件` | 面板、按钮、文章卡片、分页、分类 chip |
| `05 文章样式` | `.prose` 里 Markdown 生成的元素 |
| `06 代码高亮` | `.tok-*` 的颜色 |
| `07 响应式` | 手机 / 平板 |
| `08 打印` | 打印时的样式 |

### 一套配色，两个颜色

整站只用了两个强调色，它们故意"撞"在一起：

| 变量 | 颜色 | 负责什么 |
| --- | --- | --- |
| `--accent` / `--accent-strong` / `--accent-soft` | 天空蓝 | 结构：窗口标题栏、链接、主按钮、分页 |
| `--accent2` / `--accent2-strong` / `--accent2-soft` | 草地绿 | 内容：分类、区块分隔线、次要按钮 |

还有几组"氛围变量"（`--sun-glow`、`--horizon-*`、`--scanline`），
负责首页那块发光的天空和全站那层很淡的扫描线。

### 改主色（最简单的改动）

打开 `src/styles/main.css`，找到最上面的：

```css
:root {
  /* 主色：天空蓝 */
  --accent: #2f6fc4;
  --accent-strong: #1e4f96;
  --accent-soft: #d8e8fb;

  /* 次色：草地绿 */
  --accent2: #5aa62e;
  --accent2-strong: #3a7719;
  --accent2-soft: #e2f2d5;
  ...
}
```

改前三个变量换主色，改后三个换次色，整站就跟着变了。

> 建议保持"一冷一暖"或者"一深一浅"的搭配，撞色才好看。
> 如果两个颜色太接近，整个界面会显得糊在一起。

也可以同时改 `blog.config.json` 里的 `themeColor`（浏览器地址栏颜色）
和 `theme.accent`（注入到页面里的强调色），让它们和你选的颜色一致。

### 深色模式

深色模式是**同一批变量换一套取值**，在 `main.css` 里有两处：

- `:root[data-theme="dark"]` —— 用户手动点按钮切换时生效；
- `@media (prefers-color-scheme: dark)` —— 跟随系统设置时生效。

深色模式下蓝和绿都调亮了（否则在深底上看不见），
所以 `--accent-text` 这类"写在强调色上的文字颜色"也跟着反过来——
深色模式里是深色字配亮色底。改颜色时记得两处一起改。

想彻底不用深色模式，删掉这两段，并删掉 `src/templates/shell.html` 里的主题切换按钮。

### 页面上的"立体感"是怎么做的

如果你想让别的元素也有那种老界面的厚度，照着抄这两种：

```css
/* 凸起（按钮、窗口） */
box-shadow: inset 1px 1px 0 var(--bevel-light), inset -1px -1px 0 var(--bevel-dark);

/* 凹下（输入框） */
box-shadow: inset 2px 2px 0 var(--bevel-darker), inset -1px -1px 0 var(--bevel-light);
```

关键只有一条：**光永远从左上角来**——左上亮、右下暗就是凸起，反过来就是凹下。

### 改字体

```css
--font-sans: system-ui, -apple-system, "Segoe UI", Roboto, ...;
--font-mono: ui-monospace, ...;
```

默认用的是系统字体，所以页面加载快、不会有字体闪烁。想换成 Web 字体，
把字体文件放进 `src/assets/fonts/`，在 CSS 里用 `@font-face` 引入即可。

### 改页面结构

模板在 `src/templates/`：

| 文件 | 作用 |
| --- | --- |
| `shell.html` | 所有页面共用的外壳：页头、导航、页脚 |
| `index.html` | 首页内容区 |
| `post.html` | 文章页内容区 |
| `list.html` | 归档 / 分类页内容区 |
| `page.html` | 独立页面（关于等） |
| `404.html` | 404 页面 |

模板里只有两种占位符：

- `{{变量}}` —— 会被 HTML 转义（用于文本）
- `{{{变量}}}` —— 原样插入（用于已经是 HTML 的内容）

> 改模板属于「改网站结构」，不是必须的。因为文章里只有 Markdown，
> 所以无论样式和结构怎么变，你的历史文章都不需要动一个字。

### 关于现在的视觉风格

界面参考了上世纪末桌面系统的拟物感，配色是**蓝天 + 绿草**：

- 蓝色负责结构和框架（窗口标题栏、链接、主按钮）；
- 绿色负责内容和标记（分类、分隔线、次要按钮）；
- 两个颜色会在一些地方直接相邻出现，比如首页标题下面那条一半蓝一半绿的横线、
  置顶徽章的渐变、标题栏底部的绿边。

立体感来自三个很朴素的手法：

1. 明确的边框和左上亮、右下暗的 1px 立体边；
2. 很短、很硬的阴影（没有大面积模糊）；
3. 很小的圆角。

"复古未来感"来自三个几乎看不见的细节：页头最上面那道 2px 蓝绿细线、
页面背景上 3px 一组的扫描线、以及首页右上角那团像太阳一样的光晕。

全都是 CSS 渐变，**没有用任何图片**。字体用的也是系统字体，
所以整站加载很快，深色模式下不需要换图。

如果你想换成完全不同的风格（比如极简白卡片），只要改 `main.css` 就够了，
不需要动模板，更不需要动文章。

---

## 12. 哪些文件以后基本不用碰

这是最重要的一节。把它当成一张地图：

### 你经常要改的

| 路径 | 说明 |
| --- | --- |
| `src/posts/*.md` | **写文章**，这是你唯一需要天天打交道的地方 |
| `src/pages/about.md` | 「关于」页面的内容 |
| `blog.config.json` | 网站名称、简介、作者、导航、每页文章数 |
| `src/assets/` | 你自己的图片、字体等素材 |

### 你偶尔会改的

| 路径 | 什么时候改 |
| --- | --- |
| `src/styles/main.css` | 想换颜色、字体、间距、圆角的时候 |
| `src/templates/*.html` | 想改页面结构的时候（不常发生） |

### 你基本不用碰的（除非想改功能）

| 路径 | 说明 |
| --- | --- |
| `tools/build.js` | 构建脚本：读 Markdown → 套模板 → 写 HTML |
| `tools/dev-server.js` | 本地预览服务器 |
| `tools/serve.js` | 静态预览服务器 |
| `tools/verify.js` | 自检脚本 |
| `tools/lib/*.js` | 元信息解析、Markdown 渲染、语法高亮 |
| `src/scripts/*.js` | 浏览器端脚本：主题切换、目录高亮、复制代码 |
| `.github/workflows/deploy.yml` | 自动部署配置 |
| `package.json` | 依赖和命令定义 |

### 绝对不要手动改的

| 路径 | 原因 |
| --- | --- |
| `docs/` 里的所有文件 | 构建产物，下次构建会被整个覆盖 |

---

## 13. 项目结构详解

```text
blog/
├── blog.config.json              ★ 网站配置（名称、简介、导航……）
│
├── src/                          ── 源文件 ──
│   ├── posts/                    ★ 文章（你主要在这里写作）
│   │   ├── 2026-09-29-my-first-post.md
│   │   └── ...
│   ├── pages/                    ★ 独立页面
│   │   └── about.md
│   ├── assets/                   ★ 图片等素材
│   │   └── README.txt
│   ├── templates/                页面结构（HTML 模板）
│   │   ├── shell.html            公共外壳
│   │   ├── index.html            首页
│   │   ├── post.html             文章页
│   │   ├── list.html             归档 / 分类
│   │   ├── page.html             独立页面
│   │   └── 404.html
│   ├── styles/
│   │   └── main.css              全部样式（含深色模式）
│   └── scripts/
│       ├── app.js                主题、导航、目录高亮、复制代码
│       └── theme-init.js         防止深色模式闪白（会被内联进 <head>）
│
├── tools/                        ── 构建工具 ──
│   ├── build.js                  静态站点生成器（核心）
│   ├── dev-server.js             本地预览 + 自动重建
│   ├── serve.js                  纯静态预览
│   ├── verify.js                 生成结果自检
│   ├── new-post.js               新建文章骨架
│   └── lib/
│       ├── front-matter.js       解析文章开头的元信息
│       ├── markdown.js           Markdown → HTML
│       └── highlighter.js        代码语法高亮
│
├── docs/                         构建产物（GitHub Pages 发布的就是这里）
├── .github/workflows/deploy.yml  自动部署
├── package.json
└── README.md
```

带 ★ 的是你以后主要会打开的文件。

---

## 14. 常见问题

### 构建报错说 `blog.config.json 不是合法的 JSON`

JSON 的要求很严格：

- 每一项之间要有逗号，**最后一项后面不能有逗号**；
- 键和字符串必须用双引号 `"`，不能用单引号；
- 不能写注释。

### 我写了文章，但网站上没有

按顺序检查：

1. 文件在 `src/posts/` 里吗？
2. 扩展名是 `.md` 吗？
3. 元信息里是不是写着 `draft: true`？（本地预览能看到，正式构建看不到）
4. 重新构建了吗？（`npm run build`，或者 `git push` 让 Actions 重新跑）

### 首页没有分页

分页只在文章数量超过 `postsPerPage` 时才出现。
另外，**置顶文章不参与分页**，它固定出现在首页顶部。

### 样式改了但页面没变

浏览器缓存。按 `Ctrl + F5`（macOS 是 `Cmd + Shift + R`）强制刷新。

### 深色模式的颜色不对

`main.css` 里有**两处**深色模式变量（手动切换和跟随系统），需要一起改。

### 图片显示不出来

- 图片在 `src/assets/` 里吗？
- 文章里的路径是 `/assets/图片名` 吗？
- 有没有重新构建？（`src/assets/` 里的文件是构建时复制的）

### `npm run dev` 提示端口被占用

换个端口：

```bash
npm run dev -- --port=5000
```

### 部署后网站是 404

1. 仓库 `Settings` → `Pages` → `Source` 是不是选了 `GitHub Actions`？
2. `Actions` 标签页里的任务是不是绿色的？
3. 如果是仓库站点，网址要带仓库名：`https://用户名.github.io/仓库名/`

### 想删掉某篇文章

直接删掉 `src/posts/` 里对应的 `.md` 文件，重新构建即可。旧的 `docs/posts/文章名/`
目录会在下次构建时被自动清理。

### 想暂时隐藏一篇文章

不用改代码，把它的元信息改成 `draft: true` 就行。

### RSS 里的链接不对

改 `blog.config.json` 里的 `site.url`。

---

## 15. 技术选择说明

这一节解释「为什么这么做」，不需要读也能用。

### 为什么不用 React / Vue / Next.js

这是个人博客。页面在构建时就已经是完全确定的 HTML，浏览器端不需要组件树、
路由、状态管理这些东西。用框架会让依赖变多、构建变慢、出错时更难排查，
而换来的能力这里一个都用不上。

### 为什么依赖只有 3 个

```json
"markdown-it": "解析 Markdown",
"markdown-it-anchor": "给标题加 id 和锚点",
"markdown-it-footnote": "支持脚注"
```

其余全部功能——模板、分页、分类、归档、RSS、sitemap、
本地服务器、语法高亮——都是项目自带的一两百行代码，没有引入第三方库。

好处是：升级时不会因为某个依赖的破坏性变更而修一天；
任何事情出问题，都能在一个文件里找到原因。

### 为什么模板引擎是自己写的

`tools/build.js` 里的模板渲染只有两种占位符（`{{}}` 和 `{{{}}}`），
实现大约 30 行。对这种规模的网站，引入模板引擎带来的抽象成本
比它省下的代码更多。

### 为什么分类页面的目录名是拼音

分类名是中文时，直接用中文当目录名也能工作，但地址栏里会变成
`%E9%9A%8F%E7%AC%94` 这种一串转义字符，不好看也不好分享。

所以构建脚本会把分类名转成 `suibi`、`jishu` 这样的拼音目录名
（见 `tools/build.js` 里的 `taxonomySlug`）。表里查不到的汉字会用
一个稳定的短散列兜底，不会出错，只是目录名不那么可读而已。

### 为什么要写 `docs/.nojekyll`

GitHub Pages 默认会用 Jekyll 处理站点。我们这个文件是空的，
作用是告诉 GitHub「不要做任何处理，原样发布」。

### 关于 `<h1>`

文章页会有一个「面板标题栏」里的 `<h1>`，加上你 Markdown 正文里的 `<h1>`，
所以一页里有两个。这是刻意保留的：正文里的标题属于文章内容，
让你可以把同一份 Markdown 直接复制到别的地方使用。

---

## 许可

这个项目里的代码可以随意使用、修改、分发。
文章内容（`src/posts/` 里的示例文字）仅作演示，请替换成你自己的。
