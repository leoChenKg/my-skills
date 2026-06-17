#!/usr/bin/env node
// MCP 前置检查：扫描已知 MCP 配置位置，确认 Figma MCP（必需）与浏览器截图能力（可选）是否配置。
// 注意：MCP 连接由 IDE/CLI 在运行时建立，Node 无法直接验证"连接是否活着"。
// 本脚本做的是"配置存在性"检查 + 安装引导，作为开工前的提醒。
// Figma MCP 为必需；浏览器截图能力仅在需要自动采集预览截图时可选（可降级为用户确认截图）。
// 注：资源分支 A（agent 协助导出）依赖 Figma MCP 的 get_screenshot，无需额外 MCP；
//     属性级自动校验（3c-auto / extract-spec.mjs）是纯静态 Node 脚本，零 MCP 依赖。
//
// 用法: node .agents/skills/figma-to-code/scripts/check-mcp.mjs [--json]

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const asJson = process.argv.includes('--json');
// auto（一键）模式：浏览器截图能力为必需（视觉/属性自动校验依赖它）；strict 模式仍为可选。
const autoMode = process.argv.includes('--auto') || process.argv.includes('--mode=auto') ||
  (() => { const i = process.argv.indexOf('--mode'); return i >= 0 && process.argv[i + 1] === 'auto'; })();

// 各工具的 MCP 配置常见位置（project 级优先于 user 级）
const CONFIG_PATHS = [
  { tool: 'Cursor (project)', path: join(process.cwd(), '.cursor', 'mcp.json') },
  { tool: 'Cursor (user)', path: join(homedir(), '.cursor', 'mcp.json') },
  { tool: 'Claude Code (project)', path: join(process.cwd(), '.mcp.json') },
  { tool: 'Claude Code (user)', path: join(homedir(), '.claude.json') },
  { tool: 'Codex (user)', path: join(homedir(), '.codex', 'config.toml') },
];

// 在一段文本里宽松匹配服务器关键字（兼容 json / toml / 不同命名）
function mentions(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

const FIGMA_KEYS = ['figma'];
const PLAYWRIGHT_KEYS = ['playwright'];

const results = [];
for (const { tool, path } of CONFIG_PATHS) {
  if (!existsSync(path)) continue;
  let text = '';
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    continue;
  }
  results.push({
    tool,
    path,
    figma: mentions(text, FIGMA_KEYS),
    playwright: mentions(text, PLAYWRIGHT_KEYS),
  });
}

// Figma / 浏览器截图能力也可能以 IDE 插件形式安装（非 mcp.json 配置）。
// 扫描 Cursor 插件缓存目录作为补充信号，避免对官方插件误报。
function pluginInstalled(keyword) {
  const pluginRoot = join(homedir(), '.cursor', 'plugins', 'cache');
  if (!existsSync(pluginRoot)) return false;
  try {
    const stack = [pluginRoot];
    let depth = 0;
    while (stack.length && depth < 5000) {
      depth++;
      const dir = stack.pop();
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (e.name.toLowerCase().includes(keyword)) return true;
        // 仅向下展开两层，命中插件名所在层级即可
        if (dir.split('/').length - pluginRoot.split('/').length < 2) {
          stack.push(join(dir, e.name));
        }
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

const figmaPlugin = pluginInstalled('figma');
const playwrightPlugin = pluginInstalled('playwright');
if (figmaPlugin) results.push({ tool: 'Cursor 插件', path: '~/.cursor/plugins/cache', figma: true, playwright: false });
if (playwrightPlugin && !results.some((r) => r.playwright)) {
  results.push({ tool: 'Cursor 插件', path: '~/.cursor/plugins/cache', figma: false, playwright: true });
}

const figmaOk = results.some((r) => r.figma) || figmaPlugin;
const playwrightOk = results.some((r) => r.playwright) || playwrightPlugin;

// 必需项：Figma 恒为必需；auto 模式下浏览器截图能力也必需。
const requiredOk = figmaOk && (!autoMode || playwrightOk);

if (asJson) {
  console.log(JSON.stringify({ mode: autoMode ? 'auto' : 'strict', figmaOk, playwrightOk, playwrightRequired: autoMode, requiredOk, configs: results }, null, 2));
  process.exit(requiredOk ? 0 : 1);
}

console.log('== MCP 前置检查 ==\n');
if (results.length === 0) {
  console.log('未发现任何 MCP 配置文件（已检查 Cursor / Claude Code / Codex 常见位置）。');
} else {
  for (const r of results) {
    console.log(`配置: ${r.tool}`);
    console.log(`  路径: ${r.path}`);
    console.log(`  Figma MCP:      ${r.figma ? '✓ 已配置' : '— 未发现'}`);
    console.log(`  浏览器截图能力: ${r.playwright ? '✓ 已配置' : '— 未发现'}`);
  }
}

console.log('\n== 结论 ==');
console.log(`模式: ${autoMode ? 'auto（一键）' : 'strict（人工）'}`);
console.log(`Figma MCP（必需）:        ${figmaOk ? '✓ 已配置' : '✗ 未配置'}`);
console.log(`浏览器截图能力（${autoMode ? '必需' : '可选'}）: ${playwrightOk ? '✓ 已配置' : (autoMode ? '✗ 未发现' : '— 未发现')}`);

if (!figmaOk) {
  console.log('\n缺失项安装引导：');
  console.log('- Figma MCP（必需）：在 Figma 桌面端开启 Dev Mode MCP Server，或安装官方 Figma MCP 插件并在 IDE 的 mcp 配置中加入 figma 服务器，然后完成 OAuth 授权。');
}

if (autoMode && !playwrightOk) {
  console.log('\n✗ auto（一键）模式要求浏览器截图能力（自动视觉/属性校验依赖）。安装其一：');
  console.log('  - 在 .figma-to-code/preview 安装 Playwright：npm i -D playwright pixelmatch pngjs && npx playwright install chromium');
  console.log('  - 或在 IDE 的 mcp 配置中加入 "@playwright/mcp"（npx -y @playwright/mcp@latest）。');
} else if (!playwrightOk) {
  console.log('\n提示：浏览器截图能力未发现（strict 模式下可选）。可降级为用户确认截图；一键自动校验请加 Playwright。');
}

if (!requiredOk) {
  console.log('\n提示：本检查只看配置存在性。即使显示已配置，仍需确认 IDE 中对应 MCP 已成功连接（无红点/报错）。');
  process.exit(1);
}

console.log(`\n必需项已满足（${autoMode ? 'Figma + 浏览器截图' : 'Figma'}）。请再确认 IDE 中显示为已连接状态后开工。`);
process.exit(0);
