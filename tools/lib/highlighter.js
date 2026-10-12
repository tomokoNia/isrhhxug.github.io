'use strict';

/**
 * 极简语法高亮器。
 *
 * 为什么不用 highlight.js / prismjs？
 * 因为博客里出现的语言基本只有几种，与其引入几百 KB 的依赖和维护多套主题，
 * 不如用一份几十行的规则表，自己输出 <span class="tok-xxx">。
 * 颜色由 src/styles/40-highlight.css 里的 CSS 变量决定，深色模式自动跟随。
 *
 * 注意：这里没有"正确解析代码"的野心，它只做词法层面的着色。
 * 最坏的结果是某个词颜色不对，不影响代码本身的可读性。
 */

/** 每种语言的行注释风格 */
const COMMENT_STYLE = {
  js: 'slashslash',
  javascript: 'slashslash',
  jsx: 'slashslash',
  mjs: 'slashslash',
  cjs: 'slashslash',
  ts: 'slashslash',
  typescript: 'slashslash',
  tsx: 'slashslash',
  json: null,
  css: 'slashslash',
  scss: 'slashslash',
  less: 'slashslash',
  java: 'slashslash',
  c: 'slashslash',
  h: 'slashslash',
  cpp: 'slashslash',
  cc: 'slashslash',
  hpp: 'slashslash',
  cs: 'slashslash',
  csharp: 'slashslash',
  go: 'slashslash',
  rust: 'slashslash',
  rs: 'slashslash',
  php: 'slashslash',
  swift: 'slashslash',
  kotlin: 'slashslash',
  scala: 'slashslash',
  dart: 'slashslash',
  sql: 'dash',
  python: 'hash',
  py: 'hash',
  ruby: 'hash',
  rb: 'hash',
  yaml: 'hash',
  yml: 'hash',
  toml: 'hash',
  ini: 'hash',
  conf: 'hash',
  sh: 'hash',
  bash: 'hash',
  zsh: 'hash',
  shell: 'hash',
  powershell: 'hash',
  ps1: 'hash',
  makefile: 'hash',
  dockerfile: 'hash',
  perl: 'hash',
  r: 'hash',
  html: 'html',
  xml: 'html',
  svg: 'html',
  vue: 'html',
  markdown: false,
  md: false,
  text: false,
  txt: false,
  plaintext: false,
  diff: false,
  log: false,
};

const KEYWORDS = [
  'abstract', 'and', 'as', 'assert', 'async', 'await', 'break', 'case', 'catch', 'chan',
  'class', 'const', 'constructor', 'continue', 'def', 'default', 'defer', 'del', 'delete',
  'do', 'dyn', 'elif', 'else', 'elseif', 'elsif', 'end', 'enum', 'event', 'except', 'exit',
  'export', 'extends', 'extern', 'false', 'final', 'finally', 'fn', 'for', 'foreach', 'from',
  'func', 'function', 'get', 'global', 'go', 'goto', 'if', 'impl', 'implements', 'import',
  'in', 'include', 'instanceof', 'interface', 'internal', 'is', 'lambda', 'let', 'local',
  'lock', 'match', 'module', 'mut', 'namespace', 'native', 'new', 'nil', 'none', 'not',
  'null', 'operator', 'or', 'override', 'package', 'params', 'pass', 'print', 'private',
  'protected', 'public', 'raise', 'readonly', 'record', 'ref', 'require', 'return', 'sealed',
  'self', 'set', 'sizeof', 'static', 'struct', 'super', 'switch', 'template', 'then', 'this',
  'throw', 'throws', 'trait', 'true', 'try', 'type', 'typeof', 'undef', 'undefined', 'union',
  'unless', 'unsafe', 'until', 'use', 'using', 'var', 'virtual', 'void', 'volatile', 'when',
  'where', 'while', 'with', 'yield',
];

/** 顺序有意义：越靠前优先级越高 */
const RULES = [
  { kind: 'comment', style: 'slashslash', re: /\/\/[^\n]*/y },
  { kind: 'comment', style: 'hash', re: /#[^\n]*/y },
  { kind: 'comment', style: 'dash', re: /--[^\n]*/y },
  { kind: 'comment', style: 'any', re: /\/\*[\s\S]*?\*\//y },
  { kind: 'comment', style: 'any', re: /<!--[\s\S]*?-->/y },
  { kind: 'string', re: /"""(?:[\s\S]*?)"""/y },
  { kind: 'string', re: /'''(?:[\s\S]*?)'''/y },
  { kind: 'string', re: /"(?:\\.|[^"\\\n])*"/y },
  { kind: 'string', re: /'(?:\\.|[^'\\\n])*'/y },
  { kind: 'string', re: /`(?:\\.|[^`\\])*`/y },
  { kind: 'number', re: /\b0[xX][0-9a-fA-F]+\b/y },
  { kind: 'number', re: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y },
  { kind: 'number', re: /\b[A-Z][A-Z0-9_]{2,}\b/y },
  { kind: 'key', re: /[A-Za-z_$][\w$]*(?=\s*:)/y },
  { kind: 'function', re: /[A-Za-z_$][\w$]*(?=\s*\()/y },
  { kind: 'builtin', re: /\b(?:true|false|null|nil|undefined|NaN|Infinity|None|True|False)\b/y },
  { kind: 'keyword', re: new RegExp(`\\b(?:${KEYWORDS.join('|')})\\b`, 'y') },
  { kind: 'tag', re: /<\/?[A-Za-z][\w:-]*/y },
  { kind: 'operator', re: /[+\-*/%=!<>&|^~?:.,;@]+/y },
];

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function selectRules(language) {
  const style = COMMENT_STYLE[language];
  if (style === undefined) return null; // 未知语言：不高亮
  if (style === false) return []; // 明确不需要高亮的语言

  const hasComment =
    style !== null &&
    (style === 'any' ||
      style === 'slashslash' ||
      style === 'hash' ||
      style === 'dash');

  return RULES.filter((rule) => {
    if (rule.kind !== 'comment') return true;
    if (!hasComment) return false;
    return rule.style === 'any' || rule.style === style;
  });
}

/**
 * @param {string} code 代码原文（未转义）
 * @param {string|undefined} language 代码块标注的语言
 * @returns {string} 已转义、带 <span> 的 HTML
 */
function highlight(code, language) {
  const text = String(code == null ? '' : code).replace(/\r\n?/g, '\n');
  const lang = String(language || '').toLowerCase();
  const rules = selectRules(lang);

  if (!rules || rules.length === 0) return escapeHtml(text);

  let out = '';
  let index = 0;
  let plainStart = 0;
  const length = text.length;

  while (index < length) {
    let hit = null;

    for (const rule of rules) {
      rule.re.lastIndex = index;
      const match = rule.re.exec(text);
      if (match && match.index === index && match[0].length > 0) {
        hit = { kind: rule.kind, value: match[0] };
        break;
      }
    }

    if (!hit) {
      index += 1;
      continue;
    }

    if (index > plainStart) out += escapeHtml(text.slice(plainStart, index));
    out += `<span class="tok-${hit.kind}">${escapeHtml(hit.value)}</span>`;
    index += hit.value.length;
    plainStart = index;
  }

  if (plainStart < length) out += escapeHtml(text.slice(plainStart, length));
  return out;
}

module.exports = { highlight, escapeHtml };
