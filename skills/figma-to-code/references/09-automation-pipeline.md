# 09 · 一键自动化编排（auto 模式）

目标：用户备齐资源后，一条龙跑完 0→5，把人工卡点换成自动校验 + 自愈循环，**仅在 `pauseOn` 列出的情形停下问人**。本文是 auto 模式的编排手册；strict 模式不读本文，照主工作流走。

> auto 模式只放宽「人工卡点」类约束（E1/E2/E4/E5/F1），其余约束（A 数据保真、B 资源、C 字体、D 复用、G 范围安全）一律不变；视觉真相基线必须是 Figma 原生 `get_screenshot`（见 [05](05-visual-verification.md)）。

## 前置条件

1. `PROGRESS.md` 顶层 `mode: auto`，并设 `pauseOn`（默认 `[asset-missing, verify-fail, ambiguity]`）。
2. `node scripts/check-mcp.mjs --auto` 通过（Figma + 浏览器截图能力均必需）。
3. `.figma-to-code/preview/` 由 `preview-template/` 初始化并装好依赖：`npm i -D playwright pixelmatch pngjs && npx playwright install chromium`。
4. 资源已按语义命名备齐（分支 B）。

## 暂停条件（pauseOn）

- `asset-missing`：`check-assets.mjs` 报缺资源。
- `verify-fail`：某模块自愈到迭代上限仍未过自动校验。
- `ambiguity`：复用命名映射不定、单元数异常、缺字体、`get_screenshot` 基线无法获取等需人判的情形。
- 命中即停下，按卡点模板报告（见 [05](05-visual-verification.md)），其余情况不停。

## 编排总览

```text
[预检]   check-mcp --auto  →  结构分析(get_metadata) 自动定稿(歧义才停)  →  复用判定(scan-components + search_design_system)
[事实源] 逐模块: get_design_context 存 .tsx + get_metadata 记几何 + get_screenshot 存 reference-preview.png(真相基线)
         + extract-spec 记 attributeCheck/layoutRisk        →  flow-guard --before screenshots-ready
[资源]   check-assets  →  assetsReady:true  →  flow-guard --before assets-ready
[闸门]   facts 齐 → currentGate=facts-ready, canEditProjectCode=true → flow-guard --before 3b
[登记]   gen-registry 写 registry.ts
[逐批]   每个模块跑「自愈循环」(见下)  →  全过则 flow-guard --before visual-pass
[组合]   拼装页面  →  整体校验(整页截图 + 复跑校验)  →  currentGate=done
```

## 每模块自愈循环（替代人工 3c）

```text
attempt = 0
loop:
  3b 生成/修正该模块项目代码（按 .tsx + metadata + 资源；建议保留 data-node-id 以启用属性级机械校验）
  shoot.mjs  --url <devserver> --id <id> --label implementation-preview   # 高 DPI、等渲染稳定、紧贴元素
  computed-diff.mjs --url <devserver> --id <id> --tsx <module.tsx>          # 叶子属性机械比对
  visual-diff.mjs   --baseline reference-preview.png --candidate implementation-preview.png  # 像素 diff vs 真相基线
  agent 看 reference-preview / implementation-preview / diff 三图做语义判读（布局/间距）
  若 三者皆通过:
     登记 visualCheck: pass，break
  否则 attempt += 1；attempt <= MAX(默认 3) 则带 diff/属性差异回到 3b 重生成
  否则 触发 verify-fail：停下报告该模块 + diff，升级人工
```

要点：
- `reference-preview.png` 是 Figma 原生真相基线；实现图永远跟它比，不跟 `.tsx` 渲染图比。
- `computed-diff` 按 `data-node-id` 匹配——实现保留 `data-node-id` 时覆盖最好；未保留则该模块以视觉层为准。
- `visual-diff` 阈值（`--max-mismatch`，默认 2%）与像素阈值（`--pixel-threshold`）按项目调参；字体/抗锯齿小差异由 VLM 判读区分真假。
- 任一截图模糊/空白/尺寸不符 → 直接判失败、重截，不带病对比。

## 各闸门与脚本对应

```text
assets-ready      ←  check-assets.mjs 通过 + PROGRESS.assetsReady:true
screenshots-ready ←  每模块 reference-preview.png（Figma 原生基线）就位
3b（写代码）      ←  facts-ready + canEditProjectCode:true（同 strict）
visual-pass       ←  每模块 attributeCheck/layoutRisk + visualCheck:pass
```

各闸门用 `node scripts/flow-guard.mjs --before <gate>` 强制；未过即停，不得跳过。

## 与 strict 模式的关系

- strict 是默认与回退：任何对自动校验的怀疑、或反复 `verify-fail`，都可切回 strict 走人工审核。
- auto 不改变事实源与数据保真要求；它只是把「谁来确认」从人换成「脚本 + 阈值 + VLM 判读，失败升级人工」。
- 质量上限取决于真相基线保真、截图清晰度、阈值与自愈是否收敛——这三者任一不达标，结论无效。

## 失败与升级

- `asset-missing` → 列缺失清单，请用户补齐后从 `assets-ready` 续跑。
- `verify-fail` → 给出该模块 reference/implementation/diff 三图 + 属性差异，请人工裁决或切 strict。
- `ambiguity` → 按具体歧义点提问（复用映射 / 字体 / 基线获取），确认后续跑。
