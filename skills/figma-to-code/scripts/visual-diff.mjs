#!/usr/bin/env node
// 两张模块截图的自动视觉比对（替代人工 3c 的像素层）：
//   - 基线自检：reference-render.png（.tsx 渲染）  vs  reference-preview.png（Figma 原生真相基线）
//   - 验收：    implementation-preview.png         vs  reference-preview.png（真相基线）
// 输出错配比例 + diff 图，按阈值判 pass/fail；像素层之外的布局/间距判读交给 agent(VLM) 看图。
//
// 防「带病对比」：
//   - 比对前校验两图非空、非纯色占位（疑似空白/未渲染直接判失败）。
//   - 尺寸不一致时把「被测图」按双线性缩放到「基线」尺寸再比（基线即真相，不缩基线）。
//   - 长宽比相差过大时告警（可能截错区域）。
//
// 依赖：pixelmatch + pngjs（随 preview 安装）。
//
// 用法:
//   node .agents/skills/figma-to-code/scripts/visual-diff.mjs \
//     --baseline .figma-to-code/screenshots/<safe>/reference-preview.png \
//     --candidate .figma-to-code/screenshots/<safe>/implementation-preview.png \
//     [--out .figma-to-code/screenshots/<safe>/diff.png] \
//     [--pixel-threshold 0.1] [--max-mismatch 0.02] [--json]

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const getFlag = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const asJson = args.includes('--json');

const baselinePath = getFlag('--baseline');
const candidatePath = getFlag('--candidate');
const outPath = getFlag('--out');
const pixelThreshold = Number(getFlag('--pixel-threshold', '0.1'));
const maxMismatch = Number(getFlag('--max-mismatch', '0.02'));

if (!baselinePath || !candidatePath) {
  console.error('✗ 需要 --baseline 与 --candidate'); process.exit(2);
}
for (const p of [baselinePath, candidatePath]) {
  if (!existsSync(p)) { console.error(`✗ 文件不存在: ${p}`); process.exit(2); }
}

function loadDep(name) {
  const paths = [join(process.cwd(), '.figma-to-code', 'preview'), process.cwd(), dirname(fileURLToPath(import.meta.url))];
  let r = null;
  try { r = require.resolve(name, { paths }); } catch { /* */ }
  if (!r) { console.error(`✗ 未找到依赖 ${name}。请在 .figma-to-code/preview 安装：npm i -D pixelmatch pngjs`); process.exit(3); }
  return import(pathToFileURL(r).href);
}

const pngMod = await loadDep('pngjs');
const pmMod = await loadDep('pixelmatch');
const PNG = pngMod.PNG || pngMod.default?.PNG || pngMod.default;
const pixelmatch = pmMod.default || pmMod;

const readPng = (p) => PNG.sync.read(readFileSync(p));

// 双线性缩放 RGBA
function resizeRGBA(src, sw, sh, dw, dh) {
  if (sw === dw && sh === dh) return src;
  const dst = Buffer.alloc(dw * dh * 4);
  const xr = sw / dw;
  const yr = sh / dh;
  for (let y = 0; y < dh; y += 1) {
    const sy = Math.min(sh - 1, y * yr);
    const y0 = Math.floor(sy); const y1 = Math.min(sh - 1, y0 + 1); const wy = sy - y0;
    for (let x = 0; x < dw; x += 1) {
      const sx = Math.min(sw - 1, x * xr);
      const x0 = Math.floor(sx); const x1 = Math.min(sw - 1, x0 + 1); const wx = sx - x0;
      const di = (y * dw + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        const p00 = src[(y0 * sw + x0) * 4 + c];
        const p10 = src[(y0 * sw + x1) * 4 + c];
        const p01 = src[(y1 * sw + x0) * 4 + c];
        const p11 = src[(y1 * sw + x1) * 4 + c];
        const top = p00 + (p10 - p00) * wx;
        const bot = p01 + (p11 - p01) * wx;
        dst[di + c] = Math.round(top + (bot - top) * wy);
      }
    }
  }
  return dst;
}

// 纯色/空白检测：采样若颜色方差极低 → 疑似空白占位
function isUniform(data, w, h) {
  const total = w * h;
  const step = Math.max(1, Math.floor(total / 4000));
  let min = [255, 255, 255], max = [0, 0, 0];
  for (let i = 0; i < total; i += step) {
    const o = i * 4;
    for (let c = 0; c < 3; c += 1) { if (data[o + c] < min[c]) min[c] = data[o + c]; if (data[o + c] > max[c]) max[c] = data[o + c]; }
  }
  const spread = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  return spread < 6; // 几乎单色
}

const baseImg = readPng(baselinePath);
const candImg = readPng(candidatePath);

const warnings = [];
const baseAspect = baseImg.width / baseImg.height;
const candAspect = candImg.width / candImg.height;
if (Math.abs(baseAspect - candAspect) / baseAspect > 0.1) {
  warnings.push(`长宽比差异较大 baseline=${baseAspect.toFixed(3)} candidate=${candAspect.toFixed(3)}（可能截错区域/裁切不一致）`);
}

const blankBase = isUniform(baseImg.data, baseImg.width, baseImg.height);
const blankCand = isUniform(candImg.data, candImg.width, candImg.height);

// 把 candidate 缩放到 baseline 尺寸（基线是真相，不缩基线）
const W = baseImg.width; const H = baseImg.height;
const candData = resizeRGBA(candImg.data, candImg.width, candImg.height, W, H);

const diff = new PNG({ width: W, height: H });
const numDiff = pixelmatch(baseImg.data, candData, diff.data, W, H, { threshold: pixelThreshold, includeAA: false });
const totalPixels = W * H;
const mismatch = numDiff / totalPixels;

const finalOut = outPath || join(dirname(resolve(baselinePath)), 'diff.png');
mkdirSync(dirname(resolve(finalOut)), { recursive: true });
writeFileSync(finalOut, PNG.sync.write(diff));

const hardFail = blankBase || blankCand;
const ok = !hardFail && mismatch <= maxMismatch;

const result = {
  ok,
  baseline: baselinePath,
  candidate: candidatePath,
  diff: finalOut,
  baselineSize: `${baseImg.width}x${baseImg.height}`,
  candidateSize: `${candImg.width}x${candImg.height}`,
  comparedAt: `${W}x${H}`,
  mismatchPixels: numDiff,
  mismatchRatio: Number(mismatch.toFixed(5)),
  maxMismatch,
  pixelThreshold,
  blankBaseline: blankBase,
  blankCandidate: blankCand,
  warnings,
};

if (asJson) { console.log(JSON.stringify(result, null, 2)); process.exit(ok ? 0 : 1); }

console.log('== 视觉比对 ==');
console.log(`基线:   ${baselinePath} (${result.baselineSize})`);
console.log(`被测:   ${candidatePath} (${result.candidateSize})`);
console.log(`对比于: ${result.comparedAt}，diff 图: ${finalOut}`);
console.log(`错配:   ${numDiff}px / ${totalPixels}px = ${(mismatch * 100).toFixed(2)}%（阈值 ${(maxMismatch * 100).toFixed(2)}%）`);
if (blankBase) console.error('✗ 基线疑似空白/纯色——无法作为对比真相，先确认 reference-preview.png 是有效的 Figma 原生截图。');
if (blankCand) console.error('✗ 被测疑似空白/纯色——实现可能未渲染/截错，先修再比。');
for (const w of warnings) console.log(`⚠ ${w}`);
if (ok) {
  console.log('\n✓ 像素层通过。注意：像素层之外的布局/间距仍需 agent 看 baseline+candidate+diff 三图判读。');
  process.exit(0);
}
console.error('\n✗ 未通过：带 diff 图反馈给生成步骤修正，或升级人工。');
process.exit(1);
