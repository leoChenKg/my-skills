#!/usr/bin/env node
// 资源前置预检（auto 模式 fail-fast）：在一键生成开跑前，确认项目代码引用的本地资源都已就位，
// 避免跑到一半才发现缺图。契合「用户先备齐资源」的前提，把 B7 的「逐单元 jit 人工提示」
// 升级为「一次性全量预检 + 清单」。
//
// 做三件事：
//   1. 模块图片节点盘点：从 .figma-to-code/preview/src/modules/*.tsx 统计需要本地资源的图片节点数（仅信息）。
//   2. 资源目录盘点：列出资源目录里现有的语义命名文件（仅信息）。
//   3. 实现引用校验（关键）：扫描项目代码里的本地资源引用（url()/src=/href/import），
//      逐个在「引用文件所在目录」或「资源目录」按文件名解析；缺失即列出并以非零码退出。
//
// 纯静态、零额外依赖。
//
// 用法:
//   node .agents/skills/figma-to-code/scripts/check-assets.mjs [--json]
//     [--code <dir>]...     要扫描引用的项目代码目录（可多次；默认自动探测 demo/src/app/pages）
//     [--assets <dir>]...   资源目录（可多次；默认自动探测 demo/assets/images 等）
//     [--modules <dir>]     模块 reference 目录（默认 .figma-to-code/preview/src/modules）

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename, extname, dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const codeDirs = [];
const assetDirs = [];
let modulesDir = null;

for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--json') continue;
  if (a === '--code') { codeDirs.push(args[++i]); continue; }
  if (a === '--assets') { assetDirs.push(args[++i]); continue; }
  if (a === '--modules') { modulesDir = args[++i]; continue; }
  if (a.startsWith('--')) { console.error(`未知参数: ${a}`); process.exit(2); }
}

const CODE_EXT = new Set(['.html', '.htm', '.css', '.scss', '.less', '.sass', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue', '.svelte', '.astro']);
const ASSET_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.ico', '.bmp']);
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.figma-to-code', '__tests__', '__snapshots__']);

const COMMON_CODE = ['demo', 'src', 'app', 'pages', 'public'];
const COMMON_ASSETS = ['demo/assets/images', 'demo/assets', 'src/assets/images', 'src/assets', 'public/images', 'public/assets', 'public', 'assets', 'static'];

function autoDirs(candidates) {
  return candidates.filter((d) => existsSync(join(process.cwd(), d)));
}

function walk(dir, exts, acc = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (IGNORE_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, exts, acc);
    else if (exts.has(extname(e.name).toLowerCase())) acc.push(full);
  }
  return acc;
}

// 从一段代码里抽取本地资源引用（跳过 http/https/data/blob 与 figma 在线链接）
function refsFromCode(text) {
  const refs = new Set();
  const add = (raw) => {
    if (!raw) return;
    let v = raw.trim().replace(/^['"]|['"]$/g, '');
    v = v.split(/[?#]/)[0]; // 去 query/hash
    if (!v) return;
    if (/^(https?:|data:|blob:|\/\/)/i.test(v)) return; // 在线/内联跳过
    if (!ASSET_EXT.has(extname(v).toLowerCase())) return; // 只看图片资源
    refs.add(v);
  };
  // url(...) —— CSS / inline style
  for (const m of text.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) add(m[2]);
  // src= / href= —— html / jsx 字符串字面量
  for (const m of text.matchAll(/\b(?:src|href|poster)\s*=\s*(['"])([^'"]+)\1/g)) add(m[2]);
  // import x from '....png' / new URL('....png', ...)
  for (const m of text.matchAll(/['"]([^'"]+\.(?:png|jpe?g|gif|webp|svg|avif|ico|bmp))['"]/gi)) add(m[1]);
  return [...refs];
}

const resolvedCode = codeDirs.length ? codeDirs : autoDirs(COMMON_CODE);
const resolvedAssets = assetDirs.length ? assetDirs : autoDirs(COMMON_ASSETS);
const resolvedModules = modulesDir || '.figma-to-code/preview/src/modules';

// 资源目录里的所有文件（按 basename 建索引，便于「按文件名匹配」）
const assetFiles = [];
const assetByBase = new Map();
for (const d of resolvedAssets) {
  for (const f of walk(join(process.cwd(), d), ASSET_EXT)) {
    const rel = relative(process.cwd(), f);
    assetFiles.push(rel);
    const b = basename(f).toLowerCase();
    if (!assetByBase.has(b)) assetByBase.set(b, rel);
  }
}

// 扫项目代码引用并校验存在性
const missing = [];
const referenced = new Set();
for (const d of resolvedCode) {
  for (const file of walk(join(process.cwd(), d), CODE_EXT)) {
    let text = '';
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    for (const ref of refsFromCode(text)) {
      referenced.add(ref);
      const base = basename(ref).toLowerCase();
      // 1) 相对引用文件所在目录解析
      const relPath = resolve(dirname(file), ref);
      // 2) 资源目录按 basename 匹配
      const found = (existsSync(relPath) && statSync(relPath).isFile()) || assetByBase.has(base);
      if (!found) {
        missing.push({ ref, from: relative(process.cwd(), file) });
      }
    }
  }
}

// 模块图片节点盘点（仅信息）
let moduleImgNodes = 0;
let moduleFiles = 0;
const moduleAssetHints = new Set();
{
  const dirAbs = join(process.cwd(), resolvedModules);
  for (const file of walk(dirAbs, new Set(['.tsx', '.jsx']))) {
    moduleFiles += 1;
    let text = '';
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    moduleImgNodes += (text.match(/<img\b/g) || []).length;
    for (const m of text.matchAll(/url\(\s*['"]?([^'")]+\.(?:png|jpe?g|gif|webp|svg|avif))['"]?\s*\)/gi)) {
      if (!/^https?:|^data:/i.test(m[1])) moduleAssetHints.add(m[1]);
    }
  }
}

const result = {
  ok: missing.length === 0,
  codeDirs: resolvedCode,
  assetDirs: resolvedAssets,
  modulesDir: resolvedModules,
  availableAssets: assetFiles.length,
  referencedCount: referenced.size,
  moduleFiles,
  moduleImgNodes,
  missing,
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

console.log('== 资源前置预检 ==\n');
console.log(`代码目录: ${resolvedCode.length ? resolvedCode.join(', ') : '（未找到，传 --code 指定）'}`);
console.log(`资源目录: ${resolvedAssets.length ? resolvedAssets.join(', ') : '（未找到，传 --assets 指定）'}`);
console.log(`资源文件: ${assetFiles.length} 个；模块文件: ${moduleFiles} 个，图片节点约 ${moduleImgNodes} 处。`);
console.log(`项目代码引用本地图片: ${referenced.size} 处。\n`);

if (missing.length) {
  console.error(`✗ 缺失 ${missing.length} 个被引用但找不到的资源：`);
  for (const m of missing) console.error(`  - ${m.ref}   ← 引用自 ${m.from}`);
  console.error('\n请按语义命名补齐到资源目录后重跑；auto 模式在此 fail-fast，不带病生成。');
  process.exit(1);
}

if (resolvedAssets.length === 0) {
  console.error('✗ 未发现任何资源目录。请用 --assets 指定，或确认资源已按语义命名放入项目。');
  process.exit(1);
}

console.log('✓ 项目代码引用的本地资源均已就位。');
if (moduleImgNodes > 0 && referenced.size === 0) {
  console.log(`提示：模块含约 ${moduleImgNodes} 处图片节点，但项目代码尚未引用任何本地图片——`);
  console.log('  若尚未生成代码属正常；生成后请重跑本预检确认引用闭合。');
}
process.exit(0);
