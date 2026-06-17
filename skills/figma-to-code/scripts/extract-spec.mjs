#!/usr/bin/env node
// 静态解析步骤 2b 保存的 Figma module reference .tsx，逐元素抽出「期望属性表」。
// 用途：把 references/07 里手填的「A6 强制映射表」自动化——agent 不再凭记忆列属性，
//      拿这张支持模式确定性生成的表去逐项比对自己生成的代码（3c-auto，约束 F4）。
//
// 设计边界（与 08-attribute-verification.md 一致）：
//   - 只「抽取 + 供比对」叶子样式属性（字号/颜色/行高/圆角/overflow…）。
//   - 布局/定位/间距（absolute/inset/margin/flex 排布/transform）只「标注」不判对错——
//     .tsx 是绝对定位导出、产出是语义重写，二者天然不同，自动判会误报，归人工 + A4。
//   - 对 display:contents 承担定位职责的已知坏味道做风险提示；命中时几何必须回到整稿/父级
//     导出与 get_metadata 坐标，模块 reference 只可作叶子属性参考。
//   - 非标 Figma 类（col-N/row-N/伪字体族）原样列出并标注，不静默丢弃。
//   - 未识别的类进入「未知」清单交 agent 人判，绝不假装解析或承诺全覆盖。
//   - 纯静态正则解析，零依赖、不渲染、不碰预览子包、不用浏览器。
//   - 覆盖内联 style：对象式 style={{...}} 与字符串式 style="..."，渐变/背景图/maskImage 等
//     落到 style 上的叶子值不再被丢弃；布局类属性（left/top/transform…）归人工/A4。
//
// 适用范围：仅限 Figma get_design_context 静态导出的 .tsx。className 支持字符串字面量、
//           {expr || "..."}、模板字面量 {`base ${cond ? "x" : "y"}`}（含基础类与三元分支）。
//           完全动态拼接（变量/函数调用产出的 class）仍可能漏抽，属预期边界。
//
// 用法:
//   node .agents/skills/figma-to-code/scripts/extract-spec.mjs <path/to/module-reference.tsx> [--json] [--node-id <id>] [--metadata <metadata.json>]

import { readFileSync, existsSync } from 'node:fs';
import { relative } from 'node:path';

const args = process.argv.slice(2);
let asJson = false;
let file = null;
let nodeIdFilter = null;
let metadataFile = null;

function usage() {
  return '用法: node .agents/skills/figma-to-code/scripts/extract-spec.mjs <path/to/module-reference.tsx> [--json] [--node-id <id>] [--metadata <metadata.json>]';
}

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--json') {
    asJson = true;
  } else if (arg === '--node-id') {
    nodeIdFilter = args[++i];
    if (!nodeIdFilter) {
      console.error(`${usage()}\n缺少 --node-id 的值`);
      process.exit(1);
    }
  } else if (arg === '--metadata') {
    metadataFile = args[++i];
    if (!metadataFile) {
      console.error(`${usage()}\n缺少 --metadata 的值`);
      process.exit(1);
    }
  } else if (arg.startsWith('--')) {
    console.error(`${usage()}\n未知参数: ${arg}`);
    process.exit(1);
  } else if (!file) {
    file = arg;
  } else {
    console.error(`${usage()}\n多余参数: ${arg}`);
    process.exit(1);
  }
}

if (!file) {
  console.error(usage());
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`文件不存在: ${file}`);
  process.exit(1);
}
if (metadataFile && !existsSync(metadataFile)) {
  console.error(`metadata 文件不存在: ${metadataFile}`);
  process.exit(1);
}

const src = readFileSync(file, 'utf8');
const metadata = metadataFile ? JSON.parse(readFileSync(metadataFile, 'utf8')) : null;

// ---- font-weight 关键字 → 数值 ----
const FONT_WEIGHT = {
  'font-thin': 100, 'font-extralight': 200, 'font-light': 300, 'font-normal': 400,
  'font-medium': 500, 'font-semibold': 600, 'font-bold': 700, 'font-extrabold': 800, 'font-black': 900,
};

// ---- 渐变方向关键字 → linear-gradient 方向（色标见同元素 from/via/to）----
const GRADIENT_DIR = {
  'bg-gradient-to-t': 'to top', 'bg-gradient-to-tr': 'to top right', 'bg-gradient-to-r': 'to right',
  'bg-gradient-to-br': 'to bottom right', 'bg-gradient-to-b': 'to bottom', 'bg-gradient-to-bl': 'to bottom left',
  'bg-gradient-to-l': 'to left', 'bg-gradient-to-tl': 'to top left',
  // Tailwind v4 线性渐变写法
  'bg-linear-to-t': 'to top', 'bg-linear-to-r': 'to right', 'bg-linear-to-b': 'to bottom', 'bg-linear-to-l': 'to left',
};

// ---- 边框样式关键字 ----
const BORDER_STYLE = new Set([
  'border-solid', 'border-dashed', 'border-dotted', 'border-double', 'border-hidden', 'border-none',
]);

// ---- 普适命名色（Figma 导出里常见的少数几个；其余调色板命名色不臆测，留作未知）----
const NAMED_COLOR = {
  white: '#ffffff', black: '#000000', transparent: 'transparent', current: 'currentColor', inherit: 'inherit',
};

// ---- 固定像素尺寸关键字（Tailwind 静态类，非任意值）----
const PX_SIZE = {
  'w-px': ['width', '1px'], 'h-px': ['height', '1px'], 'size-px': ['width/height', '1px'],
  'min-w-px': ['min-width', '1px'], 'min-h-px': ['min-height', '1px'], 'max-w-px': ['max-width', '1px'], 'max-h-px': ['max-height', '1px'],
};

// ---- object-fit 关键字 ----
const OBJECT_FIT = {
  'object-contain': 'contain', 'object-cover': 'cover', 'object-fill': 'fill',
  'object-none': 'none', 'object-scale-down': 'scale-down',
};

// 一个 token 是否可能是合法的 class（class 名为可见 ASCII；CJK/含空格者必是被误抓的字符串操作数，
// 如 ["2个tab","4个tab-左边"].includes(prop1) 这类条件里的 prop 取值，应剔除而非当未知）。
// 注：含 CJK 的合法任意值（如 font-['思源黑体']）带方括号，已在 parseArbitraryLeaf 提前归为叶子，不会走到这里。
const isPlausibleClassToken = (cls) => /^[\x21-\x7E]+$/.test(cls);

// ---- 关键字型叶子类（非任意值）→ CSS ----
const KEYWORD_LEAF = {
  'whitespace-nowrap': ['white-space', 'nowrap'],
  'whitespace-pre': ['white-space', 'pre'],
  'whitespace-pre-line': ['white-space', 'pre-line'],
  'whitespace-pre-wrap': ['white-space', 'pre-wrap'],
  'whitespace-normal': ['white-space', 'normal'],
  'overflow-clip': ['overflow', 'hidden'],
  'overflow-hidden': ['overflow', 'hidden'],
  'overflow-auto': ['overflow', 'auto'],
  'overflow-scroll': ['overflow', 'scroll'],
  'overflow-visible': ['overflow', 'visible'],
  'italic': ['font-style', 'italic'],
  'not-italic': ['font-style', 'normal'],
  'uppercase': ['text-transform', 'uppercase'],
  'lowercase': ['text-transform', 'lowercase'],
  'capitalize': ['text-transform', 'capitalize'],
  'normal-case': ['text-transform', 'none'],
  'text-center': ['text-align', 'center'],
  'text-left': ['text-align', 'left'],
  'text-right': ['text-align', 'right'],
  'text-justify': ['text-align', 'justify'],
  'underline': ['text-decoration-line', 'underline'],
  'line-through': ['text-decoration-line', 'line-through'],
  'no-underline': ['text-decoration-line', 'none'],
};

// ---- 布局/定位/排布类（只标注，不入自动比对，归人工 + A4）----
const LAYOUT_KEYWORDS = new Set([
  'absolute', 'relative', 'fixed', 'sticky', 'static',
  'flex', 'inline-flex', 'grid', 'inline-grid', 'block', 'inline-block', 'inline', 'hidden', 'contents',
  'flex-row', 'flex-col', 'flex-row-reverse', 'flex-col-reverse', 'flex-wrap', 'flex-nowrap',
  'flex-none', 'flex-1', 'flex-auto', 'flex-initial', 'grow', 'grow-0', 'shrink', 'shrink-0',
  'w-full', 'h-full', 'size-full', 'w-auto', 'h-auto', 'max-w-none', 'min-w-0', 'min-h-0',
  'content-stretch', 'content-center', 'content-start', 'content-end', 'content-between',
]);
// 前缀型布局类（items-* / justify-* / self-* / inset-* / top-* / m* 等）
const LAYOUT_PREFIX = [
  'items-', 'justify-', 'self-', 'place-', 'content-',
  'inset-', 'top-', 'left-', 'right-', 'bottom-',
  'm-', 'mx-', 'my-', 'mt-', 'mr-', 'mb-', 'ml-',
  'translate-', '-translate-', 'scale-', '-scale-', 'rotate-', '-rotate-', 'skew-', '-skew-', 'origin-',
  'z-', 'order-', 'basis-', 'grid-cols-', 'grid-rows-', 'auto-cols-', 'auto-rows-',
  'flex-', 'pointer-events-',
  // mask-* 类与 style.maskImage 配套，几何/裁剪需人工配合 style 一起核对
  'mask-',
];
// 非标 Figma 类（标准 Tailwind 不存在；预览靠 figma-shim 兜底）
const NONSTD_PREFIX = ['col-', 'row-'];
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const CONTENTS_POSITION_CLASSES = new Set(['absolute', 'relative', 'fixed', 'sticky']);
const CONTENTS_OFFSET_PREFIX = ['inset-', 'top-', 'left-', 'right-', 'bottom-', 'm-', 'mx-', 'my-', 'mt-', 'mr-', 'mb-', 'ml-'];

// 任意属性语法 [prop:value] 里属于布局/定位的 CSS 属性（只标注、不自动比对）
const LAYOUT_CSS_PROPS = new Set([
  'position', 'top', 'left', 'right', 'bottom', 'inset', 'z-index', 'float', 'clear',
  'display', 'transform', 'transform-origin', 'translate', 'rotate', 'scale',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'flex', 'flex-direction', 'flex-grow', 'flex-shrink', 'flex-basis', 'flex-wrap',
  'align-items', 'align-self', 'align-content', 'justify-content', 'justify-items', 'justify-self',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'order',
]);

// ---- 任意值叶子类解析：返回 [cssProp, value, note?] 或 null；布局项返回 ['@layout', cls] ----
function parseArbitraryLeaf(cls) {
  // 任意属性语法: [prop:value]（显式 CSS 声明，如 [word-break:break-word]）
  const ap = cls.match(/^\[([a-z-]+):(.+)\]$/);
  if (ap) {
    const [, prop, rawVal] = ap;
    const value = rawVal.replace(/_/g, ' ');
    if (LAYOUT_CSS_PROPS.has(prop)) return ['@layout', cls];
    return [prop, value];
  }
  // 形如 prefix-[value]
  const m = cls.match(/^(-?[a-z]+(?:-[a-z]+)*)-\[(.+)\]$/);
  if (!m) return null;
  const [, prefix, rawVal] = m;
  const val = rawVal.replace(/_/g, ' '); // Tailwind 任意值里下划线代表空格

  const isColor = (v) => /^#|^rgb|^hsl|^var\(|^currentcolor$/i.test(v);
  const isLen = (v) => /^[\d.]+(px|rem|em|%|vh|vw|vmin|vmax)$/.test(v) || /^calc\(/.test(v);

  switch (prefix) {
    case 'h': return ['height', val];
    case 'w': return ['width', val];
    case 'min-w': return ['min-width', val];
    case 'max-w': return ['max-width', val];
    case 'min-h': return ['min-height', val];
    case 'max-h': return ['max-height', val];
    case 'size': return ['width/height', val];
    case 'p': return ['padding', val];
    case 'px': return ['padding-inline', val];
    case 'py': return ['padding-block', val];
    case 'pt': return ['padding-top', val];
    case 'pr': return ['padding-right', val];
    case 'pb': return ['padding-bottom', val];
    case 'pl': return ['padding-left', val];
    case 'leading': return ['line-height', val, val === 'normal' ? '关键字, 禁具体化(A5)' : undefined];
    case 'tracking': return ['letter-spacing', val];
    case 'gap': return ['gap', val];
    case 'gap-x': return ['column-gap', val];
    case 'gap-y': return ['row-gap', val];
    case 'rounded': return ['border-radius', val];
    case 'rounded-t': return ['border-top-left/right-radius', val];
    case 'rounded-b': return ['border-bottom-left/right-radius', val];
    case 'rounded-l': return ['border-top/bottom-left-radius', val];
    case 'rounded-r': return ['border-top/bottom-right-radius', val];
    case 'rounded-tl': return ['border-top-left-radius', val];
    case 'rounded-tr': return ['border-top-right-radius', val];
    case 'rounded-bl': return ['border-bottom-left-radius', val];
    case 'rounded-br': return ['border-bottom-right-radius', val];
    case 'shadow': return ['box-shadow', val];
    case 'text-shadow': return ['text-shadow', val];
    case 'drop-shadow': return ['filter', `drop-shadow(${val})`];
    case 'from': return ['background-image', val, `渐变起始色标(from); 方向见 bg-gradient-to-*`];
    case 'via': return ['background-image', val, `渐变中间色标(via)`];
    case 'to': return ['background-image', val, `渐变结束色标(to)`];
    case 'opacity': return ['opacity', val];
    case 'font': return ['font-family', val, /:/.test(val) ? '伪字体族(figma), 需映射回真实族' : undefined];
    case 'text':
      if (isColor(val)) return ['color', val];
      if (isLen(val)) return ['font-size', val];
      return ['text-[?]', val, '无法判定是色还是字号, agent 人判'];
    case 'bg':
      if (isColor(val)) return ['background-color', val];
      if (/^url\(|^http|^\.\.?\//.test(val)) return ['background-image', val];
      return ['background', val];
    case 'border':
      if (isColor(val)) return ['border-color', val];
      if (isLen(val)) return ['border-width', val];
      return ['border', val];
    default:
      return null; // 交给上层归为「未知」
  }
}

function classify(classes) {
  const leaf = [];      // { prop, value, note }
  const layout = [];    // string（原样）
  const nonstd = [];    // string（原样）
  const unknown = [];   // string（原样）
  const dropped = [];   // 被剔除的疑似非 class 字符串操作数（CJK/含空格）

  for (const cls of classes) {
    if (!cls) continue;
    if (KEYWORD_LEAF[cls]) {
      const [prop, value] = KEYWORD_LEAF[cls];
      leaf.push({ prop, value });
      continue;
    }
    if (FONT_WEIGHT[cls] !== undefined) {
      leaf.push({ prop: 'font-weight', value: String(FONT_WEIGHT[cls]) });
      continue;
    }
    if (GRADIENT_DIR[cls]) {
      leaf.push({ prop: 'background-image', value: `linear-gradient(${GRADIENT_DIR[cls]}, …)`, note: '渐变方向; 色标见同元素 from/via/to' });
      continue;
    }
    if (BORDER_STYLE.has(cls)) {
      leaf.push({ prop: 'border-style', value: cls.slice('border-'.length) });
      continue;
    }
    if (cls === 'border') { leaf.push({ prop: 'border-width', value: '1px', note: 'Tailwind 默认 border' }); continue; }
    const borderW = cls.match(/^border-(\d+(?:\.\d+)?)$/);
    if (borderW) { leaf.push({ prop: 'border-width', value: `${borderW[1]}px` }); continue; }
    if (PX_SIZE[cls]) { const [prop, value] = PX_SIZE[cls]; leaf.push({ prop, value }); continue; }
    if (OBJECT_FIT[cls]) { leaf.push({ prop: 'object-fit', value: OBJECT_FIT[cls] }); continue; }
    const opa = cls.match(/^opacity-(\d{1,3})$/);
    if (opa) { leaf.push({ prop: 'opacity', value: String(Number(opa[1]) / 100) }); continue; }
    // 静态零/像素尺寸（如 h-0 / gap-px），借任意值解析复用同一套属性映射
    const staticLen = cls.match(/^(min-w|max-w|min-h|max-h|w|h|size|p|px|py|pt|pr|pb|pl|gap|gap-x|gap-y)-(0|px)$/);
    if (staticLen) {
      const mapped = parseArbitraryLeaf(`${staticLen[1]}-[${staticLen[2] === '0' ? '0px' : '1px'}]`);
      if (mapped && mapped[0] !== '@layout') { leaf.push({ prop: mapped[0], value: mapped[1], note: mapped[2] }); continue; }
    }
    const named = cls.match(/^(text|bg|border|from|via|to|fill|stroke|decoration|ring|outline|divide)-(white|black|transparent|current|inherit)$/);
    if (named) {
      const propMap = {
        text: 'color', bg: 'background-color', border: 'border-color',
        from: 'background-image(渐变 from)', via: 'background-image(渐变 via)', to: 'background-image(渐变 to)',
        fill: 'fill', stroke: 'stroke', decoration: 'text-decoration-color', ring: 'box-shadow(ring)', outline: 'outline-color', divide: 'border-color(divide)',
      };
      leaf.push({ prop: propMap[named[1]], value: NAMED_COLOR[named[2]] });
      continue;
    }
    if (LAYOUT_KEYWORDS.has(cls)) { layout.push(cls); continue; }
    if (NONSTD_PREFIX.some((p) => cls.startsWith(p)) && /^(col|row)-\d+$/.test(cls)) {
      nonstd.push(cls); continue;
    }
    if (LAYOUT_PREFIX.some((p) => cls.startsWith(p))) { layout.push(cls); continue; }

    const arb = parseArbitraryLeaf(cls);
    if (arb) {
      if (arb[0] === '@layout') { layout.push(cls); continue; }
      leaf.push({ prop: arb[0], value: arb[1], note: arb[2] });
      continue;
    }
    // 伪字体族里偶有冒号变体已在 font- 分支处理；其余未识别
    if (isPlausibleClassToken(cls)) unknown.push(cls);
    else dropped.push(cls); // 误抓的非 class 字符串字面量（如条件里的 prop 取值），不当作设计属性
  }
  return { leaf, layout, nonstd, unknown, dropped };
}

function geometryFromNode(node) {
  if (!node || typeof node !== 'object') return null;
  const bbox = node.absoluteBoundingBox || node.absoluteRenderBounds || node.boundingBox || node.bounds || node.frame || null;
  const source = bbox && typeof bbox === 'object' ? bbox : node;
  const hasGeometry = ['x', 'y', 'width', 'height'].some((key) => typeof source[key] === 'number');
  if (!hasGeometry) return null;
  return {
    x: source.x,
    y: source.y,
    width: source.width,
    height: source.height,
  };
}

function collectMetadataById(value, map = new Map()) {
  if (Array.isArray(value)) {
    for (const item of value) collectMetadataById(item, map);
    return map;
  }
  if (!value || typeof value !== 'object') return map;

  const id = value.id || value.nodeId || value.node_id;
  if (id) {
    const geometry = geometryFromNode(value);
    if (geometry) map.set(id, geometry);
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') collectMetadataById(child, map);
  }
  return map;
}

const metadataById = metadata ? collectMetadataById(metadata) : new Map();

function layoutRiskFor(classes, nodeId, name) {
  if (!classes.includes('contents')) return null;

  const offsetClasses = classes.filter((cls) => CONTENTS_OFFSET_PREFIX.some((prefix) => cls.startsWith(prefix)));
  const positionClasses = classes.filter((cls) => CONTENTS_POSITION_CLASSES.has(cls));
  const geometry = nodeId ? metadataById.get(nodeId) : null;
  const reasons = [];
  let severity = null;

  if (offsetClasses.length) {
    severity = 'high';
    reasons.push(`contents 节点带偏移类 ${offsetClasses.join(', ')}，display:contents 不生成布局盒，偏移会失效`);
  }
  if (positionClasses.some((cls) => cls !== 'relative')) {
    severity = 'high';
    reasons.push(`contents 节点带定位类 ${positionClasses.join(', ')}`);
  } else if (positionClasses.includes('relative') && !severity) {
    severity = 'warning';
    reasons.push('relative contents 可能丢失自身定位/尺寸职责');
  }
  if (geometry && !severity) {
    severity = 'warning';
    reasons.push(`metadata 显示该 contents 节点有几何信息 x=${geometry.x ?? '?'} y=${geometry.y ?? '?'} w=${geometry.width ?? '?'} h=${geometry.height ?? '?'}`);
  } else if (geometry) {
    reasons.push(`metadata 几何 x=${geometry.x ?? '?'} y=${geometry.y ?? '?'} w=${geometry.width ?? '?'} h=${geometry.height ?? '?'}`);
  }

  if (!severity) return null;
  return {
    severity,
    nodeId,
    name,
    classes,
    reason: reasons.join('；'),
    action: '模块 reference 只可作叶子属性参考；布局几何回到 metadata/get_metadata 或稳定父级坐标。',
  };
}

// ---- 平衡括号扫描：str[startIdx] 必须是 '{'，返回 { body, endIdx }（body 不含外层花括号）----
// 字符串/模板字面量内的花括号（含 ${} 内的）被视为字符串内容，不参与配对。
function matchBraces(str, startIdx) {
  let depth = 0;
  let strCh = null;
  for (let i = startIdx; i < str.length; i += 1) {
    const ch = str[i];
    if (strCh) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === strCh) strCh = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { strCh = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { body: str.slice(startIdx + 1, i), endIdx: i };
    }
  }
  return null;
}

// ---- 顶层分隔：在 () [] {} 与 字符串/模板 之外，按 sep 切分 ----
function splitTopLevel(str, sep) {
  const parts = [];
  let depth = 0;
  let strCh = null;
  let cur = '';
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    if (strCh) {
      cur += ch;
      if (ch === '\\') { cur += str[i + 1] ?? ''; i += 1; continue; }
      if (ch === strCh) strCh = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { strCh = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    if (ch === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') parts.push(cur);
  return parts;
}

// ---- JSX style 属性键（camelCase / 厂商前缀）→ CSS 属性名 ----
function cssPropFromStyleKey(key) {
  let k = String(key || '').trim().replace(/^['"]|['"]$/g, '');
  if (k.startsWith('--')) return k; // CSS 自定义属性原样
  k = k.replace(/^(Webkit|Moz|ms|O)(?=[A-Z])/, (v) => `-${v.toLowerCase()}`);
  return k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

// ---- 清理 style 值：去外层引号/反引号；标注动态（含 ${}）----
function cleanStyleValue(raw) {
  let v = String(raw || '').trim();
  const dynamic = /\$\{/.test(v) || /[A-Za-z_$][\w$]*\s*(\?|&&|\|\|)/.test(v);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")) || (v.startsWith('`') && v.endsWith('`'))) {
    v = v.slice(1, -1);
  }
  return { value: v, dynamic };
}

// ---- 从一个开标签 blob 里抽取内联 style 声明（对象式 style={{...}} 与字符串式 style="..."）----
function styleDeclsFromAttr(blob) {
  const decls = [];

  // 对象式：style={{ ... }}
  const objKey = blob.match(/style\s*=\s*\{/);
  if (objKey) {
    const exprStart = blob.indexOf('{', objKey.index);
    const expr = exprStart >= 0 ? matchBraces(blob, exprStart) : null;
    if (expr) {
      const innerStart = expr.body.indexOf('{');
      const inner = innerStart >= 0 ? matchBraces(expr.body, innerStart) : null;
      if (inner) {
        for (const pair of splitTopLevel(inner.body, ',')) {
          if (!pair.trim()) continue;
          const colon = splitTopLevel(pair, ':');
          if (colon.length < 2) continue;
          const prop = cssPropFromStyleKey(colon[0]);
          const { value, dynamic } = cleanStyleValue(colon.slice(1).join(':'));
          if (prop && value) decls.push({ prop, value, dynamic });
        }
      }
    }
  }

  // 字符串式：style="a: b; c: d"
  const strKey = blob.match(/style\s*=\s*("([^"]*)"|'([^']*)')/);
  if (strKey) {
    const css = strKey[2] ?? strKey[3] ?? '';
    for (const decl of splitTopLevel(css, ';')) {
      if (!decl.trim()) continue;
      const colon = splitTopLevel(decl, ':');
      if (colon.length < 2) continue;
      const prop = colon[0].trim();
      const { value, dynamic } = cleanStyleValue(colon.slice(1).join(':'));
      if (prop && value) decls.push({ prop, value, dynamic });
    }
  }

  return decls;
}

// ---- 从 className 表达式里取出所有 class token（支持模板字面量基础类 + 三元分支字符串）----
// 关键：模板字面量的「静态文本」整体作为基础 class（其中任意值含内层引号，如 font-["X"]，
// 不能再被引号扫描拆开）；只在 ${...} 插值段里扫描引号字符串（即条件分支的 class）。
function pushQuoted(seg, tokens) {
  for (const qm of seg.matchAll(/"([^"]*)"|'([^']*)'/g)) {
    tokens.push(...((qm[1] ?? qm[2]) || '').split(/\s+/));
  }
}
function classTokensFromExpr(expr) {
  const tokens = [];
  // 先消化所有模板字面量，并把它们从表达式中抹掉（避免静态文本里的内层引号被二次误抓）
  const rest = expr.replace(/`([^`]*)`/g, (_, tpl) => {
    const staticText = tpl.replace(/\$\{[^}]*\}/g, (interp) => {
      pushQuoted(interp, tokens); // 插值里的三元分支 class
      return ' ';
    });
    tokens.push(...staticText.split(/\s+/)); // 模板静态基础 class
    return ' ';
  });
  // 剩余的非模板表达式（如 {className || "..."} 或 {cond ? "a" : "b"}）
  pushQuoted(rest, tokens);
  return tokens.filter(Boolean);
}

// ---- 从 className 属性值里取出所有 class token（字符串字面量或 {表达式}）----
function classesFromAttr(blob) {
  const key = blob.match(/className\s*=\s*/);
  if (!key) return [];
  const at = key.index + key[0].length;
  const ch = blob[at];
  if (ch === '"' || ch === "'") {
    const end = blob.indexOf(ch, at + 1);
    if (end < 0) return [];
    return blob.slice(at + 1, end).split(/\s+/).filter(Boolean);
  }
  if (ch === '{') {
    const expr = matchBraces(blob, at);
    if (!expr) return [];
    return classTokensFromExpr(expr.body);
  }
  return [];
}

// ---- 解析 JSX 开标签；--node-id 命中后只收集该节点及子树 ----
const elements = [];
const layoutRisk = [];
const stack = [];
let matchedNodeFilter = !nodeIdFilter;

function popTag(tag) {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].tag === tag) {
      stack.splice(i);
      return;
    }
  }
}

for (const m of src.matchAll(/<\/?([A-Za-z][A-Za-z0-9]*)\b([^>]*?)\/?>/g)) {
  const full = m[0];
  const tag = m[1];
  const blob = m[2] || '';
  if (full.startsWith('</')) {
    popTag(tag);
    continue;
  }

  const nodeId = (blob.match(/data-node-id="([^"]*)"/) || [])[1] || null;
  const name = (blob.match(/data-name="([^"]*)"/) || [])[1] || null;
  const parentIncluded = stack.some((entry) => entry.include);
  const include = !nodeIdFilter || parentIncluded || nodeId === nodeIdFilter;
  const selfClosing = /\/\s*>$/.test(full) || VOID_TAGS.has(tag.toLowerCase());

  if (nodeId === nodeIdFilter) matchedNodeFilter = true;
  if ((/className\s*=/.test(blob) || /style\s*=/.test(blob)) && include) {
    const classes = classesFromAttr(blob);
    const styleDecls = styleDeclsFromAttr(blob);
    if (classes.length > 0 || styleDecls.length > 0) {
      const buckets = classify(classes);
      // 合并内联 style：布局类属性归人工/A4，其余归叶子（带 style 来源标注）
      for (const d of styleDecls) {
        if (LAYOUT_CSS_PROPS.has(d.prop)) {
          buckets.layout.push(`[style] ${d.prop}: ${d.value}`);
        } else {
          buckets.leaf.push({ prop: d.prop, value: d.value, note: d.dynamic ? 'style 动态值(${…}), 人工确认真值' : 'style 内联' });
        }
      }
      const risk = layoutRiskFor(classes, nodeId, name);
      if (risk) layoutRisk.push(risk);
      elements.push({ tag, nodeId, name, classes, ...buckets, layoutRisk: risk });
    }
  }
  if (!selfClosing) stack.push({ tag, include });
}

const rel = (() => { try { return relative(process.cwd(), file); } catch { return file; } })();

if (asJson) {
  console.log(JSON.stringify({
    file: rel,
    filter: { nodeId: nodeIdFilter, matched: matchedNodeFilter },
    elements,
    layoutRisk,
  }, null, 2));
  process.exit(0);
}

console.log(`== 期望属性表: ${rel} ==`);
if (nodeIdFilter) {
  console.log(`过滤 node-id: ${nodeIdFilter} (${matchedNodeFilter ? 'matched' : 'not found'})`);
}
console.log('(叶子属性=3c-auto 逐项比对; 布局项=人工按 A4 核对; 非标/未知=agent 人判)\n');

let anyUnknown = false;
let droppedTotal = 0;
for (const el of elements) {
  droppedTotal += (el.dropped?.length || 0);
}
for (const el of elements) {
  const head = el.nodeId ? `[node ${el.nodeId}]` : `[${el.tag} (无 node-id, wrapper)]`;
  console.log(`${head}${el.name ? ' ' + el.name : ''}`);
  if (el.leaf.length) {
    console.log('  叶子(自动比对):');
    for (const p of el.leaf) {
      console.log(`    ${p.prop}: ${p.value}${p.note ? '   ← ' + p.note : ''}`);
    }
  }
  if (el.layout.length) console.log(`  布局(人工/A4): ${el.layout.join(', ')}`);
  if (el.nonstd.length) console.log(`  非标(figma/shim): ${el.nonstd.join(', ')}`);
  if (el.unknown.length) { anyUnknown = true; console.log(`  未知(agent 人判): ${el.unknown.join(', ')}`); }
  if (el.layoutRisk) {
    const label = el.layoutRisk.severity === 'high' ? '高风险' : '警告';
    console.log(`  布局风险(${label}): ${el.layoutRisk.reason}`);
    console.log(`    处理: ${el.layoutRisk.action}`);
  }
  console.log('');
}

console.log(`共 ${elements.length} 个带样式元素。`);
console.log('用法：agent 拿「叶子」逐项比对生成代码（漏/错即修），布局项按 A4 人工核对，非标/未知逐个人判。');
if (anyUnknown) console.log('⚠ 存在「未知」类：必须逐个确认其设计含义后再落代码，不得忽略。');
if (droppedTotal) console.log(`（已忽略 ${droppedTotal} 个疑似非 class 的字符串字面量，如条件表达式里的 prop 取值，不计入属性表。）`);
if (layoutRisk.length) {
  console.log(`⚠ 存在 ${layoutRisk.length} 个 contents 布局风险：命中项不得把模块 reference 当几何事实源。`);
}
if (nodeIdFilter && !matchedNodeFilter) {
  console.log('⚠ 未在 .tsx 中找到指定 node-id；请确认使用的是该模块 reference .tsx，或导出更稳定的父级模块并登记 layoutRisk。');
}
process.exit(0);
