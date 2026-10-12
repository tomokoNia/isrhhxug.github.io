#!/usr/bin/env node
'use strict';

/**
 * 本地预览服务器
 * ==========================================================================
 * 只用 Node.js 内置模块写的极简静态服务器 + 自动重建：
 *
 *   1. 监听 src/、blog.config.json 的改动
 *   2. 有改动就跑一次 tools/build.js
 *   3. 通过 Server-Sent Events 通知浏览器刷新页面
 *
 * 服务器不参与"生成网站"，它只是把 docs/ 里的文件发出去，
 * 这样本地看到的效果和 GitHub Pages 上的完全一致。
 *
 * 用法：
 *   node tools/dev-server.js              默认 http://127.0.0.1:4321
 *   node tools/dev-server.js --port=8080  换个端口
 *   node tools/dev-server.js --no-build   不自动重建，只当静态服务器用
 * ========================================================================== */

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const WATCH_DIRS = [path.join(ROOT, 'src')];
const WATCH_FILES = [path.join(ROOT, 'blog.config.json')];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.webmanifest': 'application/manifest+json',
};

function parseArgs(argv) {
  const options = { port: 4321, host: '127.0.0.1', build: true, open: false };
  for (const arg of argv) {
    if (arg.startsWith('--port=')) options.port = Number(arg.slice(7)) || options.port;
    else if (arg.startsWith('--host=')) options.host = arg.slice(7) || options.host;
    else if (arg === '--no-build') options.build = false;
    else if (arg === '--open') options.open = true;
  }
  return options;
}

const OPTIONS = parseArgs(process.argv.slice(2));
const OUT_DIR = path.join(ROOT, 'docs');

let version = Date.now();
let building = false;
let queued = false;
let lastError = null;

/* --------------------------------------------------------------------------
   构建
   -------------------------------------------------------------------------- */

function runBuild(reason) {
  if (building) {
    queued = true;
    return;
  }
  building = true;
  const started = Date.now();
  console.log(`\n[dev] 重新构建（${reason}）…`);

  const child = spawn(process.execPath, [path.join(__dirname, 'build.js'), '--drafts'], {
    cwd: ROOT,
    stdio: 'inherit', // 直接把构建脚本的输出打到当前终端
  });

  child.on('exit', (code) => {
    building = false;
    if (code === 0) {
      lastError = null;
      version = Date.now();
      console.log(`[dev] 构建完成，用时 ${Date.now() - started} ms`);
    } else {
      lastError = `构建失败（退出码 ${code}），详情见上面的输出`;
      console.error(`[dev] ${lastError}`);
    }
    if (queued) {
      queued = false;
      runBuild('上一次改动');
    }
  });

  child.on('error', (error) => {
    building = false;
    lastError = `无法启动构建脚本：${error.message}`;
    console.error(`[dev] ${lastError}`);
  });
}

/* --------------------------------------------------------------------------
   文件监听（带 250ms 防抖）
   -------------------------------------------------------------------------- */

function watchAll() {
  if (!OPTIONS.build) return;

  let timer = null;
  const schedule = (reason) => {
    clearTimeout(timer);
    timer = setTimeout(() => runBuild(reason), 250);
  };

  for (const dir of WATCH_DIRS) {
    if (!fs.existsSync(dir)) continue;
    try {
      fs.watch(dir, { recursive: true }, (eventType, fileName) => {
        schedule(fileName ? `src/${fileName}` : 'src/ 有改动');
      });
    } catch (error) {
      console.warn(`[dev] 无法递归监听 ${dir}：${error.message}`);
    }
  }

  for (const file of WATCH_FILES) {
    if (!fs.existsSync(file)) continue;
    fs.watch(file, () => schedule(path.basename(file)));
  }
}

/* --------------------------------------------------------------------------
   静态文件服务
   -------------------------------------------------------------------------- */

const RELOAD_SNIPPET = `
<script>
(function () {
  if (!window.EventSource) return;
  var source = new EventSource('/__dev/events');
  source.addEventListener('reload', function () { window.location.reload(); });
  source.addEventListener('error', function () { /* 服务器重启时自动重连 */ });
})();
</script>
`;

async function resolveTarget(urlPath) {
  // 去掉查询串，解码，并防止 ../ 逃出 docs/
  const clean = decodeURIComponent(String(urlPath).split('?')[0].split('#')[0]);
  const relative = path.normalize(clean).replace(/^([/\\])+/, '');
  const target = path.join(OUT_DIR, relative);

  if (!target.startsWith(OUT_DIR)) return null;

  try {
    const stat = await fsp.stat(target);
    if (stat.isDirectory()) {
      const index = path.join(target, 'index.html');
      if (await fsp.stat(index).then(() => true).catch(() => false)) return { file: index };
      return null;
    }
    return { file: target };
  } catch (error) {
    // /about 这类没有扩展名的地址，试着补一个 /index.html
    if (!path.extname(target)) {
      const index = path.join(target, 'index.html');
      if (await fsp.stat(index).then(() => true).catch(() => false)) return { file: index };
    }
    return null;
  }
}

function send404(res) {
  const custom = path.join(OUT_DIR, '404.html');
  fs.readFile(custom, 'utf8', (error, html) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 · 找不到这个文件');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(injectReload(html));
  });
}

function injectReload(html) {
  if (!OPTIONS.build) return html;
  if (html.includes('__dev/events')) return html;
  return html.includes('</body>') ? html.replace('</body>', `${RELOAD_SNIPPET}</body>`) : html + RELOAD_SNIPPET;
}

const server = http.createServer(async (req, res) => {
  const urlPath = String(req.url || '/').split('?')[0];

  // ---- 开发专用接口 ----
  if (urlPath === '/__dev/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ version, building, error: lastError }));
    return;
  }

  if (urlPath === '/__dev/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
    });
    res.write(`event: hello\ndata: ${version}\n\n`);
    const send = (payload) => res.write(`event: reload\ndata: ${payload}\n\n`);
    clients.add(send);
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(keepAlive);
      clients.delete(send);
    });
    return;
  }

  // ---- 静态文件 ----
  const resolved = await resolveTarget(req.url || '/');
  if (!resolved) {
    send404(res);
    return;
  }

  const ext = path.extname(resolved.file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const isHtml = ext === '.html';

  try {
    let body = await fsp.readFile(resolved.file);
    if (isHtml) {
      body = Buffer.from(injectReload(body.toString('utf8')), 'utf8');
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`500 · 读取文件失败：${error.message}`);
  }
});

const clients = new Set();

/* --------------------------------------------------------------------------
   启动
   -------------------------------------------------------------------------- */

function broadcast(payload) {
  for (const send of Array.from(clients)) send(payload);
}

/** 监视 version 变量，一旦构建产出新版本就通知所有浏览器刷新 */
function startBroadcastLoop() {
  let lastSeen = version;
  setInterval(() => {
    if (version === lastSeen) return;
    lastSeen = version;
    broadcast(version);
  }, 200).unref();
}

async function start() {
  if (!OPTIONS.build) {
    console.log('[dev] --no-build：只提供静态文件，不监听改动。');
  }

  await new Promise((resolve) => {
    const bootstrap = spawn(process.execPath, [path.join(__dirname, 'build.js'), '--drafts'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    bootstrap.on('exit', () => resolve());
    bootstrap.on('error', () => resolve());
  });

  version = Date.now();
  startBroadcastLoop();
  watchAll();

  server.listen(OPTIONS.port, OPTIONS.host, () => {
    const url = `http://${OPTIONS.host}:${OPTIONS.port}/`;
    console.log('');
    console.log('─'.repeat(54));
    console.log(`  本地预览已启动：${url}`);
    if (OPTIONS.build) {
      console.log('  修改 src/ 里的文件会自动重新构建并刷新页面。');
      console.log('  草稿（draft: true）在本地预览里也会显示。');
    }
    console.log('  按 Ctrl+C 停止。');
    console.log('─'.repeat(54));
    console.log('');
  });
}

process.on('SIGINT', () => {
  console.log('\n[dev] 已停止。');
  process.exit(0);
});

start().catch((error) => {
  console.error('[dev] 启动失败：', error);
  process.exit(1);
});
