#!/usr/bin/env node
'use strict';

/**
 * 静态站点生成器
 * ==========================================================================
 * 输入：src/posts/*.md、src/pages/*.md、src/templates/*.html、src/styles/*.css、
 *       src/scripts/*.js、src/assets/**、blog.config.json
 * 输出：docs/**（可以直接交给 GitHub Pages 的纯静态网站）
 *
 * 用法：
 *   node tools/build.js                 正常构建
 *   node tools/build.js --drafts        把 draft: true 的文章也构建出来（本地预览用）
 *   node tools/build.js --base=/blog/   临时改部署子路径
 *
 * 主流程只有一句话：
 *   读配置 → 读 Markdown → 渲染 → 套模板 → 写文件
 * 除了 markdown-it 之外没有别的运行时依赖。
 * ========================================================================== */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const { parseFrontMatter } = require('./lib/front-matter');
const { highlight, escapeHtml } = require('./lib/highlighter');
const markdown = require('./lib/markdown');

/* ==========================================================================
   路径
   ========================================================================== */

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const POSTS_DIR = path.join(SRC_DIR, 'posts');
const PAGES_DIR = path.join(SRC_DIR, 'pages');
const TEMPLATES_DIR = path.join(SRC_DIR, 'templates');
const STYLES_DIR = path.join(SRC_DIR, 'styles');
const SCRIPTS_DIR = path.join(SRC_DIR, 'scripts');
const ASSETS_DIR = path.join(SRC_DIR, 'assets');
const CONFIG_FILE = path.join(ROOT, 'blog.config.json');
const DEFAULT_OUT_DIR = path.join(ROOT, 'docs');

/* ==========================================================================
   命令行参数
   ========================================================================== */

function parseArgs(argv) {
  const options = { drafts: false, base: null, out: null, quiet: false };
  for (const arg of argv) {
    if (arg === '--drafts') options.drafts = true;
    else if (arg === '--quiet' || arg === '-q') options.quiet = true;
    else if (arg.startsWith('--base=')) options.base = arg.slice('--base='.length);
    else if (arg.startsWith('--out=')) options.out = arg.slice('--out='.length);
  }
  return options;
}

const OPTIONS = parseArgs(process.argv.slice(2));

/* ==========================================================================
   小工具
   ========================================================================== */

function normalizeBase(base) {
  let value = String(base || '/').trim();
  if (!value.startsWith('/')) value = '/' + value;
  if (!value.endsWith('/')) value += '/';
  return value.replace(/\/{2,}/g, '/');
}

/** 去掉开头的斜杠，用于拼绝对地址 */
function trimBase(base) {
  return String(base || '/').replace(/^\/+/, '');
}

/**
 * 拼接部署地址与站点内的路径，保证中间正好有一个斜杠。
 *   joinUrl('https://a.github.io', 'archive/')      → https://a.github.io/archive/
 *   joinUrl('https://a.github.io', 'blog/archive/') → https://a.github.io/blog/archive/
 */
function absoluteUrl(route) {
  const root = String(CONFIG.site.url).replace(/\/+$/, '');
  const base = trimBase(CONFIG.site.base).replace(/\/+$/, '');
  const rest = String(route || '').replace(/^\/+/, '');
  const path = [base, rest].filter(Boolean).join('/');
  if (!path) return `${root}/`;
  // 带扩展名的是文件（feed.xml），否则当成目录补一个结尾斜杠
  return /\.[a-z0-9]+$/i.test(path) ? `${root}/${path}` : `${root}/${path}/`;
}

/** 站点内的相对路径拼接（部署在子目录时用得上） */
function joinUrl(base, route) {
  const clean = String(route || '').replace(/^\/+/, '');
  return clean ? base + clean : base;
}

function truncate(text, max) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return value.slice(0, max).replace(/[\s,，。、；;:：\-—]+$/, '') + '…';
}

/** 去掉文本开头的 UTF-8 BOM（U+FEFF），避免拼进 CSS/JS 里变成无效字符 */
function stripBom(text) {
  return String(text).replace(/^\uFEFF/, '');
}

function stripMarkdownInline(text) {
  return String(text || '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .trim();
}

function posixify(filePath) {
  return String(filePath).split(path.sep).join('/');
}

async function exists(target) {
  try {
    await fsp.access(target);
    return true;
  } catch (error) {
    return false;
  }
}

async function writeFile(target, content) {
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, content, 'utf8');
}

/** 递归复制目录，返回复制的文件数 */
async function copyDir(from, to) {
  if (!(await exists(from))) return 0;
  let count = 0;
  const entries = await fsp.readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      count += await copyDir(source, target);
    } else if (entry.isFile()) {
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.copyFile(source, target);
      count += 1;
    }
  }
  return count;
}

/** 递归列出目录下所有文件（返回绝对路径） */
async function listFiles(dir, filter) {
  if (!(await exists(dir))) return [];
  const found = [];
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await listFiles(full, filter)));
    } else if (entry.isFile() && (!filter || filter(full))) {
      found.push(full);
    }
  }
  return found;
}

/** 输出文件路径 → 站点路径（用于导航高亮） */
function outputPathToSitePath(outputPath) {
  return '/' + posixify(outputPath).replace(/index\.html$/, '');
}

/* ==========================================================================
   配置
   ========================================================================== */

const DEFAULT_NAV = [
  { label: '首页', href: '/' },
  { label: '归档', href: '/archive/' },
  { label: '分类', href: '/categories/' },
];

function buildConfig(fileConfig, options) {
  const rawSite = fileConfig.site || {};
  const rawFeed = fileConfig.feed || {};
  const rawTheme = fileConfig.theme || {};

  // 环境变量优先于配置文件，这样 GitHub Actions 不必改动仓库里的文件
  const repo = process.env.GITHUB_REPOSITORY || '';
  const [repoOwner = '', repoName = ''] = repo.split('/');
  const isUserSite = Boolean(
    repoName && repoOwner && repoName.toLowerCase() === `${repoOwner.toLowerCase()}.github.io`
  );

  const base = normalizeBase(
    options.base || process.env.SITE_BASE || rawSite.base || (repoName && !isUserSite ? `/${repoName}/` : '/')
  );

  const url = String(process.env.SITE_URL || rawSite.url || 'https://example.github.io').replace(/\/+$/, '');

  const title = process.env.SITE_TITLE || rawSite.title || '我的博客';
  const tagline = String(rawSite.tagline || '').trim();
  const description = String(rawSite.description || '').trim();
  // 简介留空时用一个兜底文案，避免 <meta name="description"> 是空的
  const summary = description || tagline || `${title}的个人博客，记录文章、笔记与想法。`;

  const site = {
    title,
    tagline,
    description,
    summary,
    author: process.env.SITE_AUTHOR || rawSite.author || '',
    email: rawSite.email || '',
    lang: rawSite.lang || 'zh-CN',
    timezone: rawSite.timezone || 'Asia/Shanghai',
    url,
    base,
    repo,
    postsPerPage: Math.max(1, Number(process.env.SITE_POSTS_PER_PAGE) || Number(rawSite.postsPerPage) || 8),
    themeColor: rawSite.themeColor || '#2f6fc4',
    nav: Array.isArray(rawSite.nav) && rawSite.nav.length ? rawSite.nav : DEFAULT_NAV,
    footerText: rawSite.footerText || '',
    social: Array.isArray(rawSite.social) ? rawSite.social : [],
  };

  return {
    site,
    feed: {
      limit: Math.max(1, Number(rawFeed.limit) || 20),
      copyright: rawFeed.copyright || '',
    },
    theme: {
      default: ['light', 'dark', 'auto'].includes(rawTheme.default) ? rawTheme.default : 'auto',
      accent: rawTheme.accent || site.themeColor,
    },
    markdown: {
      tocMin: Number((fileConfig.markdown || {}).tocMin) || 2,
      tocMax: Number((fileConfig.markdown || {}).tocMax) || 3,
    },
  };
}

async function loadConfig() {
  let fileConfig = {};
  if (await exists(CONFIG_FILE)) {
    const text = await fsp.readFile(CONFIG_FILE, 'utf8');
    try {
      fileConfig = JSON.parse(text);
    } catch (error) {
      throw new Error(`blog.config.json 不是合法的 JSON：${error.message}`);
    }
  }
  return buildConfig(fileConfig, OPTIONS);
}

/* ==========================================================================
   日期
   ========================================================================== */

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDateText(isoDate) {
  const [year, month, day] = String(isoDate).split('-');
  if (!year || !month || !day) return String(isoDate);
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

/** 解析元信息里的日期，返回 YYYY-MM-DD */
function resolveDate(data, fileName, fallbackDate) {
  const fromData = data.date;
  if (fromData instanceof Date && !Number.isNaN(fromData.getTime())) {
    return `${fromData.getFullYear()}-${pad2(fromData.getMonth() + 1)}-${pad2(fromData.getDate())}`;
  }
  if (typeof fromData === 'string' || typeof fromData === 'number') {
    const match = String(fromData).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const fromName = String(fileName).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (fromName) return `${fromName[1]}-${fromName[2]}-${fromName[3]}`;

  return fallbackDate;
}

/* ==========================================================================
   模板引擎（只有 {{escaped}} 和 {{{raw}}} 两种占位符）
   ========================================================================== */

function escapeTemplateValue(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveTemplateValue(context, key) {
  const parts = String(key).trim().split('.');
  let value = context;
  for (const part of parts) {
    if (value == null) return undefined;
    value = value[part];
  }
  return value;
}

function renderTemplate(template, context) {
  let output = String(template);

  // 先处理 {{{raw}}}，否则会被 {{escaped}} 抢先匹配
  let guard = 0;
  while (guard++ < 500) {
    const start = output.indexOf('{{{');
    if (start === -1) break;
    const end = output.indexOf('}}}', start);
    if (end === -1) break;
    const key = output.slice(start + 3, end).trim();
    const value = resolveTemplateValue(context, key);
    output = output.slice(0, start) + (value == null ? '' : String(value)) + output.slice(end + 3);
  }

  guard = 0;
  while (guard++ < 500) {
    const start = output.indexOf('{{');
    if (start === -1) break;
    const end = output.indexOf('}}', start);
    if (end === -1) break;
    const key = output.slice(start + 2, end).trim();
    const value = resolveTemplateValue(context, key);
    output =
      output.slice(0, start) + (value == null ? '' : escapeTemplateValue(value)) + output.slice(end + 2);
  }

  return output;
}

async function loadTemplates() {
  const templates = {};
  for (const name of ['shell', 'index', 'post', 'list', '404', 'page']) {
    const file = path.join(TEMPLATES_DIR, `${name}.html`);
    if (!(await exists(file))) continue;
    templates[name] = await fsp.readFile(file, 'utf8');
  }
  if (!templates.shell) {
    throw new Error('找不到 src/templates/shell.html，无法构建。');
  }
  return templates;
}

/* ==========================================================================
   Markdown 处理
   ========================================================================== */

function wrapTables(html) {
  return html.replace(/<table>[\s\S]*?<\/table>/g, (table) => `<div class="table-scroll">${table}</div>`);
}

/** 把 Markdown 里的图片和链接改成能正确处理部署子路径的形式 */
function rewriteRelativeUrls(html) {
  const base = CONFIG.site.base;
  if (base === '/') return html;

  return html.replace(
    /(<(?:img|a)\b[^>]*?\s(?:src|href)=")(\.\.\/[^"]*|\/(?!\/)[^"]*)/g,
    (match, prefix, value) => {
      let route = value;
      while (route.startsWith('../')) route = route.slice(3);
      if (route.startsWith('/')) route = route.slice(1);
      return prefix + base + route;
    }
  );
}

/** 给代码块上色（输入输出都是 HTML 片段） */
function highlightCodeBlocks(html) {
  return html.replace(
    /<pre class="code-block"(?: data-lang="([^"]*)")?><code>([\s\S]*?)<\/code><\/pre>/g,
    (match, language, escapedCode) => {
      const lang = language || '';
      const code = highlight(escapedCode, lang);
      const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
      return `<pre class="code-block"${langAttr}><code>${code}</code></pre>`;
    }
  );
}

function renderMarkdown(source) {
  const result = markdown.render(source);
  const html = highlightCodeBlocks(rewriteRelativeUrls(wrapTables(result.html)));

  const headings = (result.headings || []).map((heading) => ({
    level: heading.level,
    id: heading.id,
    // 去掉标题末尾那个 # 锚点符号，避免它出现在目录里
    title: String(heading.title || '').replace(/\s*#\s*$/, '').trim(),
    titleHtml: heading.titleHtml,
  }));

  return { html, headings, plainText: result.plainText || '' };
}

/* ==========================================================================
   HTML 片段
   ========================================================================== */

const TITLE_SEP = ' · ';

function renderNav(site, currentPath) {
  return site.nav
    .map((item) => {
      const href = joinUrl(site.base, item.href || '/');
      const itemPath = outputPathToSitePath(String(item.href || '/').replace(/^\/+/, '') || 'index.html');
      const active = currentPath === itemPath;
      return `<li><a class="nav-link" href="${escapeHtml(href)}"${
        active ? ' aria-current="page"' : ''
      }>${escapeHtml(item.label)}</a></li>`;
    })
    .join('\n            ');
}

function renderFooterLinks(site) {
  const links = [
    `<li><a href="${escapeHtml(joinUrl(site.base, 'feed.xml'))}">RSS</a></li>`,
    `<li><a href="${escapeHtml(joinUrl(site.base, 'sitemap.xml'))}">Sitemap</a></li>`,
  ];
  for (const item of site.social || []) {
    if (!item || !item.href) continue;
    links.push(
      `<li><a href="${escapeHtml(item.href)}" rel="noopener">${escapeHtml(item.label || item.href)}</a></li>`
    );
  }
  return links.join('\n        ');
}

function renderHead() {
  return `<script>${THEME_INIT_SCRIPT}</script>\n    <style>:root{--accent:${escapeHtml(
    CONFIG.theme.accent
  )};}</style>`;
}

function buildShellContext({ title, description, canonical, ogType, bodyClass, currentPath }) {
  const site = CONFIG.site;
  const year = new Date().getFullYear();
  return {
    lang: site.lang,
    base: site.base,
    htmlClass: '',
    title,
    description,
    canonical,
    ogType: ogType || 'website',
    themeColor: site.themeColor,
    siteTitle: site.title,
    tagline: site.tagline,
    author: site.author,
    year: String(year),
    // 产物指纹：每次构建都不一样，让浏览器不会继续用缓存里的旧 CSS/JS
    buildHash: BUILD_HASH,
    // 页脚那句话留空时就整段不输出，避免页脚多出一条空白
    footerCopy: (site.footerText || site.description || site.tagline)
      ? `<p class="footer-copy">${escapeHtml(site.footerText || site.description || site.tagline)}</p>`
      : '',
    copyright: CONFIG.feed.copyright,
    buildNote: '由 Node.js 静态生成',
    bodyClass: bodyClass || '',
    nav: renderNav(site, currentPath),
    footerLinks: renderFooterLinks(site),
    head: renderHead(),
  };
}

function renderShell(context, contentHtml) {
  return renderTemplate(TEMPLATES.shell, Object.assign({}, context, { content: contentHtml }));
}

function renderPagination(pagination, site) {
  if (!pagination || pagination.totalPages <= 1) return '';

  const pageUrl = (page) => joinUrl(site.base, `page/${page}/`);
  const parts = [];

  parts.push(
    pagination.current > 1
      ? `<a class="btn" href="${escapeHtml(pageUrl(pagination.current - 1))}" rel="prev">上一页</a>`
      : '<span class="btn" aria-disabled="true">上一页</span>'
  );

  const numbers = new Set([
    1,
    pagination.totalPages,
    pagination.current,
    pagination.current - 1,
    pagination.current + 1,
  ]);
  const sorted = Array.from(numbers)
    .filter((page) => page >= 1 && page <= pagination.totalPages)
    .sort((a, b) => a - b);

  let previous = 0;
  for (const page of sorted) {
    if (page - previous > 1) parts.push('<span class="pagination-gap">…</span>');
    previous = page;
    parts.push(
      page === pagination.current
        ? `<span class="btn pagination-current" aria-current="page">${page}</span>`
        : `<a class="btn" href="${escapeHtml(pageUrl(page))}">${page}</a>`
    );
  }

  parts.push(
    pagination.current < pagination.totalPages
      ? `<a class="btn" href="${escapeHtml(pageUrl(pagination.current + 1))}" rel="next">下一页</a>`
      : '<span class="btn" aria-disabled="true">下一页</span>'
  );

  return `<nav class="pagination" aria-label="分页">${parts.join('')}</nav>`;
}

function renderPostCards(posts, site) {
  if (!posts.length) {
    return `<li class="post-card"><p class="post-card-excerpt">这里还没有文章。往 <code>src/posts/</code> 里放一个 <code>.md</code> 文件，然后重新构建即可。</p></li>`;
  }

  return posts
    .map((post) => {
      const category = post.category
        ? `<a class="chip chip-category" href="${escapeHtml(categoryUrl(post.category))}">${escapeHtml(
            post.category
          )}</a>`
        : '';

      const pinned = post.pinned ? '<span class="pin-badge">置顶</span>' : '';

      return [
        `<li class="post-card${post.pinned ? ' post-card-pinned' : ''}">`,
        '  <div class="post-card-head">',
        `    <time datetime="${escapeHtml(post.date)}">${escapeHtml(post.dateText)}</time>`,
        `    ${category}`,
        `    ${pinned}`,
        '  </div>',
        `  <h3 class="post-card-title"><a href="${escapeHtml(post.url)}">${escapeHtml(post.title)}</a></h3>`,
        post.excerpt ? `  <p class="post-card-excerpt">${escapeHtml(post.excerpt)}</p>` : '',
        '</li>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
}

function renderArchive(posts) {
  const byYear = new Map();
  for (const post of posts) {
    const year = post.date.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(post);
  }

  const years = Array.from(byYear.keys()).sort((a, b) => b.localeCompare(a));

  return `<div class="archive">${years
    .map((year) => {
      const items = byYear.get(year);
      const rows = items
        .map((post) =>
          [
            '<li class="archive-item">',
            `  <span class="archive-date">${escapeHtml(post.date.slice(5))}</span>`,
            `  <a class="archive-link" href="${escapeHtml(post.url)}">${escapeHtml(post.title)}</a>`,
            post.category ? `  <span class="archive-cat">${escapeHtml(post.category)}</span>` : '',
            '</li>',
          ]
            .filter(Boolean)
            .join('\n')
        )
        .join('\n');

      return [
        '<section class="archive-year-group">',
        `  <h2 class="archive-year">${escapeHtml(year)}<span class="archive-year-count">${items.length} 篇</span></h2>`,
        `  <ul class="archive-list">${rows}</ul>`,
        '</section>',
      ].join('\n');
    })
    .join('\n')}</div>`;
}

function renderToc(headings) {
  const min = CONFIG.markdown.tocMin;
  const max = CONFIG.markdown.tocMax;
  const filtered = headings.filter((heading) => heading.level >= min && heading.level <= max);
  if (filtered.length < 2) return '';

  const items = filtered
    .map(
      (heading) =>
        `<li class="toc-item toc-item-l${heading.level}"><a class="toc-link" href="#${escapeHtml(
          heading.id
        )}">${escapeHtml(heading.title)}</a></li>`
    )
    .join('\n');

  return [
    '<nav class="toc" data-toc aria-label="文章目录">',
    '  <p class="toc-title">目录</p>',
    `  <ul class="toc-list">${items}</ul>`,
    '</nav>',
  ].join('\n');
}

function renderPostNav(previous, next) {
  const cell = (post, kind) => {
    const label = kind === 'next' ? '下一篇' : '上一篇';
    const cls = `post-nav-item${kind === 'next' ? ' is-next' : ''}`;
    if (!post) {
      return `<span class="${cls} is-empty"><span class="post-nav-label">${label}</span><span class="post-nav-title">没有更多了</span></span>`;
    }
    return `<a class="${cls}" href="${escapeHtml(post.url)}"><span class="post-nav-label">${label}</span><span class="post-nav-title">${escapeHtml(
      post.title
    )}</span></a>`;
  };

  return `<nav class="post-nav" aria-label="相邻文章">${cell(previous, 'previous')}${cell(next, 'next')}</nav>`;
}

function slugify(value, fallback) {
  const slug = String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '-')
    .replace(/[^\p{L}\p{N}\-_]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

/* --------------------------------------------------------------------------
   分类的目录名
   --------------------------------------------------------------------------
   中文分类直接当目录名也能用（浏览器会做 URL 转义），但地址栏里会变成
   一长串 %E9%9A%8F%E7%AC%94，不好看也不好分享。所以这里做一次转换：

   1. 常见的汉字查下面这张小表，转成拼音：随笔 → suibi
   2. 表里没有的汉字，用一个短的稳定散列兜底：冷门词 → c1a2b3
   3. 混排的情况逐个字符处理：前端 CSS → qianduan-css

   这张表故意做得很小，只覆盖博客里最常出现的词。查不到也不会出错，
   只是英文目录名变成散列而已，中文标题照常显示。
   -------------------------------------------------------------------------- */

const PINYIN = {
  生: 'sheng', 活: 'huo', 思: 'si', 考: 'kao', 随: 'sui', 笔: 'bi', 记: 'ji',
  技: 'ji', 术: 'shu', 前: 'qian', 端: 'duan', 后: 'hou', 设: 'she', 计: 'ji',
  阅: 'yue', 读: 'du', 书: 'shu', 清: 'qing', 单: 'dan', 公: 'gong', 告: 'gao',
  博: 'bo', 客: 'ke', 开: 'kai', 始: 'shi', 日: 'ri', 常: 'chang', 工: 'gong',
  具: 'ju', 学: 'xue', 习: 'xi', 杂: 'za', 谈: 'tan', 想: 'xiang', 法: 'fa',
  观: 'guan', 点: 'dian', 事: 'shi', 物: 'wu', 风: 'feng', 格: 'ge', 编: 'bian',
  程: 'cheng', 代: 'dai', 码: 'ma', 网: 'wang', 络: 'luo', 安: 'an', 全: 'quan',
  数: 'shu', 据: 'ju', 库: 'ku', 算: 'suan', 结: 'jie', 构: 'gou', 语: 'yu',
  言: 'yan', 框: 'kuang', 架: 'jia', 模: 'mo', 式: 'shi', 重: 'zhong', 测: 'ce',
  试: 'shi', 部: 'bu', 署: 'shu', 运: 'yun', 维: 'wei', 性: 'xing', 能: 'neng',
  优: 'you', 化: 'hua', 经: 'jing', 验: 'yan', 总: 'zong', 回: 'hui', 顾: 'gu',
  划: 'hua', 目: 'mu', 标: 'biao', 惯: 'guan', 时: 'shi', 间: 'jian', 管: 'guan',
  理: 'li', 效: 'xiao', 率: 'lv', 写: 'xie', 作: 'zuo', 翻: 'fan', 译: 'yi',
  英: 'ying', 文: 'wen', 中: 'zhong', 字: 'zi', 体: 'ti', 排: 'pai', 版: 'ban',
  视: 'shi', 觉: 'jue', 媒: 'mei', 影: 'ying', 音: 'yin', 乐: 'yue', 摄: 'she',
  游: 'you', 戏: 'xi', 动: 'dong', 漫: 'man', 电: 'dian', 剧: 'ju', 历: 'li',
  史: 'shi', 哲: 'zhe', 科: 'ke', 幻: 'huan', 普: 'pu', 健: 'jian', 康: 'kang',
  旅: 'lv', 行: 'xing', 美: 'mei', 食: 'shi', 家: 'jia', 庭: 'ting', 朋: 'peng',
  友: 'you', 情: 'qing', 感: 'gan', 成: 'cheng', 长: 'zhang', 职: 'zhi', 业: 'ye',
  校: 'xiao', 园: 'yuan', 童: 'tong', 年: 'nian', 忆: 'yi', 怀: 'huai', 旧: 'jiu',
  未: 'wei', 来: 'lai', 页: 'ye', 站: 'zhan', 静: 'jing', 态: 'tai', 样: 'yang',
  速: 'su', 度: 'du', 缓: 'huan', 存: 'cun', 浏: 'liu', 览: 'lan', 器: 'qi',
  兼: 'jian', 容: 'rong', 无: 'wu', 障: 'zhang', 碍: 'ai', 深: 'shen', 色: 'se',
  浅: 'qian', 主: 'zhu', 题: 'ti', 机: 'ji', 适: 'shi', 配: 'pei', 布: 'bu',
  局: 'ju', 响: 'xiang', 应: 'ying', 画: 'hua', 交: 'jiao', 互: 'hu', 表: 'biao',
  验: 'yan', 证: 'zheng', 入: 'ru', 门: 'men', 教: 'jiao', 档: 'dang', 说: 'shuo',
  明: 'ming', 参: 'can', 资: 'zi', 源: 'yuan', 收: 'shou', 藏: 'cang', 推: 'tui',
  荐: 'jian', 分: 'fen', 享: 'xiang', 评: 'ping', 论: 'lun', 摘: 'zhai', 录: 'lu',
  句: 'ju', 子: 'zi', 段: 'duan', 落: 'luo', 章: 'zhang', 节: 'jie', 签: 'qian',
  索: 'suo', 引: 'yin', 搜: 'sou', 寻: 'xun', 找: 'zhao', 序: 'xu', 归: 'gui',
  查: 'cha', 手: 'shou', 册: 'ce', 大: 'da', 小: 'xiao', 快: 'kuai', 慢: 'man',
  原: 'yuan', 创: 'chuang', 转: 'zhuan', 载: 'zai', 权: 'quan', 隐: 'yin',
  私: 'si', 密: 'mi', 令: 'ling', 牌: 'pai',
};

/** 稳定的短散列：同一个字永远得到同一个后缀 */
function shortHash(text) {
  let hash = 0;
  const value = String(text);
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).slice(-5).padStart(3, '0');
}

function taxonomySlug(name) {
  const value = String(name == null ? '' : name).trim();
  if (!value) return 'item';

  let out = '';
  for (const char of value) {
    if (/[A-Za-z0-9]/.test(char)) {
      out += char.toLowerCase();
    } else if (/[-\s_/]/.test(char)) {
      out += '-';
    } else if (PINYIN[char]) {
      out += PINYIN[char];
    } else if (/[\u4e00-\u9fa5]/.test(char)) {
      out += shortHash(char);
    }
    // 其它符号（标点、表情等）直接丢掉
  }

  return (
    out
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || `item-${shortHash(value)}`
  );
}

/** 为所有分类生成唯一的目录名，返回「分类名 → 目录名」的映射 */
function makeCategorySlugs(posts) {
  const map = new Map();
  const used = new Set();

  for (const post of posts) {
    const name = post.category;
    if (!name || map.has(name)) continue;

    const base = taxonomySlug(name);
    let slug = base;
    let n = 2;
    while (used.has(slug)) {
      slug = `${base}-${n}`;
      n += 1;
    }
    used.add(slug);
    map.set(name, slug);
  }

  return map;
}

function categoryUrl(name) {
  return joinUrl(CONFIG.site.base, `categories/${CATEGORY_SLUGS.get(name) || taxonomySlug(name)}/`);
}

/* ==========================================================================
   扫描文章与独立页面
   ========================================================================== */

async function buildPosts() {
  const files = await listFiles(POSTS_DIR, (file) => file.endsWith('.md'));
  const posts = [];
  const warnings = [];
  const usedSlugs = new Set();

  for (const file of files.sort()) {
    const relative = posixify(path.relative(SRC_DIR, file));
    const stat = await fsp.stat(file);
    const source = await fsp.readFile(file, 'utf8');
    const { data, content } = parseFrontMatter(source);

    if (data.draft === true && !OPTIONS.drafts) continue;

    const fileName = path.basename(file, '.md');
    let slug = slugify(String(data.slug || fileName).replace(/^\d{4}-\d{2}-\d{2}-/, ''), '');

    if (!slug) {
      slug = `post-${posts.length + 1}`;
      warnings.push(`${relative}: 文件名推不出可用的 slug，已改用 ${slug}`);
    }
    if (usedSlugs.has(slug)) {
      let n = 2;
      let candidate = `${slug}-${n}`;
      while (usedSlugs.has(candidate)) {
        n += 1;
        candidate = `${slug}-${n}`;
      }
      warnings.push(`${relative}: slug「${slug}」和别的文章重复，已改用「${candidate}」`);
      slug = candidate;
    }
    usedSlugs.add(slug);

    const date = resolveDate(data, fileName, stat.mtime.toISOString().slice(0, 10));
    const rendered = renderMarkdown(content);

    posts.push({
      slug,
      file: relative,
      title: String(data.title || fileName.replace(/^\d{4}-\d{2}-\d{2}-/, '')).trim(),
      date,
      dateText: formatDateText(date),
      updated: stat.mtime.toISOString().slice(0, 10),
      category: data.category ? String(data.category).trim() : '',
      wordCount: rendered.plainText.length,
      excerpt:
        String(data.excerpt || '').trim() || truncate(stripMarkdownInline(rendered.plainText), 110),
      pinned: data.pinned === true,
      url: joinUrl(CONFIG.site.base, `posts/${slug}/`),
      outputPath: path.join('posts', slug, 'index.html'),
      html: rendered.html,
      headings: rendered.headings,
    });
  }

  // 列表排序：置顶优先，然后按日期从新到旧
  posts.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.title.localeCompare(b.title);
  });

  // 上一篇 / 下一篇按纯时间顺序（置顶不影响阅读顺序）
  const chronological = posts.slice().sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.title.localeCompare(b.title);
  });
  chronological.forEach((post, index) => {
    post.previous = index > 0 ? chronological[index - 1] : null; // 更早的一篇
    post.next = index < chronological.length - 1 ? chronological[index + 1] : null; // 更新的一篇
  });

  return { posts, warnings };
}

async function buildPages() {
  const files = await listFiles(PAGES_DIR, (file) => file.endsWith('.md'));
  const pages = [];

  for (const file of files.sort()) {
    const stat = await fsp.stat(file);
    const source = await fsp.readFile(file, 'utf8');
    const { data, content } = parseFrontMatter(source);

    if (data.draft === true && !OPTIONS.drafts) continue;

    const fileName = path.basename(file, '.md');
    const slug = slugify(data.slug || fileName, fileName);
    const rendered = renderMarkdown(content);

    pages.push({
      slug,
      file: posixify(path.relative(SRC_DIR, file)),
      title: String(data.title || fileName).trim(),
      date: resolveDate(data, fileName, stat.mtime.toISOString().slice(0, 10)),
      excerpt:
        String(data.excerpt || '').trim() || truncate(stripMarkdownInline(rendered.plainText), 110),
      html: rendered.html,
      url: joinUrl(CONFIG.site.base, `${slug}/`),
      outputPath: path.join(slug, 'index.html'),
      updated: stat.mtime.toISOString().slice(0, 10),
    });
  }

  return pages;
}

/* ==========================================================================
   写文件
   ========================================================================== */

const writtenFiles = [];

async function emit(outputPath, html) {
  await writeFile(path.join(OUT_DIR, outputPath), html);
  writtenFiles.push(outputPath);
}

function paginate(items, perPage) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const pages = [];
  for (let page = 1; page <= totalPages; page += 1) {
    pages.push(items.slice((page - 1) * perPage, page * perPage));
  }
  return pages;
}

/* ==========================================================================
   页面生成
   ========================================================================== */

async function generateHome(posts) {
  const site = CONFIG.site;
  const pinned = posts.filter((post) => post.pinned);
  const rest = posts.filter((post) => !post.pinned);
  const chunks = paginate(rest, site.postsPerPage);

  for (let index = 0; index < chunks.length; index += 1) {
    const pageNumber = index + 1;
    const isFirst = pageNumber === 1;
    const title = isFirst
      ? [site.title, site.tagline].filter(Boolean).join(TITLE_SEP)
      : `第 ${pageNumber} 页${TITLE_SEP}${site.title}`;
    const currentPath = isFirst ? '/' : `/page/${pageNumber}/`;
    const canonical = isFirst ? absoluteUrl('') : absoluteUrl(`page/${pageNumber}`);

    const context = buildShellContext({
      title,
      description: site.summary,
      canonical,
      ogType: 'website',
      bodyClass: 'is-home',
      currentPath,
    });

    const content = renderTemplate(TEMPLATES.index, {
      siteTitle: site.title,
      // 简介和 tagline 留空时就不要输出空标签，否则会多出一段空隙
      tagline: site.tagline ? `<p class="hero-tagline">${escapeHtml(site.tagline)}</p>` : '',
      description: site.description ? `<p class="hero-desc">${escapeHtml(site.description)}</p>` : '',
      postCount: String(posts.length),
      lastUpdated: posts.length ? posts[0].dateText : '—',
      pinned: isFirst ? renderPostCards(pinned, site) : '',
      listTitle: isFirst ? '最新文章' : `第 ${pageNumber} 页`,
      listNote: isFirst
        ? `共 ${posts.length} 篇 · 每页 ${site.postsPerPage} 篇`
        : `第 ${pageNumber} / ${chunks.length} 页`,
      list: renderPostCards(chunks[index], site),
      pagination: renderPagination({ current: pageNumber, totalPages: chunks.length }, site),
    });

    const html = renderShell(context, content);
    await emit(isFirst ? 'index.html' : path.join('page', String(pageNumber), 'index.html'), html);

    // /page/1/ 也写一份，避免有人手动拼这个地址时 404
    if (isFirst) await emit(path.join('page', '1', 'index.html'), html);
  }
}

async function generatePostPages(posts) {
  const site = CONFIG.site;

  for (const post of posts) {
    const canonical = absoluteUrl(`posts/${post.slug}`);

    const context = buildShellContext({
      title: `${post.title}${TITLE_SEP}${site.title}`,
      description: post.excerpt,
      canonical,
      ogType: 'article',
      bodyClass: 'is-post',
      currentPath: outputPathToSitePath(post.outputPath),
    });

    const metaExtra = [
      post.category
        ? `<span class="meta-item">分类：<a href="${escapeHtml(categoryUrl(post.category))}">${escapeHtml(
            post.category
          )}</a></span>`
        : '',
      `<span class="meta-item">${post.wordCount} 字</span>`,
    ]
      .filter(Boolean)
      .join('');

    const crumbCategory = post.category
      ? `<a href="${escapeHtml(categoryUrl(post.category))}">${escapeHtml(post.category)}</a>`
      : '<span>文章</span>';

    const content = renderTemplate(TEMPLATES.post, {
      base: site.base,
      postTitle: post.title,
      dateISO: post.date,
      dateText: post.dateText,
      metaExtra,
      crumbCategory,
      article: post.html,
      toc: renderToc(post.headings),
      postNav: renderPostNav(post.previous, post.next),
    });

    await emit(post.outputPath, renderShell(context, content));
  }
}

async function generateArchive(posts) {
  const site = CONFIG.site;
  const content = renderTemplate(TEMPLATES.list, {
    eyebrow: 'Archive',
    pageTitle: '归档',
    pageDesc: `按年份列出全部 ${posts.length} 篇文章。`,
    filters: '',
    archive: renderArchive(posts),
    list: '',
    pagination: '',
  });

  await emit(
    path.join('archive', 'index.html'),
    renderShell(
      buildShellContext({
        title: `归档${TITLE_SEP}${site.title}`,
        description: `按年份浏览 ${site.title} 的全部文章。`,
        canonical: absoluteUrl('archive'),
        bodyClass: 'is-list',
        currentPath: '/archive/',
      }),
      content
    )
  );
}

async function generateCategories(posts) {
  const site = CONFIG.site;

  // 按分类归组
  const categories = new Map();
  for (const post of posts) {
    if (!post.category) continue;
    if (!categories.has(post.category)) categories.set(post.category, []);
    categories.get(post.category).push(post);
  }

  const sortNames = (a, b) => a.localeCompare(b, 'zh-Hans-CN');

  const categoryCloud = Array.from(categories.keys())
    .sort(sortNames)
    .map(
      (category) =>
        `<li><a class="chip chip-category" href="${escapeHtml(categoryUrl(category))}">${escapeHtml(
          category
        )}<span class="chip-count">${categories.get(category).length}</span></a></li>`
    )
    .join('\n');

  // 分类总览页 /categories/
  const overview = renderTemplate(TEMPLATES.list, {
    eyebrow: 'Categories',
    pageTitle: '分类',
    pageDesc: `共 ${categories.size} 个分类，${posts.length} 篇文章。`,
    filters: categoryCloud
      ? `<div class="filters"><span class="filters-label">全部分类</span><ul class="chip-row">${categoryCloud}</ul></div>`
      : '',
    archive: '',
    list: '<p class="empty-note">还没有带分类的文章。</p>',
    pagination: '',
  });

  await emit(
    path.join('categories', 'index.html'),
    renderShell(
      buildShellContext({
        title: `分类${TITLE_SEP}${site.title}`,
        description: `${site.title}的全部文章分类。`,
        canonical: absoluteUrl('categories'),
        bodyClass: 'is-list',
        currentPath: '/categories/',
      }),
      overview
    )
  );

  // 每个分类一页
  for (const [category, list] of categories) {
    const slug = CATEGORY_SLUGS.get(category) || taxonomySlug(category);
    const content = renderTemplate(TEMPLATES.list, {
      eyebrow: 'Category',
      pageTitle: category,
      pageDesc: `共 ${list.length} 篇文章。`,
      filters: `<div class="filters"><a class="btn" href="${escapeHtml(
        joinUrl(site.base, 'categories/')
      )}">← 全部分类</a></div>`,
      archive: '',
      list: `<ul class="post-list">${renderPostCards(list, site)}</ul>`,
      pagination: '',
    });

    await emit(
      path.join('categories', slug, 'index.html'),
      renderShell(
        buildShellContext({
          title: `${category}${TITLE_SEP}${site.title}`,
          description: `分类 ${category} 下的全部文章。`,
          canonical: absoluteUrl(`categories/${slug}`),
          bodyClass: 'is-list',
          currentPath: `/categories/${slug}/`,
        }),
        content
      )
    );
  }
}

async function generateStandalonePages(pages) {
  const site = CONFIG.site;

  for (const page of pages) {
    const content = renderTemplate(TEMPLATES.page, {
      base: site.base,
      pageTitle: page.title,
      article: page.html,
    });

    await emit(
      page.outputPath,
      renderShell(
        buildShellContext({
          title: `${page.title}${TITLE_SEP}${site.title}`,
          description: page.excerpt,
          canonical: absoluteUrl(page.slug),
          bodyClass: 'is-page',
          currentPath: `/${page.slug}/`,
        }),
        content
      )
    );
  }
}

async function generate404() {
  const site = CONFIG.site;
  // 404.html 会被 GitHub Pages 用在任意层级，所以里面的链接必须是绝对的，
  // 而且要考虑部署子目录（/仓库名/）。base 由这里单独注入。
  const content = renderTemplate(TEMPLATES['404'], { base: site.base });
  await emit(
    '404.html',
    renderShell(
      buildShellContext({
        title: `页面不存在${TITLE_SEP}${site.title}`,
        description: '这个地址没有对应的页面。',
        canonical: absoluteUrl('404.html'),
        bodyClass: 'is-404',
        currentPath: '',
      }),
      content
    )
  );
}

/* ==========================================================================
   资源与索引文件
   ========================================================================== */

async function generateStaticAssets() {
  const site = CONFIG.site;

  // ---- 样式：按文件名顺序拼成一个文件，减少请求 ----
  const styleFiles = (await listFiles(STYLES_DIR, (file) => file.endsWith('.css'))).sort();
  const styleParts = [];
  for (const file of styleFiles) {
    // 去掉 BOM：拼接之后它就不再是文件开头了，而 CSS 中间出现 U+FEFF 是无效字符。
    // （用带 BOM 的编辑器存过 CSS 的话，这一步能救回来。）
    const text = stripBom(await fsp.readFile(file, 'utf8'));
    styleParts.push(`/* ===== ${posixify(path.relative(SRC_DIR, file))} ===== */\n${text}`);
  }
  if (!styleParts.length) throw new Error('src/styles/ 里没有找到任何 CSS 文件。');
  await writeFile(path.join(OUT_DIR, 'assets', 'style.css'), styleParts.join('\n\n'));

  // ---- 脚本：逐个复制（theme-init.js 会被内联进 <head>，单独跳过）----
  const scriptFiles = await listFiles(SCRIPTS_DIR, (file) => file.endsWith('.js'));
  for (const file of scriptFiles) {
    const relative = posixify(path.relative(SCRIPTS_DIR, file));
    if (relative === 'theme-init.js') continue;
    await writeFile(
      path.join(OUT_DIR, 'assets', 'scripts', relative),
      stripBom(await fsp.readFile(file, 'utf8'))
    );
  }

  // ---- 用户自己的图片等素材 ----
  const assetCount = await copyDir(ASSETS_DIR, path.join(OUT_DIR, 'assets'));

  // ---- 设计预览页（可选）：src/preview.html 存在时就原样发布到 /preview.html ----
  // 它用真实的 style.css 把所有组件摆在一起，方便一眼检查整体风格。
  // 不想要就在 src/ 里删掉那个文件。
  const previewFile = path.join(SRC_DIR, 'preview.html');
  if (await exists(previewFile)) {
    await writeFile(path.join(OUT_DIR, 'preview.html'), await fsp.readFile(previewFile));
  }

  // ---- favicon ----
  const userFavicon = path.join(ASSETS_DIR, 'favicon.svg');
  const favicon = (await exists(userFavicon)) ? await fsp.readFile(userFavicon) : FAVICON_SVG;
  await writeFile(path.join(OUT_DIR, 'favicon.svg'), favicon);

  // ---- Web App Manifest（成本很低，顺手加上）----
  await writeFile(
    path.join(OUT_DIR, 'site.webmanifest'),
    JSON.stringify(
      {
        name: site.title,
        short_name: site.title,
        description: site.summary,
        start_url: site.base,
        display: 'standalone',
        background_color: '#dfebf3',
        theme_color: site.themeColor,
        icons: [{ src: `${site.base}favicon.svg`, sizes: 'any', type: 'image/svg+xml' }],
      },
      null,
      2
    ) + '\n'
  );

  return assetCount;
}

function escapeXml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function generateFeed(posts) {
  const site = CONFIG.site;
  const items = posts.slice(0, CONFIG.feed.limit);
  const feedUrl = absoluteUrl('feed.xml');
  const siteUrl = absoluteUrl('');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(site.title)}</title>`,
    `    <link>${escapeXml(siteUrl)}</link>`,
    `    <description>${escapeXml(site.summary)}</description>`,
    `    <language>${escapeXml(site.lang)}</language>`,
    '    <generator>tools/build.js</generator>',
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    ...items.map((post) => {
      const link = absoluteUrl(`posts/${post.slug}`);
      return [
        '    <item>',
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate>`,
        `      <description>${escapeXml(post.excerpt)}</description>`,
        '    </item>',
      ].join('\n');
    }),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');

  await writeFile(path.join(OUT_DIR, 'feed.xml'), xml);
  return items.length;
}

async function generateSitemap(posts, pages) {
  const urls = [];

  const add = (relative, lastmod) => {
    urls.push({ url: absoluteUrl(relative), lastmod });
  };

  const newest = posts.length ? posts[0].updated : new Date().toISOString().slice(0, 10);

  add('', newest);
  add('archive', newest);
  add('categories', newest);

  for (const post of posts) add(`posts/${post.slug}`, post.updated);
  for (const page of pages) add(page.slug, page.updated);
  for (const post of posts) {
    if (post.category) add(`categories/${CATEGORY_SLUGS.get(post.category)}`, null);
  }

  const seen = new Set();
  const rows = urls
    .filter((entry) => {
      if (seen.has(entry.url)) return false;
      seen.add(entry.url);
      return true;
    })
    .map((entry) =>
      [
        '  <url>',
        `    <loc>${escapeXml(entry.url)}</loc>`,
        entry.lastmod ? `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>` : '',
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    rows,
    '</urlset>',
    '',
  ].join('\n');

  await writeFile(path.join(OUT_DIR, 'sitemap.xml'), xml);
  return seen.size;
}

async function generateRobots() {
  const site = CONFIG.site;
  const lines = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${absoluteUrl('sitemap.xml')}`,
    '',
  ];
  await writeFile(path.join(OUT_DIR, 'robots.txt'), lines.join('\n'));
}

/* ==========================================================================
   内置资源
   ========================================================================== */

/* 默认的站点图标：一幅像素风景 —— 蓝天在上，绿草在下，地平线上有一颗太阳。
   想换成自己的图标，把 favicon.svg 放进 src/assets/ 就会覆盖它。 */
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="site icon">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a9d4f5"/>
      <stop offset="1" stop-color="#4b8ad6"/>
    </linearGradient>
    <linearGradient id="land" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a3dd6a"/>
      <stop offset="0.5" stop-color="#6cba36"/>
      <stop offset="1" stop-color="#3f8420"/>
    </linearGradient>
  </defs>

  <!-- 圆角外框 -->
  <rect x="3" y="4" width="58" height="56" rx="7" fill="url(#sky)" stroke="#1d4d92" stroke-width="2"/>

  <!-- 太阳 -->
  <circle cx="45" cy="19" r="7" fill="#fff3c4" opacity="0.95"/>

  <!-- 一朵像素云 -->
  <g fill="#ffffff" opacity="0.8">
    <rect x="13" y="15" width="16" height="5" rx="2.5"/>
    <rect x="17" y="11" width="9" height="5" rx="2.5"/>
  </g>

  <!-- 地平线 -->
  <rect x="4" y="38" width="56" height="2" fill="#ffffff" opacity="0.45"/>

  <!-- 草地 -->
  <path d="M3 40 H61 V53 A7 7 0 0 1 54 60 H10 A7 7 0 0 1 3 53 Z" fill="url(#land)"/>

  <!-- 远处的斜坡，让地平线不那么直 -->
  <path d="M34 40 Q44 31 61 36 V42 H34 Z" fill="#7cc247"/>
</svg>
`;

/* ==========================================================================
   全局状态
   ========================================================================== */

let CONFIG = null;
let TEMPLATES = {};
let OUT_DIR = DEFAULT_OUT_DIR;
let THEME_INIT_SCRIPT = '';
let CATEGORY_SLUGS = new Map();
/** 每次构建都不同的短指纹，用来给 CSS/JS 加 ?v= 参数，绕开浏览器缓存 */
const BUILD_HASH = Date.now().toString(36);

/* ==========================================================================
   主流程
   ========================================================================== */

async function cleanOutput() {
  await fsp.rm(OUT_DIR, { recursive: true, force: true });
  await fsp.mkdir(OUT_DIR, { recursive: true });
}

async function main() {
  const started = Date.now();

  if (OPTIONS.out) OUT_DIR = path.resolve(ROOT, OPTIONS.out);

  CONFIG = await loadConfig();
  TEMPLATES = await loadTemplates();

  const themeInitPath = path.join(SCRIPTS_DIR, 'theme-init.js');
  THEME_INIT_SCRIPT = (await exists(themeInitPath))
    ? (await fsp.readFile(themeInitPath, 'utf8'))
        .trim()
        .replace('__BLOG_DEFAULT_THEME__', JSON.stringify(CONFIG.theme.default))
    : '';

  await cleanOutput();

  const { posts, warnings } = await buildPosts();
  const pages = await buildPages();
  CATEGORY_SLUGS = makeCategorySlugs(posts);

  await generateStaticAssets();
  await generateHome(posts);
  await generatePostPages(posts);
  await generateArchive(posts);
  await generateCategories(posts);
  await generateStandalonePages(pages);
  await generate404();
  const feedCount = await generateFeed(posts);
  const sitemapCount = await generateSitemap(posts, pages);
  await generateRobots();

  // 告诉 GitHub Pages 不要用 Jekyll 处理这些文件
  await writeFile(path.join(OUT_DIR, '.nojekyll'), '');

  const elapsed = Date.now() - started;

  if (!OPTIONS.quiet) {
    const line = '─'.repeat(54);
    console.log(line);
    console.log(`  构建完成：${writtenFiles.length} 个页面，用时 ${elapsed} ms`);
    console.log(`  文章 ${posts.length} 篇 · 独立页面 ${pages.length} 个 · RSS ${feedCount} 条 · Sitemap ${sitemapCount} 条`);
    console.log(`  站点地址：${CONFIG.site.url}${CONFIG.site.base}`);
    console.log(`  输出目录：${posixify(path.relative(ROOT, OUT_DIR)) || '.'}`);
    if (OPTIONS.drafts) console.log('  注意：本次构建包含了 draft: true 的草稿。');
    console.log(line);
    if (warnings.length) {
      console.log('  提醒：');
      for (const warning of warnings) console.log(`   - ${warning}`);
      console.log(line);
    }
    if (CONFIG.site.url.includes('example.github.io') && !process.env.SITE_URL) {
      console.log('  提示：blog.config.json 里的 site.url 还是示例地址。');
      console.log('        换成你自己的域名后，RSS 和 sitemap 里的链接才会正确。');
      console.log(line);
    }
  }

  return { posts: posts.length, pages: writtenFiles.length };
}

main().catch((error) => {
  console.error('\n构建失败：\n');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
