# 07 · 抽象执行闭环与反跳步模式

目标：用可迁移的模式说明模块事实源优先流程。不绑定任何具体 UI 场景；页面、区块、组件、局部修复都套同一套 gate。

## 结构与复用

```text
目标 node：<targetNodeId> <targetName>
工作单元：<moduleNodeId> <moduleName>
批次：batch-<n>
复用判定：复用现有实现 / 待新建 / 组合已建子单元
```

卡点 1 确认拆分、依赖、复用和批次后，才进入模块事实源预拉取。

## 2b 模块事实源预拉取

每个待建模块必须保存 Figma 导出的 reference `.tsx`：

```text
.figma-to-code/preview/src/modules/<moduleNodeIdSafe>.tsx
```

每个待建模块必须保存 reference preview：

```text
.figma-to-code/screenshots/<moduleNodeIdSafe>/reference-preview.png
```

每个待建模块必须登记 metadata/geometry：

```yaml
geometry:
  x: "<metadata.x>"
  y: "<metadata.y>"
  width: "<metadata.width>"
  height: "<metadata.height>"
```

运行属性抽取：

```bash
node .agents/skills/figma-to-code/scripts/extract-spec.mjs \
  .figma-to-code/preview/src/modules/<moduleNodeIdSafe>.tsx \
  --node-id <moduleNodeId>
```

`PROGRESS.md` 中每个待建模块都要有完整登记。只有所有模块都满足该结构，才能进入 `facts-ready`：

```yaml
currentGate: "facts-ready"
allowedNextAction: "start batch <n> 3a"
canEditProjectCode: true
requiredArtifacts:
  modules:
    - id: "<moduleNodeId>"
      nodeIdSafe: "<moduleNodeIdSafe>"
      name: "<moduleName>"
      batch: "<n>"
      referenceTsx: ".figma-to-code/preview/src/modules/<moduleNodeIdSafe>.tsx"
      referencePreview: ".figma-to-code/screenshots/<moduleNodeIdSafe>/reference-preview.png"
      metadata: ".figma-to-code/metadata/<moduleNodeIdSafe>.json"
      attributeCheck: "pass | see <artifact>"
      layoutRisk: "none | <reason>"
```

进入 3b 前必须运行：

```bash
node .agents/skills/figma-to-code/scripts/flow-guard.mjs --before 3b
```

## 3a / 3b 实现模式

3a 只确认本地事实源是否齐全；3b 只在 flow guard 通过后写项目代码。生成时逐项映射：

```text
reference .tsx 叶子属性     -> 项目样式 / token / 组件 props
metadata/geometry 几何信息 -> 外层布局、尺寸、坐标、父子组合关系
项目扫描结果               -> 复用已有组件或 token
本地资源目录               -> 按语义名引用现存资源
```

若 reference `.tsx` 有 `contents + left/top`、`relative contents` 等 layoutRisk，几何不能照抄，必须回到 metadata/geometry。

## 局部变更模式

用户中途提出任何局部修复、样式修正、交互补丁或资源替换时：

```text
先读 PROGRESS.md
  canEditProjectCode=false -> 不改项目代码，继续补缺失模块事实源
  canEditProjectCode=true  -> 作为当前批次修正处理，更新属性校验、preview 和卡点记录
```

局部变更不创建特殊通道；它只是在当前 gate 内执行同一套事实源和审核规则。

## 3c-auto 与 3c

3c-auto 对本批每个模块重新跑属性抽取：

```bash
node .agents/skills/figma-to-code/scripts/extract-spec.mjs \
  .figma-to-code/preview/src/modules/<moduleNodeIdSafe>.tsx \
  --node-id <moduleNodeId>
```

人工逐项核对叶子属性，未知项进入卡点。

3c 对照同一模块的两张图：

```text
.figma-to-code/screenshots/<moduleNodeIdSafe>/reference-preview.png
.figma-to-code/screenshots/<moduleNodeIdSafe>/implementation-preview.png
```

用户确认视觉、布局、间距、未知项后，才登记本批完成。

## 常见失败路径

- 只保存了 reference `.tsx`，没有 reference preview：不能进入 3b。
- 只完成部分待建模块 facts：不能进入 3b。
- `canEditProjectCode=false` 时处理局部变更请求：不能直接改项目代码。
- 把 Figma React+Tailwind reference 当成项目最终技术栈照抄：违规。
- `extract-spec` 报 layoutRisk 却照抄 reference 布局：违规。
- 没有 implementation preview 就宣称审核通过：违规。
