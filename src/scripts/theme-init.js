/* 会被 tools/build.js 内联到每个页面的 <head> 里，并且必须在样式表之前同步执行。
   因此它只做两件事，都要足够快、足够稳：

     1. 决定 <html data-theme="…"> 的初始值，防止深色模式闪白。
        优先级：用户上次的手动选择 > 系统偏好 > 配置里的 site/theme.default。

     2. 样式表兜底（见文件下半部分）。
*/
(function () {
  var DEFAULT_THEME = __BLOG_DEFAULT_THEME__;
  try {
    var saved = window.localStorage.getItem('blog-theme');
    var theme;
    if (saved === 'light' || saved === 'dark') {
      theme = saved;
    } else if (DEFAULT_THEME === 'light' || DEFAULT_THEME === 'dark') {
      theme = DEFAULT_THEME;
    } else {
      theme =
        window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  } catch (error) {
    /* localStorage 不可用时保持默认 */
  }

  /* --------------------------------------------------------------------
     样式表兜底
     --------------------------------------------------------------------
     整站的链接都是绝对路径（/assets/style.css），这是 HTTP 部署时唯一
     正确的写法。但如果你用 file:// 双击打开 docs/index.html，绝对路径
     会被解析成 C:/assets/style.css——页面就完全没有样式了。

     这一段就是为这种情况准备的：发现样式表没加载成功，就换成相对路径
     再试一次；如果还是不行，直接在页面顶部显示一句人话说明原因。
     -------------------------------------------------------------------- */
  function styleLoaded() {
    var sheets = document.styleSheets;
    for (var i = 0; i < sheets.length; i += 1) {
      var href = sheets[i].href || '';
      if (href.indexOf('style.css') !== -1) return true;
    }
    return false;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function showNotice(attempted) {
    var mount = function () {
      if (!document.body) return;
      var box = document.createElement('div');
      box.style.cssText =
        'margin:24px auto;max-width:760px;padding:16px 20px;border:1px solid #b8860b;' +
        'border-radius:6px;background:#fffbe6;color:#4a3a00;font:15px/1.75 system-ui,sans-serif';
      box.innerHTML =
        '<strong>样式表没有加载成功，所以页面看起来是白底黑字。</strong><br>' +
        '浏览器尝试过这些地址：' +
        attempted.map(function (item) {
          return '<code>' + escapeHtml(item) + '</code>';
        }).join(' 和 ') +
        '。<br><br>推荐做法：在项目目录里运行 <code>npm run dev</code>，' +
        '然后访问 <code>http://127.0.0.1:4321/</code>。' +
        '<br>（直接用双击打开 HTML 文件是不行的，因为绝对路径会指向磁盘根目录。）';
      document.body.insertBefore(box, document.body.firstChild);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount);
    } else {
      mount();
    }
  }

  window.setTimeout(function () {
    if (styleLoaded()) return;

    var link = document.querySelector('link[data-blog-style]');
    if (!link) return;

    var original = link.getAttribute('href') || '';
    var base = document.documentElement.getAttribute('data-base') || '/';
    var relative = base.replace(/^\/+/, '') + 'assets/style.css';

    if (original === relative) {
      showNotice([original]);
      return;
    }

    var retry = document.createElement('link');
    retry.rel = 'stylesheet';
    retry.href = relative;

    retry.addEventListener('load', function () {
      if (styleLoaded()) return;
      // 拿到了文件但不是 CSS（比如服务器返回了一个 HTML 404 页面）
      showNotice([original, relative]);
    });

    retry.addEventListener('error', function () {
      showNotice([original, relative]);
    });

    document.head.appendChild(retry);
  }, 250);
})();
