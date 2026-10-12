#!/usr/bin/env node
'use strict';

/**
 * 创建一篇新文章的骨架文件。
 *
 * 用法：
 *   npm run new -- "文章标题"
 *   npm run new -- "文章标题" --category=技术 --tags=前端,笔记
 *
 * 它会生成 src/posts/YYYY-MM-DD-slug.md 并填好元信息，
 * 然后你只要打开文件写正文就行。
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'src', 'posts');

function pad2(value) {
  return String(value).padStart(2, '0');
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function slugify(text) {
  const slug = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '-')
    .replace(/[^\p{L}\p{N}\-_]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'untitled';
}

async function main() {
  const args = process.argv.slice(2);
  const flags = {};
  const rest = [];

  for (const arg of args) {
    const match = arg.match(/^--([\w-]+)=(.*)$/);
    if (match) flags[match[1]] = match[2];
    else rest.push(arg);
  }

  const title = rest.join(' ').trim();
  if (!title) {
    console.error('用法：npm run new -- "文章标题" [--category=分类]');
    process.exit(1);
  }

  await fsp.mkdir(POSTS_DIR, { recursive: true });

  const date = flags.date || today();
  const slug = slugify(flags.slug || title);
  const fileName = `${date}-${slug}.md`;
  const target = path.join(POSTS_DIR, fileName);

  if (fs.existsSync(target)) {
    console.error(`文件已存在：${path.relative(ROOT, target)}`);
    process.exit(1);
  }

  const content = `---
title: ${title}
date: ${date}
category: ${flags.category || '随笔'}
excerpt: 在这里写一句话摘要，它会显示在首页列表里。
draft: true
pinned: false
---

# ${title}

从这里开始写正文。

## 第一个小节

正文……

写完之后，把上面的 \`draft: true\` 改成 \`draft: false\`，这篇文章才会被发布。
`;

  await fsp.writeFile(target, content, 'utf8');
  console.log(`已创建：${path.relative(ROOT, target)}`);
  console.log('提示：文件里的 draft 目前是 true（只有本地预览能看到），写完记得改成 false。');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
