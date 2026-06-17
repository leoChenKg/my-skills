#!/usr/bin/env node
// 机械化叶子属性校验：把 extract-spec 从模块 .tsx 抽出的「期望叶子属性表」，
// 跟浏览器里实际渲染的 getComputedStyle 逐项比对（自动化 extract-spec 已覆盖的那一半）。
//
// 节点匹配：按 data-node-id 对齐 DOM 元素与期望表。
//   - 参考自检渲染(.tsx 在 preview) 必带 data-node-id → 覆盖好。
//   - 项目实现若保留 data-node-id 也可比；未保留则报 unmatched，退回视觉/人工。
//
// 仅比对「可靠可比」的子集：color/background-color/font-size/font-weight/line-height(数值)/
//   letter-spacing/text-align/opacity/border-radius/explicit width|height。
// 其余（渐变/阴影/mask/font-family/关键字 normal 等）标记 skipped，交视觉/人工。
//
// 依赖：playwright（截图同源）；extract-spec.mjs（同目录）。
//
// 用法:
//   node .agents/skills/figma-to-code/scripts/computed-diff.mjs --url http://localhost:5188 \
//     --id 1158:2143 --tsx .figma-to-code/preview/src/modules/1158-2143.tsx [--scale 1] [--tol 1.5] [--json]

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const getFlag = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const asJson = args.includes('--json');

const url = getFlag('--url');
const id = getFlag('--id');
const tsx = getFlag('--tsx');
const scale = Number(getFlag('--scale', '1')) || 1;
const tol = Number(getFlag('--tol', '1.5')); // px 容差
const selectorOnly = !args.includes('--no-only');

if (!url || !id || !tsx) { console.error('✗ 需要 --url、--id、--tsx'); process.exit(2); }
if (!existsSync(tsx)) { console.error(`✗ tsx 不存在: ${tsx}`); process.exit(2); }

// 可机械比对的属性 → 比较方式
const COMPARABLE = new Set([
  'color', 'background-color', 'font-size', 'font-weight', 'line-height',
  'letter-spacing', 'text-align', 'opacity', 'border-radius', 'width', 'height',
]);
// 期望属性名 → 实际读取的 computed 属性名
const READ_AS = {
  'border-radius': 'border-top-left-radius',
};

function loadPlaywright() {
  const paths = [join(process.cwd(), '.figma-to-code', 'preview'), process.cwd(), here];
  let r = null;
  try { r = require.resolve('playwright', { paths }); } catch { /* */ }
  if (!r) { try { r = require.resolve('playwright-core', { paths }); } catch { /* */ } }
  if (!r) { console.error('✗ 未找到 playwright。'); process.exit(3); }
  return import(pathToFileURL(r).href);
}

// 跑 extract-spec 拿期望表
function expectedTable() {
  const res = spawnSync('node', [join(here, 'extract-spec.mjs'), tsx, '--node-id', id, '--json'], { encoding: 'utf8' });
  if (res.status !== 0) { console.error('✗ extract-spec 失败:', res.stderr || res.stdout); process.exit(3); }
  const data = JSON.parse(res.stdout);
  // 收集每个有 nodeId 的元素的可比叶子属性
  const byNode = new Map();
  for (const el of data.elements || []) {
    if (!el.nodeId) continue;
    const props = [];
    for (const leaf of el.leaf || []) {
      if (COMPARABLE.has(leaf.prop) && !/normal|auto|none/i.test(String(leaf.value))) {
        props.push({ prop: leaf.prop, value: leaf.value });
      }
    }
    if (props.length) byNode.set(el.nodeId, props);
  }
  return byNode;
}

// 归一
function toRgb(v) {
  const s = String(v).trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) { const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16)); return [r, g, b]; }
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = s.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0], p[1], p[2]]; }
  if (s === 'white') return [255, 255, 255];
  if (s === 'black') return [0, 0, 0];
  return null;
}
const toNum = (v) => { const m = String(v).match(/-?[\d.]+/); return m ? parseFloat(m[0]) : null; };

function compare(prop, expected, actual) {
  if (prop === 'color' || prop === 'background-color') {
    const e = toRgb(expected); const a = toRgb(actual);
    if (!e || !a) return { ok: null, reason: 'color 解析不了，跳过' };
    const close = Math.abs(e[0] - a[0]) <= 2 && Math.abs(e[1] - a[1]) <= 2 && Math.abs(e[2] - a[2]) <= 2;
    return { ok: close };
  }
  if (prop === 'text-align') return { ok: String(expected).trim() === String(actual).trim() };
  if (prop === 'font-weight') return { ok: toNum(expected) === toNum(actual) };
  if (prop === 'opacity') { const e = toNum(expected); const a = toNum(actual); return { ok: e != null && a != null && Math.abs(e - a) <= 0.02 }; }
  // 其余按长度 px 容差
  const e = toNum(expected); const a = toNum(actual);
  if (e == null || a == null) return { ok: null, reason: '数值解析不了，跳过' };
  return { ok: Math.abs(e - a) <= tol };
}

const expected = expectedTable();
if (expected.size === 0) {
  const out = { ok: true, id, note: 'extract-spec 未产出可机械比对的叶子属性（可能全是关键字/布局/渐变），转视觉/人工。', checks: [] };
  if (asJson) console.log(JSON.stringify(out, null, 2)); else console.log(`(${id}) 无可机械比对的叶子属性，转视觉/人工。`);
  process.exit(0);
}

const pw = await loadPlaywright();
const chromium = pw.chromium || pw.default?.chromium;
if (!chromium) { console.error('✗ playwright 加载异常：未取到 chromium'); process.exit(3); }
const target = selectorOnly ? `${url}${url.includes('?') ? '&' : '?'}only=${encodeURIComponent(id)}` : url;

const browser = await chromium.launch();
const checks = [];
let mismatch = 0; let unmatched = 0;
try {
  const context = await browser.newContext({ deviceScaleFactor: scale });
  const page = await context.newPage();
  await page.goto(target, { waitUntil: 'load', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()));

  for (const [nid, props] of expected) {
    const readProps = props.map((p) => READ_AS[p.prop] || p.prop);
    const computed = await page.evaluate(({ nid, readProps }) => {
      const el = document.querySelector(`[data-node-id="${nid}"]`);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const out = {};
      for (const rp of readProps) out[rp] = cs.getPropertyValue(rp);
      return out;
    }, { nid, readProps });

    if (!computed) { unmatched += 1; checks.push({ nodeId: nid, matched: false }); continue; }
    for (const p of props) {
      const readKey = READ_AS[p.prop] || p.prop;
      const actual = computed[readKey];
      const r = compare(p.prop, p.value, actual);
      const rec = { nodeId: nid, prop: p.prop, expected: p.value, actual, ...r };
      if (r.ok === false) mismatch += 1;
      checks.push(rec);
    }
  }
} finally {
  await browser.close();
}

const matchedNodes = new Set(checks.filter((c) => c.matched !== false).map((c) => c.nodeId)).size;
const result = { ok: mismatch === 0, id, expectedNodes: expected.size, matchedNodes, unmatchedNodes: unmatched, mismatch, checks };

if (asJson) { console.log(JSON.stringify(result, null, 2)); process.exit(result.ok ? 0 : 1); }

console.log(`== 属性比对 (${id}) ==`);
for (const c of checks) {
  if (c.matched === false) { console.log(`  ? [${c.nodeId}] 实现里找不到该 data-node-id（未保留？转视觉/人工）`); continue; }
  const mark = c.ok === false ? '✗' : c.ok === null ? '—' : '✓';
  console.log(`  ${mark} [${c.nodeId}] ${c.prop}: 期望 ${c.expected} / 实际 ${c.actual}${c.reason ? '  (' + c.reason + ')' : ''}`);
}
console.log(`\n期望节点 ${expected.size}，匹配 ${matchedNodes}，未匹配 ${unmatched}，硬错配 ${mismatch}。`);
if (unmatched && !mismatch) console.log('提示：未匹配节点多说明实现未保留 data-node-id；auto 模式建议生成时保留以启用机械校验。');
process.exit(result.ok ? 0 : 1);
