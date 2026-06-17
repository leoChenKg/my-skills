#!/usr/bin/env node
// 自动生成 preview 的 registry.ts：扫描 .figma-to-code/preview/src/modules/*.tsx（待渲染模块的唯一真相），
// 为每个模块解析 id / name / 宽高，输出 registry.ts。去掉「每存一个模块就手工登记」这一步与漂移。
//
// 宽高/名字来源优先级（取第一个命中的）：
//   1. 现有 registry.ts 里已登记的同 id 条目（保留人工校准过的 w/h/name，幂等不丢）
//   2. PROGRESS.md 的 requiredArtifacts.modules（geometry.width/height、name）
//   3. metadata：.figma-to-code/metadata/<nodeIdSafe>.json（absoluteBoundingBox 等）
//   4. 模块 .tsx 根元素的 w-[Npx]/h-[Npx]/size-[Npx]
//   都取不到则 w/h=0（App 模板按自然尺寸渲染）并告警。
//
// 纯静态、零额外依赖。
//
// 用法:
//   node .agents/skills/figma-to-code/scripts/gen-registry.mjs [--json] [--dry] [--check]
//     [--preview <dir>]   preview 根（默认 .figma-to-code/preview）

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const dry = args.includes('--dry');
const check = args.includes('--check');
let previewDir = '.figma-to-code/preview';
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--preview') previewDir = args[++i];
}

const PROGRESS = '.figma-to-code/PROGRESS.md';
const safeToNode = (safe) => safe.replace(/-/g, ':');
const ident = (safe) => `M_${safe.replace(/[^\w]/g, '_')}`;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// ---- 现有 registry.ts：保留人工校准 ----
function parseExistingRegistry(file) {
  const map = new Map();
  if (!existsSync(file)) return map;
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { return map; }
  // 逐条 { id: '...', name: '...', Component: X, w: N, h: N }
  for (const m of text.matchAll(/\{\s*id:\s*['"]([^'"]+)['"][^}]*?\}/g)) {
    const block = m[0];
    const id = m[1];
    const name = (block.match(/name:\s*['"]([^'"]*)['"]/) || [])[1];
    const w = num((block.match(/\bw:\s*([\d.]+)/) || [])[1]);
    const h = num((block.match(/\bh:\s*([\d.]+)/) || [])[1]);
    map.set(id, { name, w, h });
  }
  return map;
}

// ---- PROGRESS.md：requiredArtifacts.modules（YAML 风格，可能不存在）----
function parseProgressModules(file) {
  const map = new Map();
  if (!existsSync(file)) return map;
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { return map; }
  const lines = text.split(/\r?\n/);
  let cur = null;
  const flush = () => { if (cur && (cur.id || cur.nodeIdSafe)) { const id = cur.id || safeToNode(cur.nodeIdSafe); map.set(id, cur); } cur = null; };
  for (const line of lines) {
    const li = line.match(/^\s*-\s+(id|nodeId|nodeIdSafe):\s*["']?([^"'#]+?)["']?\s*$/);
    if (li) { flush(); cur = {}; cur[li[1]] = li[2].trim(); continue; }
    if (!cur) continue;
    const kv = line.match(/^\s+(id|nodeId|nodeIdSafe|name|width|height|w|h):\s*["']?([^"'#]+?)["']?\s*$/);
    if (kv) { cur[kv[1]] = kv[2].trim(); continue; }
    const geo = line.match(/^\s+(?:width|height)\s*[:=]\s*([\d.]+)/);
    if (geo) continue; // geometry 子块的宽高在下面单独抓
    const gw = line.match(/^\s+width:\s*["']?([\d.]+)/); if (gw) cur.width = gw[1];
    const gh = line.match(/^\s+height:\s*["']?([\d.]+)/); if (gh) cur.height = gh[1];
  }
  flush();
  return map;
}

// ---- metadata json：absoluteBoundingBox / size ----
function geomFromMetadata(safe) {
  const p = join(process.cwd(), '.figma-to-code', 'metadata', `${safe}.json`);
  if (!existsSync(p)) return null;
  let j;
  try { j = JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
  const find = (o) => {
    if (!o || typeof o !== 'object') return null;
    const box = o.absoluteBoundingBox || o.absoluteRenderBounds || o.size || o;
    if (box && num(box.width) && num(box.height)) return { w: num(box.width), h: num(box.height) };
    for (const v of Object.values(o)) { const r = find(v); if (r) return r; }
    return null;
  };
  return find(j);
}

// ---- 模块 .tsx 根：w-[Npx]/h-[Npx]/size-[Npx] ----
function geomFromTsx(text) {
  const w = (text.match(/\bw-\[(\d+(?:\.\d+)?)px\]/) || [])[1];
  const h = (text.match(/\bh-\[(\d+(?:\.\d+)?)px\]/) || [])[1];
  const size = (text.match(/\bsize-\[(\d+(?:\.\d+)?)px\]/) || [])[1];
  const W = num(w) ?? num(size);
  const H = num(h) ?? num(size);
  if (W && H) return { w: W, h: H };
  return null;
}

function nameFromTsx(text) {
  return (text.match(/data-name="([^"]*)"/) || [])[1] || null;
}

// ---- 主流程 ----
const previewAbs = join(process.cwd(), previewDir);
const modulesAbs = join(previewAbs, 'src', 'modules');
const registryPath = join(previewAbs, 'src', 'registry.ts');

if (!existsSync(modulesAbs)) {
  const msg = `模块目录不存在: ${relative(process.cwd(), modulesAbs)}（确认 preview 已初始化，或用 --preview 指定）`;
  if (asJson) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
  else console.error(`✗ ${msg}`);
  process.exit(2);
}

const existing = parseExistingRegistry(registryPath);
const progress = parseProgressModules(PROGRESS);

const files = readdirSync(modulesAbs)
  .filter((f) => /\.(tsx|jsx)$/.test(f) && f !== 'index.tsx')
  .sort();

const entries = [];
const warnings = [];
for (const f of files) {
  const safe = basename(f).replace(/\.(tsx|jsx)$/, '');
  const id = safeToNode(safe);
  let text = '';
  try { text = readFileSync(join(modulesAbs, f), 'utf8'); } catch { /* ignore */ }

  const ex = existing.get(id) || {};
  const pg = progress.get(id) || {};
  const meta = geomFromMetadata(safe);
  const tsxGeom = geomFromTsx(text);

  const w = ex.w ?? num(pg.width ?? pg.w) ?? meta?.w ?? tsxGeom?.w ?? 0;
  const h = ex.h ?? num(pg.height ?? pg.h) ?? meta?.h ?? tsxGeom?.h ?? 0;
  const name = ex.name || pg.name || nameFromTsx(text) || id;

  if (!w || !h) warnings.push(`${id} (${f}) 宽高未知 → 置 0，按自然尺寸渲染；建议在 PROGRESS/metadata 补 geometry`);

  entries.push({ id, safe, file: f, name, w, h, importName: ident(safe) });
}

// 生成 registry.ts 文本
function genText(list) {
  const imports = list.map((e) => `import ${e.importName} from './modules/${e.safe}'`).join('\n');
  const rows = list.map((e) => {
    const nm = String(e.name).replace(/'/g, "\\'");
    return `  { id: '${e.id}', name: '${nm}', Component: ${e.importName}, w: ${e.w}, h: ${e.h} },`;
  }).join('\n');
  return `import type { ComponentType } from 'react'
${imports}

// 本文件由 scripts/gen-registry.mjs 自动生成，请勿手改；改模块后重跑该脚本。
export interface ModuleEntry {
  id: string
  name: string
  Component: ComponentType<{ className?: string }>
  w: number
  h: number
}

export const registry: ModuleEntry[] = [
${rows}
]
`;
}

const out = genText(entries);
const prev = existsSync(registryPath) ? readFileSync(registryPath, 'utf8') : '';
const inSync = prev.trim() === out.trim();

if (asJson) {
  console.log(JSON.stringify({ ok: true, registryPath: relative(process.cwd(), registryPath), count: entries.length, inSync, warnings, modules: entries.map(({ id, name, w, h, file }) => ({ id, name, w, h, file })) }, null, 2));
  if (check && !inSync) process.exit(1);
  process.exit(0);
}

if (check) {
  if (inSync) { console.log(`✓ registry.ts 与模块目录一致（${entries.length} 个）`); process.exit(0); }
  console.error(`✗ registry.ts 与模块目录不一致，请重跑 gen-registry.mjs 生成。`);
  process.exit(1);
}

if (!dry) writeFileSync(registryPath, out, 'utf8');

console.log(`${dry ? '[dry] ' : ''}registry.ts ${dry ? '将含' : '已写入'} ${entries.length} 个模块: ${relative(process.cwd(), registryPath)}`);
for (const e of entries) console.log(`  ${e.id}  ${e.w}×${e.h}  ${e.name}  (${e.file})`);
if (warnings.length) {
  console.log('\n⚠ 警告:');
  for (const w of warnings) console.log(`  - ${w}`);
}
process.exit(0);
