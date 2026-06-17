# 05 · 模块事实源与视觉验证

目标：把视觉验证收敛成一条不可跳过的链路。默认事实源是 **每个待建模块自己的 reference `.tsx` + reference preview + metadata/geometry**，不是整稿 source。只有所有模块事实源齐全并通过 `flow-guard` 后，才允许进入 3b 写项目代码。

## 事实源工件

每个待建模块都必须有这些工件，并登记到 `.figma-to-code/PROGRESS.md`：

```text
.figma-to-code/preview/src/modules/<nodeIdSafe>.tsx
.figma-to-code/screenshots/<nodeIdSafe>/reference-preview.png
.figma-to-code/screenshots/<nodeIdSafe>/implementation-preview.png
```

可选整稿工件只用于小节点优化或结构参考：

```text
.figma-to-code/preview/src/source/<targetNodeIdSafe>.tsx
.figma-to-code/screenshots/<targetNodeIdSafe>/source-reference-preview.png
```

- `module reference .tsx`：模块 `get_design_context` 原始导出，逐字保存，允许保留 Figma 在线资源链接。
- `reference-preview.png`：模块 reference `.tsx` 渲染或按模块边界截图得到，是默认视觉事实源。
- `metadata/geometry`：来自 `get_metadata` 的模块尺寸、坐标、父子关系、可见性和组合几何；用于纠正 reference `.tsx` 的 layoutRisk。
- `implementation-preview.png`：项目代码渲染结果，只与同模块 `reference-preview.png` 对照。

## PROGRESS.md 状态机

`.figma-to-code/PROGRESS.md` 至少包含：

```yaml
currentGate: "facts-prefetching"
allowedNextAction: "prefetch remaining module facts"
canEditProjectCode: false
blockedUntil: "all requiredArtifacts.modules are complete and flow guard passes"
resourceBranch: "B"
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
      reviewStatus: "pending"
```

允许的 `currentGate` 顺序：

```text
initialized -> detected -> structure-approved -> reuse-done -> facts-prefetching -> facts-ready -> batch-implementing -> batch-review -> done
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
4. 渲染模块 reference，保存 `.figma-to-code/screenshots/<nodeIdSafe>/reference-preview.png`。
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

## 3c 人工审核

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

## 截图清晰度

- `get_screenshot` 用于结构分析、资源导出、reference 辅助截图时必须 1x 清晰。
- 超长节点按模块边界截图；不要用降采样整页图作为模块实现或审核依据。
- 浏览器预览截图区域应与模块 metadata 尺寸/裁剪框一致。
- 文字或细线不可辨认时，重截或继续下钻模块。

## 要点

- 默认视觉事实源是模块 `reference-preview.png`，不是整稿图。
- `implementation-preview.png` 缺失时，不得做人工审核结论。
- 截图对照不替代属性表；`extract-spec` 负责叶子属性兜底，人工负责布局/A4。
- `facts-ready` 前禁止写项目代码，这是视觉验证链路的一部分，不是流程建议。
