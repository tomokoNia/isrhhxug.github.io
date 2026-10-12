'use strict';

/**
 * 一个非常小的 front matter 解析器。
 *
 * 支持的范围（故意做得很小，够博客用就行）：
 *
 *   ---
 *   title: 标题
 *   date: 2026-09-29
 *   tags:
 *     - 生活
 *     - 思考
 *   draft: false
 *   ---
 *
 * 也支持行内数组写法：tags: [生活, 思考]
 * 也支持带引号的值：title: "标题: 带冒号"
 *
 * 不支持的：多行字符串、嵌套对象、锚点引用等完整 YAML 特性。
 */

const BOOLEAN_TRUE = new Set(['true', 'yes', 'on']);
const BOOLEAN_FALSE = new Set(['false', 'no', 'off']);

function stripQuotes(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/** 把标量字符串转换成 boolean / number / string */
function parseScalar(raw) {
  const value = stripQuotes(raw.trim());
  const lower = value.toLowerCase();

  if (BOOLEAN_TRUE.has(lower)) return true;
  if (BOOLEAN_FALSE.has(lower)) return false;
  if (value === '') return '';

  // 纯数字（含负数、小数）转成 number，日期字符串不会被误伤
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);

  return value;
}

/** 行内数组： [a, b, "c, d"] */
function parseInlineArray(raw) {
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (!inner.trim()) return [];

  const items = [];
  let current = '';
  let quote = null;

  for (const char of inner) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ',') {
      items.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  items.push(current);

  return items.map((item) => parseScalar(item.trim())).filter((item) => item !== '');
}

/**
 * @param {string} source Markdown 原文
 * @returns {{ data: Record<string, any>, content: string }}
 */
function parseFrontMatter(source) {
  const text = String(source).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const data = {};

  if (!/^---[ \t]*\n/.test(text) && !/^---[ \t]*$/.test(text)) {
    return { data, content: text };
  }

  const lines = text.split('\n');
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (/^(---|\.\.\.)[ \t]*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  // 没有结束标记，就当成普通正文
  if (end === -1) return { data, content: text };

  const content = lines.slice(end + 1).join('\n').replace(/^\n+/, '');
  const block = lines.slice(1, end);

  let currentKey = null;

  for (const rawLine of block) {
    if (!rawLine.trim() || /^\s*#/.test(rawLine)) continue;

    const listItem = rawLine.match(/^\s*-\s+(.*)$/);
    if (listItem && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(parseScalar(listItem[1]));
      continue;
    }

    const pair = rawLine.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!pair) continue;

    const key = pair[1];
    const rawValue = pair[2].trim();
    currentKey = key;

    if (rawValue === '') {
      data[key] = []; // 后面可能跟着 - 列表项，也可能一直是空数组
    } else if (rawValue.startsWith('[')) {
      data[key] = parseInlineArray(rawValue);
    } else {
      data[key] = parseScalar(rawValue);
    }
  }

  // 空的数组字段（既没有值也没有列表项）删掉，避免模板里出现 undefined
  for (const key of Object.keys(data)) {
    if (Array.isArray(data[key]) && data[key].length === 0) data[key] = [];
  }

  return { data, content };
}

module.exports = { parseFrontMatter, parseScalar };
