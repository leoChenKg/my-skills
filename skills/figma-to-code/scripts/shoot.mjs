#!/usr/bin/env node
// 用 Playwright 对运行中的 dev server 做「高清晰、零模糊」的模块截图。
//
// 两类用途（取决于传入的 --url 指向哪个 server）：
//   - 实现图(implementation-preview)：指向项目 dev server / preview harness（按 ?only=<id> 隔离）。
//   - 参考自检图(reference-render)：指向 preview harness 渲染的模块 .tsx（用于和 Figma 原生基线自检）。
// 注意：真相基线 reference-preview.png 来自 Figma 原生 get_screenshot（由 agent 经 MCP 保存），不在本脚本职责内。
//
// 高清/防模糊措施：
//   - context.deviceScaleFactor ≥ 2（高 DPI 抓取），元素截图即按该倍率输出。
//   - 截图前 waitForLoadState('networkidle') + document.fonts.ready，并禁用动画/过渡。
//   - 截 [data-shoot-root] 元素本身（紧贴模块 w×h），不截整页、不降采样。
//   - 截完校验 PNG 非空、尺寸>0。
//
// 依赖：playwright（在 .figma-to-code/preview 或项目里安装）。
//
// 用法:
//   # 批量（读 registry，按 ?only=<id> 逐个截）
//   node .agents/skills/figma-to-code/scripts/shoot.mjs --url http://localhost:5188 \
//     --registry .figma-to-code/preview/src/registry.ts \
//     --label implementation-preview --outdir .figma-to-code/screenshots [--scale 2] [--ids 1158:2143,3468:16642]
//   # 单个
//   node .agents/skills/figma-to-code/scripts/shoot.mjs --url http://localhost:5188 \
//     --id 1158:2143 --out .figma-to-code/screenshots/1158-2143/implementation-preview.png [--w 343 --h 281]

import { existsSync, readFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);

function getFlag(name, def = null) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
}
const has = (name) => args.includes(name);

const url = getFlag('--url');
const registryPath = getFlag('--registry', '.figma-to-code/preview/src/registry.ts');
const label = getFlag('--label', 'implementation-preview');
const outdir = getFlag('--outdir', '.figma-to-code/screenshots');
const singleId = getFlag('--id');
const singleOut = getFlag('--out');
const idsFilter = getFlag('--ids');
const selector = getFlag('--selector', '[data-shoot-root]');
const scale = Number(getFlag('--scale', '2')) || 2;
const noOnly = has('--no-only'); // 项目页面若非 harness、无 ?only 路由
const singleW = Number(getFlag('--w', '0')) || 0;
const singleH = Number(getFlag('--h', '0')) || 0;

function usageExit(msg) {
  if (msg) console.error(`✗ ${msg}`);
  console.error('用法见脚本头注释。必填 --url；批量需 --registry，单个需 --id 与 --out。');
  process.exit(2);
}
if (!url) usageExit('缺少 --url');

const safe = (id) => id.replace(/[:]/g, '-');

// 解析 registry.ts 里的 { id, name, w, h }
function readRegistry(file) {
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8');
  const list = [];
  for (const m of text.matchAll(/\{\s*id:\s*['"]([^'"]+)['"][^}]*?\}/g)) {
    const block = m[0];
    const id = m[1];
    const w = Number((block.match(/\bw:\s*([\d.]+)/) || [])[1]) || 0;
    const h = Number((block.match(/\bh:\s*([\d.]+)/) || [])[1]) || 0;
    list.push({ id, w, h });
  }
  return list;
}

// 解析 playwright（优先 consumer 的 preview/node_modules）
function loadPlaywright() {
  const paths = [
    join(process.cwd(), '.figma-to-code', 'preview'),
    process.cwd(),
    dirname(fileURLToPath(import.meta.url)),
  ];
  let resolved = null;
  try { resolved = require.resolve('playwright', { paths }); } catch { /* try core */ }
  if (!resolved) { try { resolved = require.resolve('playwright-core', { paths }); } catch { /* none */ } }
  if (!resolved) {
    console.error('✗ 未找到 playwright。请在 .figma-to-code/preview 安装：npm i -D playwright 并 npx playwright install chromium');
    process.exit(3);
  }
  return import(pathToFileURL(resolved).href);
}

let targets;
if (singleId) {
  if (!singleOut) usageExit('单模块需 --out');
  targets = [{ id: singleId, w: singleW, h: singleH, out: singleOut }];
} else {
  let list = readRegistry(registryPath);
  if (!list.length) usageExit(`registry 为空或不存在: ${registryPath}`);
  if (idsFilter) {
    const want = new Set(idsFilter.split(',').map((s) => s.trim()));
    list = list.filter((e) => want.has(e.id));
  }
  targets = list.map((e) => ({ ...e, out: join(outdir, safe(e.id), `${label}.png`) }));
}

const pw = await loadPlaywright();
const chromium = pw.chromium || pw.default?.chromium;
if (!chromium) { console.error('✗ playwright 加载异常：未取到 chromium'); process.exit(3); }

const results = [];
let failed = 0;
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ deviceScaleFactor: scale });
  const page = await context.newPage();
  for (const t of targets) {
    const target = noOnly ? url : `${url}${url.includes('?') ? '&' : '?'}only=${encodeURIComponent(t.id)}`;
    const vw = Math.max(Math.ceil(t.w) + 40, 400);
    const vh = Math.max(Math.ceil(t.h) + 40, 400);
    await page.setViewportSize({ width: vw, height: vh });
    let entry = { id: t.id, out: t.out, ok: false };
    try {
      await page.goto(target, { waitUntil: 'load', timeout: 30000 });
      await page.addStyleTag({ content: '*{animation:none!important;transition:none!important;caret-color:transparent!important;}' });
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await page.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()));
      await page.waitForTimeout(120); // 让字体/图片落定
      const loc = page.locator(selector).first();
      const count = await loc.count();
      if (!count) throw new Error(`未找到选择器 ${selector}（确认 ?only 路由与 data-shoot-root）`);
      mkdirSync(dirname(resolve(t.out)), { recursive: true });
      await loc.screenshot({ path: t.out });
      const sz = statSync(t.out).size;
      if (!sz) throw new Error('截图为空');
      const box = await loc.boundingBox();
      entry = { id: t.id, out: t.out, ok: true, bytes: sz, cssW: box?.width ?? null, cssH: box?.height ?? null, scale };
    } catch (e) {
      entry.error = e.message;
      failed += 1;
    }
    results.push(entry);
  }
} finally {
  await browser.close();
}

if (has('--json')) {
  console.log(JSON.stringify({ ok: failed === 0, url, label, count: results.length, failed, results }, null, 2));
  process.exit(failed === 0 ? 0 : 1);
}

console.log(`== shoot (${label}, scale ${scale}x) ==`);
for (const r of results) {
  if (r.ok) console.log(`  ✓ ${r.id} → ${r.out}  (${Math.round(r.cssW)}×${Math.round(r.cssH)} css @${r.scale}x)`);
  else console.error(`  ✗ ${r.id} → ${r.error}`);
}
if (failed) { console.error(`\n${failed} 个截图失败。`); process.exit(1); }
console.log(`\n✓ ${results.length} 个截图完成，均非空。`);
process.exit(0);
