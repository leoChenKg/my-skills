---
name: figma-to-code
description: >-
  将 Figma 设计稿生成生产级前端代码，默认先按模块获取设计事实源，
  严格保证数据保真、复用既有组件、使用本地资源，并通过属性级校验、
  预览截图对照和强制人工审核卡点防止跳步。当用户提供 Figma 链接或
  node-id，要求实现、构建、生成页面/组件/设计稿代码，或提到
  design-to-code、Figma 转代码时使用。
---

# Figma 设计稿 → 可验证前端代码

把 Figma 设计转成「严格按设计稿事实源、模块分批、禁止跳步、复用既有组件、截图对照、人工审核」的前端代码。默认策略是 **模块事实源优先**：先拆模块，再把每个待建模块的 Figma reference `.tsx`、reference preview、metadata/属性校验证据准备完整；只有 `facts-ready` 后才允许写项目代码。

## 不可跳过执行合同

以下规则优先级最高，违反即停：

1. 每次开始或恢复任务，先读 `.figma-to-code/PROGRESS.md`；若文件不存在，只能做运行初始化，不能写项目代码。
2. 读完后必须声明：`currentGate`、`canEditProjectCode`、`allowedNextAction`。
3. 状态机固定为：`initialized -> detected -> structure-approved -> reuse-done -> facts-prefetching -> facts-ready -> batch-implementing -> batch-review -> done`。
4. `facts-ready` 之前，`canEditProjectCode` 必须是 `false`。
5. 只要任一待建模块缺少 reference `.tsx`、reference preview、metadata 几何信息、属性校验或 layoutRisk 记录，`canEditProjectCode=false`。
6. 进入 3b 写项目代码前，必须运行：`node .agents/skills/figma-to-code/scripts/flow-guard.mjs --before 3b`。在 skill 仓库内开发时，等价路径是 `node skills/figma-to-code/scripts/flow-guard.mjs --before 3b`。
7. flow guard 未通过，禁止创建或修改 `src/pages/...`、组件、样式、路由、资源引用等项目代码。
8. “已经读取了几个模块的 `get_design_context`”不等于 `facts-ready`；所有待建模块事实源齐全且登记后才算 ready。
9. 明确反例：只完成部分模块事实源，就开始创建或修改目标页面、组件、样式或路由文件，是严重违规。
10. 用户中途提出任何局部修复、样式修正、交互补丁或资源替换时，也必须先读 `PROGRESS.md`。若 `canEditProjectCode=false`，只能说明被 facts gate 阻塞，并继续补事实源；不能直接修。
11. 若已进入 `batch-implementing`，局部修复必须作为当前批次修正处理，并更新本批次属性校验、preview、卡点记录。
12. 每批卡点必须报告：当前 gate、已完成模块事实源、缺失模块、flow guard 结果、是否允许 3b、reference/implementation preview、约束自检、下一步唯一动作。

## 术语单一真相

- `nodeIdSafe = nodeId.replace(/[:]/g, '-')`。
- `targetNodeIdSafe`：用户目标 UI node 的安全名。
- `module reference .tsx`：步骤 2b 保存的模块 Figma 原始导出，路径 `.figma-to-code/preview/src/modules/<nodeIdSafe>.tsx`，是默认属性事实源。
- `reference-preview.png`：**Figma 原生 `get_screenshot` 抓取的模块真相基线**，路径 `.figma-to-code/screenshots/<nodeIdSafe>/reference-preview.png`，是视觉对比的唯一标准。
- `reference-render.png`：可选，渲染模块 `.tsx` 截得，仅用于「基线自检」，不作验收标准。
- `implementation-preview.png`：项目实现预览图，路径 `.figma-to-code/screenshots/<nodeIdSafe>/implementation-preview.png`。
- `source reference .tsx`：可选整稿参考，路径 `.figma-to-code/preview/src/source/<targetNodeIdSafe>.tsx`；只用于小节点优化、结构参考或用户明确要求，不是默认前提。
- `3a` 只确认本地事实源齐全可用；`3b` 才生成项目代码；`3c-auto` 做属性表比对；`3c` 做截图对照和人工审核。

## 全局约束（全流程强制遵守）

| 代号 | 规则 |
| --- | --- |
| **A 数据保真** | |
| A1 | 禁猜测/编造设计值；必须来自 `get_design_context`/`get_variable_defs`/`get_metadata`/`use_figma`。颜色和数值逐实例读真值，禁跨实例复制近似值。 |
| A2 | 取不到的值先用 `use_figma` 插件 API 读真实属性（`cornerRadius`/`fills`/`strokeWeight`/`opacity`/effects）；仍取不到才在卡点标待确认，禁先猜。 |
| A3 | 禁以“视觉接近”为由偏离设计数值。 |
| A4 | 间距/定位全方向逐一取值，禁假设对称/居中；间距归父容器，子单元零外边距。取值法见 [03](references/03-code-generation.md)。 |
| A5 | 关键字值（`normal`/`auto`/`none`）原样保留；设计未给的属性不新增。 |
| A6 | 步骤 2b 默认按模块逐个 `get_design_context`，逐字保存 reference `.tsx`；项目代码必须对照对应模块 `.tsx`，禁手抄、禁手工转 HTML、禁跳过模块事实源。 |
| A7 | 模块 `.tsx` 若出现 `contents + left/top/...` 或 `relative contents` 等 layoutRisk，只作叶子属性参考；布局几何回到 `get_metadata` 或稳定父级。 |
| **B 资源** | |
| B1 | 能 CSS 实现的禁切图（渐变/圆角/阴影/描边/纯色块/简单形状）。 |
| B2 | 项目代码禁写 Figma 在线链接，只引本地路径；reference `.tsx` 作为临时事实源可保留 Figma 链接。 |
| B3 | 资源准备走分支：默认 B 用户自备语义命名资源；分支 A agent 仅导出确定项，判断性决策交用户。见 [04](references/04-asset-handling.md)。 |
| B4 | 禁 base64 内联图片。 |
| B5 | 禁占位图或占位色块代替真实资源；同一资源按内容去重，禁为单个图标新增整套图标依赖包。 |
| B6 | 成品图尺寸/位置取设计摆放框，禁反推 Figma 内部坐标；背景填充图整图铺满。 |
| B7 | 3b 扫描用户资源目录，按语义名引用现存资源；缺失就地提示补齐。 |
| **C 字体** | |
| C1 | 禁自作主张替换字体；族/字重/字号严格按设计稿。 |
| C2 | 缺失字体记入清单并在卡点提醒；临时降级须显式标注。 |
| **D 组件复用** | |
| D1 | 禁重复造已有组件；生成前先跑 `scan-components.mjs` 并做设计系统搜索，命中则复用。 |
| D2 | Figma React+Tailwind 只是设计事实源，必须适配项目实际栈，禁照抄当终稿。 |
| D3 | 命名、目录结构、lint、格式化按项目既有约定。 |
| D4 | 禁过度组件化；无复用价值的简单图片/结构直接内联。 |
| D5 | 禁用超出项目兼容范围的 CSS/ES 语法；步骤 0 探测浏览器和构建目标。 |
| **E 流程/卡点** | |
| E1 | 禁跳过人工卡点擅自推进；未确认不进下一阶段。 |
| E2 | 禁一口气从头实现到尾；必须分批，做一批停一批。 |
| E3 | 禁跳过结构拆分和模块事实源直接写页面代码。 |
| E4 | 禁人工审核未通过就宣称完成或推进下一批。 |
| E5 | 每批开工前主动询问用户是否需补充信息/参考。 |
| **F 视觉/人工审核** | |
| F1 | 禁凭感觉宣称还原；每单元/批次必经 reference/implementation preview 人工视觉审核。 |
| F2 | 人工重点复核布局、间距、定位、未知/非标类和伪字体族映射；叶子属性由 F4 兜底。 |
| F3 | `get_screenshot` 既用于结构分析/资源导出，也用于抓取**模块真相基线 `reference-preview.png`**（验收基线）；一律 1x 内容、高清、文字细线可辨；超长节点按模块分块。一切截图禁模糊/降采样，否则对比无意义。 |
| F4 | 叶子样式属性须经 `extract-spec.mjs` 校验；未知/未解析项必须人工核对后才进审核。 |
| F5 | 禁静默丢弃设计层；装饰层 fill 近似父背景时回查真实色。 |
| F6 | 每个待建模块都必须保留 `reference-preview.png`（Figma 原生基线）与 `implementation-preview.png`。 |
| **G 范围/安全** | |
| G1 | 禁超出本次单元/批次范围擅自改动其他模块/文件。 |
| G2 | 禁删除或重构与当前任务无关的既有代码。 |
| G3 | 禁提交/推送代码，除非用户明确要求。 |

## 模式：strict（默认）/ auto（一键）

`PROGRESS.md` 顶层 `mode` 决定人工介入程度，缺省 `strict`：

- **strict（默认）**：保留全部人工卡点（F1/E1/E5 等照旧），原有保证不变。
- **auto（一键）**：用脚本自动化串起 0→5，把人工卡点换成自动校验，**仅在 `pauseOn` 列出的情形停下问人**（默认 `[asset-missing, verify-fail, ambiguity]`）。auto 模式对以下约束的执行方式做有限放宽，**其余约束（A 数据保真、B 资源、C 字体、D 复用、G 范围安全）一律不变**：
  - **E5（每批询问）**：资源已前置备齐并通过 `check-assets.mjs` 后，不再每批询问；遇 `ambiguity`（复用命名映射不定、单元数异常、缺资源/缺字体）才停。
  - **E2（禁一口气到尾）**：仍分批，但批与批之间由编排器自动推进，不等人工确认。
  - **F1/E1/E4（必经人工视觉审核）**：换成自动视觉+属性校验——`shoot.mjs` 截图、`computed-diff.mjs` 比叶子属性、`visual-diff.mjs` 与 Figma 原生基线做像素 diff、agent 看三图做语义判读；阈值内自动过（登记 `visualCheck: pass`），超阈值带 diff 反馈重生成，至多 N 次仍不过则升级人工（`verify-fail`）。
  - 自动模式新增闸门：`assets-ready`（资源预检过）、`screenshots-ready`（各模块 Figma 原生基线齐）、`visual-pass`（各模块自动校验过），由 `flow-guard.mjs --before <gate>` 强制。
- 完整一键编排、自愈循环、迭代上限与暂停条件见 [09-automation-pipeline.md](references/09-automation-pipeline.md)。

## 开工闸门

进入任一步骤（0/1/2a/2b/3a/3b/3c-auto/3c/3d/4/5）前必须：

1. 重读本文件的「不可跳过执行合同」和「全局约束」。
2. 读取 `.figma-to-code/PROGRESS.md`，声明 `currentGate`、`canEditProjectCode`、`allowedNextAction`；若尚未创建，只能做运行初始化。
3. 声明本步适用约束代号。
4. 若本步会进入 3b 或任何项目代码修改，先运行 flow guard；未通过即停。

## 默认工作流

```text
运行初始化
  -> 0 项目探测
  -> 1 结构分析（只拆模块/批次，不拉代码、不写代码）
     卡点 1：确认拆分/依赖/复用/批次
  -> 2a 复用判定（全层级先查后建）
  -> 2b 模块事实源预拉取（默认逐模块）
     卡点 2：所有模块 reference .tsx + preview + metadata + attribute/layoutRisk 记录齐全，flow guard 通过
  -> 3 逐批实现
     每批：E5 询问 -> 3a facts 确认 -> flow guard -> 3b 写代码 -> 3c-auto -> 3c 截图/人工审核 -> 3d 登记 -> 卡点
  -> 4 页面组合
  -> 5 整体校验
  -> 收尾清理
```

### 运行初始化

1. 确保 `.gitignore` 含 `.figma-to-code/`。
2. 建 `.figma-to-code/preview/`：把 skill 的 `preview-template/` 复制过去（已含带 `?only=<id>` 隔离路由、`data-shoot-root` 的 `App.tsx`、`main.tsx`、`index.html`、`vite.config.ts`、`styles.css`、`figma-shim.css`、`registry.ts` 占位与空 `src/modules/`）；在 preview 安装依赖。auto 模式还需 `npm i -D playwright pixelmatch pngjs && npx playwright install chromium`。模块 `.tsx` 落 `src/modules/` 后用 `gen-registry.mjs` 自动生成 `registry.ts`（勿手改）。
3. 建 `.figma-to-code/PROGRESS.md`，至少包含（`mode/pauseOn/assetsReady` 仅 auto 模式需要）：

```yaml
mode: "strict"        # 一键自动化用 "auto"
pauseOn: [asset-missing, verify-fail, ambiguity]
currentGate: "initialized"
allowedNextAction: "run project detection"
canEditProjectCode: false
blockedUntil: "structure, reuse, and all module facts are ready"
resourceBranch: "B"
assetsReady: false
requiredArtifacts:
  modules: []
```

### 0 项目探测

读 `package.json`、构建配置、tsconfig、browserslist、样式方案、资源目录；运行：

```bash
node .agents/skills/figma-to-code/scripts/check-mcp.mjs           # auto 模式加 --auto（要求浏览器截图能力）
node .agents/skills/figma-to-code/scripts/scan-components.mjs --json
```

在 skill 仓库内开发时，把路径替换为 `skills/figma-to-code/scripts/...`。探测细节见 [00](references/00-project-detection.md)。auto 模式自动化脚本（`check-assets.mjs`/`gen-registry.mjs`/`shoot.mjs`/`visual-diff.mjs`/`computed-diff.mjs`）与一键编排见 [09](references/09-automation-pipeline.md)。

### 1 结构分析

用 `get_metadata` 拿目标 node 树，拆成工作单元、依赖、复用候选、组合关系、批次。本步只拆结构，不探索资源，不拉 reference 代码，不写项目代码。输出卡点 1 给用户确认。详见 [01](references/01-structure-analysis.md)。

### 2a 复用判定

对每个工作单元先查现有代码和设计系统。命中则复用；未命中才进入待建模块列表。详见 [02](references/02-component-reuse.md)。

### 2b 模块事实源预拉取

默认对每个待建模块逐个执行：

1. `get_design_context(fileKey, nodeId)`，逐字保存到 `.figma-to-code/preview/src/modules/<nodeIdSafe>.tsx`。
2. `get_metadata` 或已保存 metadata 中记录该模块几何信息。
3. 用 `get_screenshot(nodeId)`（1x 内容、高清）抓取 Figma 原生真相基线，保存 `.figma-to-code/screenshots/<nodeIdSafe>/reference-preview.png`。auto 模式可选：渲染 `.tsx` 得 `reference-render.png` 并用 `visual-diff.mjs` 做基线自检。
4. 运行 `node .agents/skills/figma-to-code/scripts/extract-spec.mjs .figma-to-code/preview/src/modules/<nodeIdSafe>.tsx --node-id <nodeId>`；保存输出摘要或在 `PROGRESS.md` 记录 `layoutRisk`。
5. 在 `PROGRESS.md` 的 `requiredArtifacts.modules` 登记 `id`、`nodeIdSafe`、`referenceTsx`、`referencePreview`、`metadata`/`geometry`、`attributeCheck`、`layoutRisk`。
6. 全部模块齐全后，设置 `currentGate: "facts-ready"`、`canEditProjectCode: true`，并运行 `flow-guard --before 3b`。

整稿 `get_design_context` 只在小节点、用户明确要求或作为可选结构参考时使用；失败不应阻塞模块事实源路径。视觉验证细节见 [05](references/05-visual-verification.md)。

### 3 逐批实现

每批开始前先按 E5 询问用户是否需要补充信息。每批流程：

1. **3a facts 确认**：确认本批模块的 reference `.tsx`、reference preview、metadata/geometry、attribute/layoutRisk 记录存在且清晰。
2. **3b 代码生成**：先运行 `flow-guard --before 3b`；通过后才按模块 `.tsx` 和 metadata 生成项目代码。
3. **3c-auto**：对模块 reference `.tsx` 跑 `extract-spec.mjs`，逐项比对叶子属性，处理未知项和 layoutRisk。
4. **3c 人工审核**：截 `implementation-preview.png`，对照 `reference-preview.png`，用户确认后才推进。
5. **3d 登记**：更新 `PROGRESS.md`，进入下一批或页面组合。

### 4 页面组合

复用已通过审核的模块拼装页面；模块自身不带外边距，父容器负责各方向间距和对齐。组合前后仍要保留 preview 对照证据。

### 5 整体校验

整体运行项目检查、截图对照、属性抽查和人工审核。所有卡点通过后才可标记 `done`。

## 快速通道

单个组件或单个小改动可以合并步骤，但不能裁剪硬闸门：

- 仍需项目探测、模块 reference `.tsx`、reference preview、metadata/geometry、3a、flow guard、3b、3c-auto、3c。
- 如果主流程未到 `facts-ready`，任何局部修复、样式修正、交互补丁或资源替换都不能绕过 facts gate。
- 一旦牵出多个子单元或共享依赖，立即回完整流程。

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

## 完成定义

- `PROGRESS.md` 状态机完整，最终 `currentGate=done`。
- 所有待建模块都有 reference `.tsx`、reference preview、metadata/geometry、attribute/layoutRisk 记录。
- 进入 3b 前 `flow-guard --before 3b` 通过。
- 项目代码逐模块对照 reference `.tsx` 和 metadata 生成，未使用 Figma 在线链接。
- 每批都有 implementation preview、3c-auto 结果、人工审核结论和卡点记录。
- 资源、字体、兼容范围、lint/test/build 检查通过或在卡点明确降级。

## 参考文档路由

- 项目探测：[00-project-detection.md](references/00-project-detection.md)
- 结构拆分与批次：[01-structure-analysis.md](references/01-structure-analysis.md)
- 复用判定：[02-component-reuse.md](references/02-component-reuse.md)
- 代码生成和间距取值：[03-code-generation.md](references/03-code-generation.md)
- 资源处理：[04-asset-handling.md](references/04-asset-handling.md)
- 视觉验证和 `PROGRESS.md` 字段：[05-visual-verification.md](references/05-visual-verification.md)
- 多人协作：[06-team-workflow.md](references/06-team-workflow.md)
- 抽象执行闭环：[07-worked-example.md](references/07-worked-example.md)
- 属性校验：[08-attribute-verification.md](references/08-attribute-verification.md)
- 一键自动化编排（auto 模式）：[09-automation-pipeline.md](references/09-automation-pipeline.md)
