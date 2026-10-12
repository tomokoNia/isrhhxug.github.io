'use strict';

/**
 * Markdown → HTML
 * ==========================================================================
 * 只用 markdown-it 及其两个官方插件：
 *   - markdown-it-anchor    给标题加 id 和 # 锚点
 *   - markdown-it-footnote  支持脚注
 *
 * 这里对外暴露一个 render()，额外返回：
 *   html      渲染结果
 *   headings  标题列表（构建目录用）
 *   plainText 纯文本（做搜索索引和自动摘要用）
 *
 * 代码高亮不在这里做：这里只输出
 *   <pre class="code-block" data-lang="js"><code>…</code></pre>
 * 由 tools/build.js 调用 highlighter 上色，职责更清楚。
 * ========================================================================== */

const MarkdownIt = require('markdown-it');

let anchor = null;
let footnote = null;
try {
  anchor = require('markdown-it-anchor');
} catch (error) {
  anchor = null; // 依赖缺失时降级：标题没有 # 锚点，但目录仍然可用
}
try {
  footnote = require('markdown-it-footnote');
} catch (error) {
  footnote = null;
}

const md = new MarkdownIt({
  html: true, // 允许正文里直接写 HTML
  linkify: true, // 纯文本 URL 自动变成链接
  typographer: false, // 中文排版用不上英文标点替换，保持原文
  breaks: false,
});

if (footnote) md.use(footnote);

/**
 * 把这次渲染的 token 流存进 env。
 *
 * 注意：markdown-it 的 env 参数默认是空的，它不会自动把 tokens 放进去，
 * 所以必须自己挂一个 core 规则。第一次写这个项目时就踩过这个坑。
 */
md.core.ruler.push('capture_tokens', (state) => {
  state.env.tokens = state.tokens;
  return true;
});

/** 会出现在 URL 里的 id：中文保留，空格转连字符 */
function slugify(text) {
  const slug = String(text == null ? '' : text)
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '-')
    .replace(/[^\p{L}\p{N}\-_]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
}

const usedIds = new Set();

if (anchor) {
  md.use(anchor, {
    slugify: (text) => {
      // 标题 id 由这里统一分配，保证全文不重复
      let id = slugify(text);
      let n = 2;
      while (usedIds.has(id)) {
        id = `${slugify(text)}-${n}`;
        n += 1;
      }
      usedIds.add(id);
      return id;
    },
    tabIndex: false,
    permalink: anchor.permalink.linkInsideHeader({
      symbol: '#',
      placement: 'after',
      class: 'heading-anchor',
      renderHref: (slug) => `#${slug}`,
      // 这个 # 只是鼠标用户的快捷方式：读屏软件可以按标题直接跳转，
      // 所以把它从无障碍树里隐藏，免得每个标题都念一遍"井号"。
      renderAttrs: () => ({ 'aria-hidden': 'true' }),
    }),
  });
} else {
  // 没有 anchor 插件时自己给标题加 id
  md.core.ruler.push('heading_ids', (state) => {
    for (let i = 0; i < state.tokens.length; i += 1) {
      const token = state.tokens[i];
      if (token.type !== 'heading_open') continue;
      const inline = state.tokens[i + 1];
      const title = inline && inline.type === 'inline' ? inline.content.trim() : '';
      let id = slugify(title);
      let n = 2;
      while (usedIds.has(id)) {
        id = `${slugify(title)}-${n}`;
        n += 1;
      }
      usedIds.add(id);
      token.attrSet('id', id);
    }
    return true;
  });
}

// 外链新窗口打开 + 安全属性
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  function linkOpen(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.link_open = function linkOpenRule(tokens, idx, options, env, self) {
  const token = tokens[idx];
  const hrefIndex = token.attrIndex('href');
  if (hrefIndex >= 0) {
    const href = String(token.attrs[hrefIndex][1] || '');
    if (/^https?:\/\//i.test(href)) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
    }
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// 代码块：<pre class="code-block" data-lang="…"><code>…</code></pre>
md.renderer.rules.fence = function fenceRule(tokens, idx) {
  const token = tokens[idx];
  const info = (token.info || '').trim();
  const language = info.split(/\s+/)[0].toLowerCase();
  const langAttr = language ? ` data-lang="${md.utils.escapeHtml(language)}"` : '';
  const code = md.utils.escapeHtml(token.content.replace(/\n+$/, ''));
  return `<pre class="code-block"${langAttr}><code>${code}</code></pre>\n`;
};

/** 收集标题，供目录使用 */
function collectHeadings(tokens) {
  const headings = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type !== 'heading_open') continue;

    const inline = tokens[i + 1] && tokens[i + 1].type === 'inline' ? tokens[i + 1] : null;
    const title = inline ? inline.content.replace(/\s*#\s*$/, '').trim() : '';
    const level = Number(token.tag.slice(1));

    // 收集时把 id 补上（anchor 插件已经加过了，这里只兜底）
    let id = token.attrGet('id') || '';
    if (!id) {
      const base = slugify(title || 'section');
      id = base;
      let n = 2;
      while (usedIds.has(id)) {
        id = `${base}-${n}`;
        n += 1;
      }
      usedIds.add(id);
      token.attrSet('id', id);
    }

    headings.push({
      level,
      id,
      title,
      titleHtml: inline ? md.renderInline(title) : '',
    });
  }

  return headings;
}

/** 从 token 流里抽取纯文本 */
function collectPlainText(tokens) {
  const parts = [];

  for (const token of tokens) {
    if (token.type === 'inline' && token.children) {
      for (const child of token.children) {
        if (child.type === 'text' || child.type === 'code_inline') parts.push(child.content);
        else if (child.type === 'softbreak' || child.type === 'hardbreak') parts.push(' ');
        else if (child.type === 'footnote_ref' || child.type === 'footnote_anchor') continue;
      }
      parts.push(' ');
    } else if (token.type === 'fence' || token.type === 'code_block') {
      // 代码块的内容一般不属于"正文"，搜索时不需要，这里跳过
      continue;
    }
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

module.exports = {
  slugify,

  /**
   * @param {string} source Markdown 正文
   * @returns {{ html: string, headings: Array, plainText: string }}
   */
  render(source) {
    const text = String(source == null ? '' : source);

    // 每次渲染前清空标题记录，避免不同的文章之间互相影响
    usedIds.clear();

    const env = {};
    const html = md.render(text, env);
    const tokens = Array.isArray(env.tokens) ? env.tokens : [];

    return {
      html,
      headings: collectHeadings(tokens),
      plainText: collectPlainText(tokens),
    };
  },
};
