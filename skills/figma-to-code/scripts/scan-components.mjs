#!/usr/bin/env node
// 实时扫描组件目录，输出现有可复用组件清单（组件名 + 路径）。
// 零配置：不读任何项目档案。代码即唯一真相源，每次扫描即最新。
//
// 组件根目录解析顺序：
//   1. CLI 参数 --root <dir>
//   2. 自动探测常见组件目录（首个存在者）
//   3. 默认 src/components
//
// 支持栈：TS/JS（barrel index 与具名/默认导出）、Vue SFC（按文件名）、RN（同 TS/JS）。
//
// 用法:
//   node .agents/skills/figma-to-code/scripts/scan-components.mjs [--root src/components] [--json]

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename, extname } from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const rootFlagIdx = args.indexOf('--root');
const rootFromFlag = rootFlagIdx >= 0 ? args[rootFlagIdx + 1] : null;

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue', '.svelte']);
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__tests__', '__snapshots__']);

// 自动探测的常见组件目录（按优先级）
const COMMON_DIRS = [
  'src/components',
  'components',
  'app/components',
  'src/ui',
  'src/component',
  'lib/components',
];

function resolveRoot() {
  if (rootFromFlag) return rootFromFlag;
  for (const d of COMMON_DIRS) {
    if (existsSync(join(process.cwd(), d))) return d;
  }
  return 'src/components';
}

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (IGNORE_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, acc);
    else if (CODE_EXT.has(extname(name))) acc.push(full);
  }
  return acc;
}

// 是否是合法组件名（PascalCase，首字母大写）
const isComponentName = (n) => /^[A-Z][A-Za-z0-9]*$/.test(n);

// 从单个文件抽取导出的组件名
function extractFromFile(file) {
  const ext = extname(file);
  const names = new Set();

  // Vue / Svelte SFC：组件名 = 文件名（PascalCase）；index 文件忽略
  if (ext === '.vue' || ext === '.svelte') {
    const base = basename(file, ext);
    if (base !== 'index' && isComponentName(base)) names.add(base);
    return [...names];
  }

  let src = '';
  try {
    src = readFileSync(file, 'utf8');
  } catch {
    return [];
  }

  // barrel 再导出: export { A, B as C } from '...'
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const token = part.trim().split(/\s+as\s+/i).pop()?.trim();
      if (token && isComponentName(token)) names.add(token);
    }
  }
  // 通配再导出: export * from './Card' → 用被导出文件名推断组件名
  for (const m of src.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g)) {
    const base = basename(m[1]).replace(/\.(t|j)sx?$/, '');
    if (base !== 'index' && isComponentName(base)) names.add(base);
  }
  // 具名声明导出: export const/function/class Name
  for (const m of src.matchAll(/export\s+(?:default\s+)?(?:const|function|class)\s+([A-Za-z0-9_]+)/g)) {
    if (isComponentName(m[1])) names.add(m[1]);
  }
  // export default <Name>（标识符形式）
  for (const m of src.matchAll(/export\s+default\s+([A-Za-z0-9_]+)\s*;?/g)) {
    if (isComponentName(m[1])) names.add(m[1]);
  }
  // 默认导出但匿名时，回退到文件名（index 除外）
  if (names.size === 0 && /export\s+default/.test(src)) {
    const base = basename(file, ext);
    if (base !== 'index' && isComponentName(base)) names.add(base);
  }
  return [...names];
}

const root = resolveRoot();
const rootAbs = join(process.cwd(), root);

if (!existsSync(rootAbs)) {
  const msg = `组件根目录不存在: ${root}\n用 --root 指定，或确认项目是否已有组件目录（常见：${COMMON_DIRS.join(' / ')}）。`;
  if (asJson) {
    console.log(JSON.stringify({ root, exists: false, components: [], error: msg }, null, 2));
  } else {
    console.error(msg);
  }
  process.exit(1);
}

const files = walk(rootAbs);
const componentMap = new Map(); // name -> 相对路径（首个出现）
for (const file of files) {
  for (const name of extractFromFile(file)) {
    if (!componentMap.has(name)) {
      componentMap.set(name, relative(process.cwd(), file));
    }
  }
}

const components = [...componentMap.entries()]
  .map(([name, path]) => ({ name, path }))
  .sort((a, b) => a.name.localeCompare(b.name));

if (asJson) {
  console.log(JSON.stringify({ root, exists: true, count: components.length, components }, null, 2));
  process.exit(0);
}

console.log(`== 可复用组件清单 (根目录: ${root}) ==\n`);
if (components.length === 0) {
  console.log('未扫描到组件。可能是空项目（原子层尚未建立），或用 --root 指定正确的组件目录。');
} else {
  const w = Math.max(...components.map((c) => c.name.length));
  for (const c of components) {
    console.log(`  ${c.name.padEnd(w)}  ${c.path}`);
  }
  console.log(`\n共 ${components.length} 个组件。生成 UI 前先在此清单查复用，命中则 import，未命中才新建。`);
}
process.exit(0);
