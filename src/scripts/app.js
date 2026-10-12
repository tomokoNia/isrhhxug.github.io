/* ==========================================================================
   像素笔记 · 浏览器端脚本
   --------------------------------------------------------------------------
   这个文件只做四件小事，全部是"渐进增强"，脚本失败也不影响阅读：

     1. 浅色 / 深色模式切换（记住选择）
     2. 手机上的导航展开 / 收起
     3. 文章目录的滚动高亮
     4. 代码块的一键复制

   没有框架，没有构建步骤，直接读写 DOM。
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 工具                                                                */
  /* ------------------------------------------------------------------ */

  var root = document.documentElement;
  var BASE = root.getAttribute('data-base') || '/';

  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function store(key, value) {
    try {
      if (arguments.length === 1) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
      return value;
    } catch (error) {
      return null; // 隐私模式下 localStorage 可能不可用，忽略即可
    }
  }

  /* ------------------------------------------------------------------ */
  /* 1. 主题                                                             */
  /* ------------------------------------------------------------------ */

  function currentTheme() {
    var explicit = root.getAttribute('data-theme');
    if (explicit === 'light' || explicit === 'dark') return explicit;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0e1720' : '#dfebf3');
  }

  function initTheme() {
    var saved = store('blog-theme');
    if (saved === 'light' || saved === 'dark') applyTheme(saved);
    else applyTheme(currentTheme());

    var button = $('[data-theme-toggle]');
    if (!button) return;

    button.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      store('blog-theme', next);
      applyTheme(next);
    });

    // 用户没有手动选过时，跟随系统变化
    if (window.matchMedia) {
      var query = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () {
        var manual = store('blog-theme');
        if (manual !== 'light' && manual !== 'dark') applyTheme(currentTheme());
      };
      if (query.addEventListener) query.addEventListener('change', onChange);
      else if (query.addListener) query.addListener(onChange);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 2. 导航                                                             */
  /* ------------------------------------------------------------------ */

  function initMenu() {
    var button = $('[data-menu-toggle]');
    var nav = $('[data-nav]');
    if (!button || !nav) return;

    button.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  function normalizePath(path) {
    var clean = String(path || '/').split('?')[0].split('#')[0];
    clean = clean.replace(/index\.html$/, '');
    if (!clean.startsWith('/')) clean = '/' + clean;
    if (!clean.endsWith('/')) clean += '/';
    return clean.replace(/\/{2,}/g, '/');
  }

  function initActiveNav() {
    var path = normalizePath(window.location.pathname);
    if (path.indexOf(BASE) === 0) path = '/' + path.slice(BASE.length);
    path = normalizePath(path);

    var links = $$('.nav-link');
    var best = null;
    var bestLength = -1;

    links.forEach(function (link) {
      var linkPath = normalizePath(link.getAttribute('href'));
      if (linkPath === '/') {
        if (path === '/' && bestLength < 1) {
          best = link;
          bestLength = 1;
        }
        return;
      }
      if (path.indexOf(linkPath) === 0 && linkPath.length > bestLength) {
        best = link;
        bestLength = linkPath.length;
      }
    });

    if (best) best.setAttribute('aria-current', 'page');
  }

  /* ------------------------------------------------------------------ */
  /* 3. 目录滚动高亮                                                     */
  /* ------------------------------------------------------------------ */

  function initToc() {
    var toc = $('[data-toc]');
    var entry = $('[data-entry]');
    if (!toc || !entry) return;

    var links = $$('.toc-link', toc);
    if (!links.length) return;

    var map = {};
    links.forEach(function (link) {
      map[link.getAttribute('href').slice(1)] = link;
    });

    var headings = $$('h2, h3, h4', entry).filter(function (heading) {
      return map[heading.id];
    });
    if (!headings.length) return;

    var active = null;
    function setActive(id) {
      if (active === id) return;
      active = id;
      links.forEach(function (link) {
        link.classList.toggle('is-active', link.getAttribute('href') === '#' + id);
      });
    }

    function update() {
      var offset = 96;
      var current = headings[0].id;

      for (var i = 0; i < headings.length; i += 1) {
        if (headings[i].getBoundingClientRect().top <= offset) current = headings[i].id;
        else break;
      }

      // 滚到最底部时，直接高亮最后一节
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) {
        current = headings[headings.length - 1].id;
      }

      setActive(current);
    }

    var ticking = false;
    window.addEventListener(
      'scroll',
      function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () {
          ticking = false;
          update();
        });
      },
      { passive: true }
    );

    update();
  }

  /* ------------------------------------------------------------------ */
  /* 4. 代码复制                                                         */
  /* ------------------------------------------------------------------ */

  function initCodeCopy() {
    var blocks = $$('.code-block');
    if (!blocks.length || !navigator.clipboard) return;

    blocks.forEach(function (block) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'code-copy';
      button.textContent = '复制';

      button.addEventListener('click', function () {
        var code = $('code', block);
        var text = code ? code.textContent : '';
        navigator.clipboard.writeText(text).then(
          function () {
            button.textContent = '已复制';
            window.setTimeout(function () {
              button.textContent = '复制';
            }, 1600);
          },
          function () {
            button.textContent = '复制失败';
            window.setTimeout(function () {
              button.textContent = '复制';
            }, 1600);
          }
        );
      });

      block.appendChild(button);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 启动                                                                */
  /* ------------------------------------------------------------------ */

  function start() {
    initTheme();
    initMenu();
    initActiveNav();
    initToc();
    initCodeCopy();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();