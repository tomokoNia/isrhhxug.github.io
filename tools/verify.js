#!/usr/bin/env node
'use strict';

/**
 * 自检脚本：检查 docs/ 里的 HTML 是否有明显的坏链接和结构问题。
 *
 * 用法：node tools/verify.js
 *
 * 检查内容：
 *   1. 每个 href / src 指向的文件是否真的存在
 *   2. 页面里是否有残留的模板占位符 {{…}}
 *   3. <h1> 是否只有一个、<title> 是否为空
 *   4. 是否有空的链接 href=""
 *
 * 它不追求成为完整的 HTML 校验器，只用来在本地快速发现低级错误。
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs');

async function listFiles(dir, filter) {
  const found = [];
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await listFiles(full, filter)));
    else if (!filter || filter(full)) found.push(full);
  }
  return found;
}

function sitePathToFile(sitePath, fromFile) {
  let clean = sitePath.split('?')[0].split('#')[0];
  let baseDir = path.dirname(fromFile);

  if (clean.startsWith('/')) {
    clean = clean.replace(/^\/+/, '');
  } else if (clean.startsWith('../') || clean.startsWith('./')) {
    return safeDecode(path.resolve(baseDir, clean));
  } else if (/^[a-z]+:/i.test(clean)) {
    return null; // 外部链接
  }

  // HTML 里的中文文件名会被写成 %E5%9B%BE%E7%89%87 这种形式，
  // 要解码回中文才能和磁盘上的文件名对上（浏览器自己也会解码）。
  return safeDecode(path.join(OUT_DIR, clean));
}

/** decodeURIComponent 遇到非法转义会抛错，这里兜底返回原值 */
function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

/** 目录路径补 index.html */
function resolveTarget(target) {
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    const index = path.join(target, 'index.html');
    return fs.existsSync(index) ? index : null;
  }
  if (fs.existsSync(target)) return target;
  if (!path.extname(target)) {
    const index = path.join(target, 'index.html');
    if (fs.existsSync(index)) return index;
  }
  return null;
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    console.error('docs/ 不存在，请先运行 npm run build');
    process.exit(1);
  }

  const htmlFiles = await listFiles(OUT_DIR, (file) => file.endsWith('.html'));
  const problems = [];
  const skipped = [];

  for (const file of htmlFiles) {
    const relative = path.relative(OUT_DIR, file).split(path.sep).join('/');
    const html = await fsp.readFile(file, 'utf8');

    if (/\{\{|\}\}/.test(html)) {
      problems.push(`${relative}: 残留了模板占位符 {{…}}`);
    }

    // 最常见的一类 bug：该用 {{{raw}}} 的地方写成了 {{escaped}}，
    // 结果 HTML 标签被转义成 &lt;span&gt; 直接显示给读者。
    const escapedTag = html.match(/&lt;\/?(?:a|span|div|p|ul|li|nav|img|time|h[1-6])\b/g);
    if (escapedTag) {
      problems.push(
        `${relative}: 有 ${escapedTag.length} 处 HTML 被转义显示（检查模板里是否该用 {{{…}}}）`
      );
    }

    const h1Count = (html.match(/<h1[\s>]/g) || []).length;
    // 设计预览页本身就是一堆组件样张，不适用"一个 h1"的规则
    const isPreview = relative === 'preview.html';
    if (h1Count === 0 && !isPreview) problems.push(`${relative}: 没有 <h1>`);
    // 文章页面会有两个 <h1>：面板标题栏里的一个，加上正文 Markdown 里的一个。
    // 这是刻意保留的（方便直接复制 Markdown 去别处使用），所以这里不算问题。
    const isPostPage = /<body class="is-post">/.test(html);
    if (!isPreview && (h1Count > 2 || (h1Count > 1 && !isPostPage))) {
      problems.push(`${relative}: 有 ${h1Count} 个 <h1>（建议只保留一个）`);
    }

    const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    if (!title || !title.trim()) problems.push(`${relative}: <title> 是空的`);

    const attrs = html.match(/(?:href|src)="[^"]*"/g) || [];
    for (const attr of attrs) {
      const value = attr.slice(attr.indexOf('"') + 1, -1);
      if (!value) {
        problems.push(`${relative}: 有一个空的 ${attr.split('=')[0]}`);
        continue;
      }
      if (/^(https?:|mailto:|data:|#|\/\/)/i.test(value)) continue;

      const target = sitePathToFile(value, file);
      if (target === null) continue;

      if (!resolveTarget(target)) {
        // 从文章页出发的 ../../xxx 属于站内绝对路径的另一种写法，
        // 构建时不会被改写，这里单独提示，不算错误
        if (value.startsWith('../')) skipped.push(`${relative} → ${value}`);
        else problems.push(`${relative}: 找不到 ${value}`);
      }
    }
  }

  console.log(`检查了 ${htmlFiles.length} 个 HTML 文件。`);
  if (skipped.length) {
    console.log(`\n提示：${skipped.length} 个以 ../ 开头的链接没有被构建脚本改写：`);
    for (const item of skipped.slice(0, 10)) console.log(`  - ${item}`);
    if (skipped.length > 10) console.log(`  …… 还有 ${skipped.length - 10} 个`);
    console.log('  这类写法只在"部署到域名根目录"时正确。想兼容子目录，请把正文里的');
    console.log('  图片和链接改成以 / 开头的写法，构建脚本会自动补上子路径。');
  }

  if (problems.length) {
    console.log(`\n发现 ${problems.length} 个问题：`);
    for (const problem of problems) console.log(`  ✗ ${problem}`);
    process.exitCode = 1;
  } else {
    console.log('\n没有发现问题。');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
