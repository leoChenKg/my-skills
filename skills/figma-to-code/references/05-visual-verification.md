# 05 · 模块事实源与视觉验证

目标：把视觉验证收敛成一条不可跳过的链路。默认事实源是 **每个待建模块自己的 reference `.tsx` + 真相基线 reference preview + metadata/geometry**，不是整稿 source。只有所有模块事实源齐全并通过 `flow-guard` 后，才允许进入 3b 写项目代码。

## 视觉真相基线 = Figma 原生截图（关键）

`reference-preview.png` 是**视觉对比的真相基线**，必须来自 **Figma 原生 `get_screenshot(nodeId)`**（Figma 自己渲染的设计像素），**不是**渲染导出 `.tsx` 再截图。原因：Figma 自动导出的 `.tsx` 本身会失真（`display:contents`、`col-N/row-N` 需 shim、伪字体、渐变写进 inline style、mask 等），拿它当基线会把失真烤进「标准答案」，使后续对比失去意义。

`.tsx` 渲染图（`reference-render.png`）降级为**可选的「基线自检」**：先与 Figma 原生基线比一次；若已不一致，说明导出/shim/字体不可靠，必须先修（补 shim/字体）或直接以原生基线为唯一依据——在污染链路前挡掉坏基线。

## 事实源工件

每个待建模块都必须有这些工件，并登记到 `.figma-to-code/PROGRESS.md`：

```text
.figma-to-code/preview/src/modules/<nodeIdSafe>.tsx
.figma-to-code/screenshots/<nodeIdSafe>/reference-preview.png      # 真相基线：Figma 原生 get_screenshot
.figma-to-code/screenshots/<nodeIdSafe>/reference-render.png       # 可选：.tsx 渲染图，用于基线自检
.figma-to-code/screenshots/<nodeIdSafe>/implementation-preview.png # 实现图：浏览器截 dev server
```

可选整稿工件只用于小节点优化或结构参考：

```text
.figma-to-code/preview/src/source/<targetNodeIdSafe>.tsx
.figma-to-code/screenshots/<targetNodeIdSafe>/source-reference-preview.png
```

- `module reference .tsx`：模块 `get_design_context` 原始导出，逐字保存，允许保留 Figma 在线资源链接。
- `reference-preview.png`：**Figma 原生 `get_screenshot(nodeId)`** 抓取的真相基线（高清、1x 内容、文字细线可辨）；是视觉对比的唯一标准。
- `reference-render.png`（可选）：渲染模块 `.tsx` 截得，仅用于「基线自检」，不作验收标准。
- `metadata/geometry`：来自 `get_metadata` 的模块尺寸、坐标、父子关系、可见性和组合几何；用于纠正 reference `.tsx` 的 layoutRisk。
- `implementation-preview.png`：项目代码渲染结果，只与同模块真相基线 `reference-preview.png` 对照。

## PROGRESS.md 状态机

`.figma-to-code/PROGRESS.md` 至少包含：

```yaml
mode: "strict"          # 或 "auto"（一键）；缺省 strict
pauseOn: [asset-missing, verify-fail, ambiguity]   # auto 模式下的暂停条件
currentGate: "facts-prefetching"
allowedNextAction: "prefetch remaining module facts"
canEditProjectCode: false
blockedUntil: "all requiredArtifacts.modules are complete and flow guard passes"
resourceBranch: "B"
assetsReady: false       # auto: check-assets.mjs 通过后置 true
requiredArtifacts:
  modules:
    - id: "<moduleNodeId>"
      nodeIdSafe: "<moduleNodeIdSafe>"
      name: "<moduleName>"
      batch: "<batchIndex>"
      referenceTsx: ".figma-to-code/preview/src/modules/<moduleNodeIdSafe>.tsx"
      referencePreview: ".figma-to-code/screenshots/<moduleNodeIdSafe>/reference-preview.png"
      metadata: ".figma-to-code/metadata/<moduleNodeIdSafe>.json"
      attributeCheck: "pass"
      layoutRisk: "none"
      visualCheck: "pending"   # auto: 通过自动视觉校验后置 pass/auto-pass
      reviewStatus: "pending"
```

允许的 `currentGate` 顺序（auto 模式多出 assets-ready/screenshots-ready/visual-pass）：

```text
initialized -> detected -> structure-approved -> reuse-done -> facts-prefetching -> facts-ready
  -> [auto: assets-ready -> screenshots-ready] -> batch-implementing -> [auto: visual-pass] -> batch-review -> done
```

进入 `facts-ready` 的条件：

1. 所有待建模块都登记在 `requiredArtifacts.modules`。
2. 每个模块都有存在的 `referenceTsx` 和 `referencePreview`。
3. 每个模块都有 `metadata` 文件或 `geometry` 记录。
4. 每个模块都有 `attributeCheck` 结果或 `layoutRisk` 记录。
5. `canEditProjectCode: true`。
6. `node .agents/skills/figma-to-code/scripts/flow-guard.mjs --before 3b` 通过。

## 2b 模块事实源预拉取

对步骤 1/2a 确认的每个待建模块执行：

1. 调用 `get_design_context(fileKey, nodeId)`。
2. 将返回的 React+Tailwind reference 代码逐字保存为 `.figma-to-code/preview/src/modules/<nodeIdSafe>.tsx`。
3. 保存或登记该模块的 metadata/geometry。几何以 `get_metadata` 为准；若 reference `.tsx` 有 `display: contents` 定位风险，不得用它当布局真相。
4. **抓取真相基线**：用 `get_screenshot(nodeId)`（1x 内容、高清）保存 `.figma-to-code/screenshots/<nodeIdSafe>/reference-preview.png`。auto 模式可选：渲染 `.tsx` 经 `shoot.mjs --label reference-render` 得 `reference-render.png`，用 `visual-diff.mjs` 与原生基线做基线自检。
5. 运行 `extract-spec.mjs` 并登记 `attributeCheck` 与 `layoutRisk`：

```bash
node .agents/skills/figma-to-code/scripts/extract-spec.mjs \
  .figma-to-code/preview/src/modules/<nodeIdSafe>.tsx \
  --node-id <nodeId>
```

6. 更新 `PROGRESS.md`。所有模块完成前保持 `currentGate: facts-prefetching` 和 `canEditProjectCode: false`。

整稿 `get_design_context` 是可选项。若使用整稿，也不能替代模块 facts gate；进入 3b 前仍必须保证待建模块 reference `.tsx` 和 reference preview 齐全。

## 3a 本地事实源确认

3a 不下载新代码，只确认本批模块本地 facts 可用：

```text
1. 读取 PROGRESS.md，声明 currentGate/canEditProjectCode/allowedNextAction。
2. 确认本批模块 referenceTsx 存在且可打开。
3. 确认 referencePreview 存在且清晰。
4. 确认 metadata/geometry 存在。
5. 确认 attributeCheck 或 layoutRisk 已登记。
6. 运行 flow guard；通过才进入 3b。
```

若截图采集环境不可用，卡点必须标注「截图采集降级」，要求用户确认同路径语义的 reference preview；不能把“服务无报错”当作视觉验证通过。

## 自动模式视觉/属性校验（mode=auto）

auto 模式用脚本替代人工 3c 的像素层与属性层，仅在失败/低置信时升级人工（见 [09-automation-pipeline.md](09-automation-pipeline.md)）：

1. **实现图**：`shoot.mjs --url <devserver> --id <nodeId> --label implementation-preview`（高 DPI、等渲染稳定、紧贴 `data-shoot-root`）。
2. **属性层**：`computed-diff.mjs` 用 `getComputedStyle` 比对 `extract-spec` 期望表（按 `data-node-id` 匹配；实现保留 `data-node-id` 时覆盖最好）。
3. **像素层**：`visual-diff.mjs` 把实现图与真相基线 `reference-preview.png` 比，超阈值判失败并出 diff 图。
4. **语义层**：agent 看 `reference-preview.png` + `implementation-preview.png` + `diff.png` 三图，判读布局/间距（VLM 兜底像素 diff 的误报/漏报）。
5. 通过 → 登记模块 `visualCheck: pass`；失败 → 带 diff 反馈重生成，至多 N 次仍不过则升级人工。

### 截图清晰度硬要求（贯穿所有截图）

模糊/降采样图会让对比失真，强制：

- Figma 原生基线：`get_screenshot` 取节点长边为 `maxDimension`、1x 内容、文字细线可辨。
- 浏览器截图：`shoot.mjs` 用 `deviceScaleFactor ≥ 2` 高 DPI 抓取，按模块 `w×h` 紧贴元素截，不截整页。
- 截图前等渲染稳定：`networkidle` + `document.fonts.ready`，禁用动画。
- 超长节点按模块边界分块，绝不用降采样整页图。
- `visual-diff.mjs` 开比前校验两图非空、非纯色、长宽比相近；模糊/空白/尺寸不符直接判失败，要求重截，不带病对比。

## 3c 人工审核（strict 模式 / auto 模式升级时）

3c 开始时保存项目实现截图：

- 框架项目：打开对应 dev server 路由。
- 纯静态项目：打开产出文件。
- Storybook 项目：打开对应 story iframe。
- 无现成载体：临时挂载，但不得绕过 `implementation-preview.png`。

审核内容：

1. 对照同一模块的 `reference-preview.png` 和 `implementation-preview.png`。
2. 人工复核布局、间距、定位、父子组合关系和隐藏节点影响。
3. 抽查 `extract-spec` 标出的未知/非标类、伪字体族和关键字值。
4. 复核不可见层：设计里存在的装饰层不能在实现中“等于没画”。

未通过则回到 3b 修正该批次，不得推进下一批。

## 卡点模板

```text
卡点：<gate/batch/unit>
- currentGate：
- canEditProjectCode：
- allowedNextAction：
- flow guard：通过 / 未通过（原因）
- 已完成模块事实源：
- 缺失模块事实源：
- reference preview：
- implementation preview：
- 属性校验 / layoutRisk：
- 资源 / 字体：
- 视觉结论：
- 约束自检：无违反 / 有破例（理由）
- 下一步唯一动作：
```

## 要点

- 视觉真相基线是 **Figma 原生 `get_screenshot`** 的 `reference-preview.png`，不是 `.tsx` 渲染图、也不是整稿图。
- `implementation-preview.png` 缺失时，不得做（人工或自动）审核结论。
- 截图对照不替代属性表；`extract-spec`/`computed-diff` 负责叶子属性，人工/VLM 负责布局/A4。
- 一切截图必须高清无模糊（见上「截图清晰度硬要求」），否则对比无意义。
- `facts-ready` 前禁止写项目代码，这是视觉验证链路的一部分，不是流程建议。
