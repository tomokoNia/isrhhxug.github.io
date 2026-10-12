#!/usr/bin/env node
'use strict';

/**
 * 只做静态文件服务的极简预览服务器（不监听文件变化、不重新构建）。
 *
 * 用途：构建完成之后想看一下最终产物，或者想在本地模拟 GitHub Pages
 *       的访问方式（包括 404 页面）。
 *
 * 用法：
 *   npm run serve                默认 http://127.0.0.1:4321
 *   npm run serve -- --port=8080
 *
 * 注意：GitHub Pages 的项目站点地址形如 https://用户名.github.io/仓库名/，
 *       如果你想在本地验证子路径部署，请先这样构建：
 *         npm run build -- --base=/仓库名/
 *       然后用 npm run serve 访问 http://127.0.0.1:4321/仓库名/
 */

const http = require('http');
const fsp = require('fs').promises;
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function parseArgs(argv) {
  const options = { port: 4321, host: '127.0.0.1' };
  for (const arg of argv) {
    if (arg.startsWith('--port=')) options.port = Number(arg.slice(7)) || options.port;
    else if (arg.startsWith('--host=')) options.host = arg.slice(7) || options.host;
  }
  return options;
}

const OPTIONS = parseArgs(process.argv.slice(2));

async function exists(target) {
  return fsp
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

async function resolveTarget(urlPath) {
  const clean = decodeURIComponent(String(urlPath).split('?')[0].split('#')[0]);
  const target = path.join(OUT_DIR, path.normalize(clean).replace(/^([/\\])+/, ''));
  if (!target.startsWith(OUT_DIR)) return null;

  if (await exists(target)) {
    const stat = await fsp.stat(target);
    if (stat.isDirectory()) {
      const index = path.join(target, 'index.html');
      return (await exists(index)) ? index : null;
    }
    return target;
  }

  if (!path.extname(target)) {
    const index = path.join(target, 'index.html');
    if (await exists(index)) return index;
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const file = await resolveTarget(req.url || '/');

  if (!file) {
    const custom404 = path.join(OUT_DIR, '404.html');
    if (await exists(custom404)) {
      const body = await fsp.readFile(custom404);
      res.writeHead(404, { 'Content-Type': MIME['.html'], 'Content-Length': body.length });
      res.end(body);
    } else {
      res.writeHead(404, { 'Content-Type': MIME['.txt'] });
      res.end('404 · docs/ 里找不到这个文件，是不是还没运行 npm run build？');
    }
    return;
  }

  const body = await fsp.readFile(file);
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': body.length,
  });
  res.end(body);
});

if (!require('fs').existsSync(path.join(OUT_DIR, 'index.html'))) {
  console.error('docs/index.html 不存在，请先运行：npm run build');
  process.exit(1);
}

server.listen(OPTIONS.port, OPTIONS.host, () => {
  console.log(`静态预览：http://${OPTIONS.host}:${OPTIONS.port}/  （按 Ctrl+C 停止）`);
});
