# 05 · 视觉验证（reference preview + implementation preview + 人工审核）

目标：把视觉验证收敛为一条稳定链路：步骤 2.5 优先渲染目标 UI node 整稿 source `.tsx` 得到 `source-reference-preview.png`，再为每个单元派生 `reference-preview.png`；步骤 3c 渲染生成代码得到 `implementation-preview.png`，人工对照单元 reference/implementation 两张截图，必要时回看整稿 source 参照；叶子属性仍由 `extract-spec.mjs` 的期望表兜底。**不做像素级自动对比**，避免字体抗锯齿、浏览器差异和资源加载时序造成误报。

> **为什么不再手工转 HTML 快照**：把 React+Tailwind 导出手工逐行转 HTML 会引入失真，例如漏转 Figma 的非标类、误折叠复杂角标、把保真源当成了重画。直接保存整稿 source `.tsx` 让 React 自己渲染，才能把 reference preview 作为视觉参照。

> 开工闸门：审核/取数据源前回到 SKILL.md 重读「全局约束」，声明本步适用 A6 / F1 / F2 / F3 / F6 再动手。

## 目录

- [事实源与截图工件](#一事实源与截图工件)
- [PROGRESS 与卡点模板](#二progressmd-与卡点模板)
- [UI 真实数据源](#三ui-真实数据源25-统一预拉取)
- [3a 本地事实源确认](#四3a-本地事实源确认)
- [3c 人工审核](#五3c-人工审核)
- [截图清晰度](#六截图清晰度f3仅用于分析资源场景)

## 一、事实源与截图工件

整稿 source 与每个待新建单元都要保留截图证据，统一放在：

```text
.figma-to-code/screenshots/<targetNodeIdSafe>/
  source-reference-preview.png

.figma-to-code/screenshots/<nodeIdSafe>/
  reference-preview.png
  implementation-preview.png
```

- `nodeIdSafe = nodeId.replace(/[:]/g, '-')`，例如 `2507:10307` 写入 `2507-10307/`。
- `source-reference-preview.png`：步骤 2.5 中，浏览器渲染 `.figma-to-code/preview/src/source/<targetNodeIdSafe>.tsx` 后保存。它来自用户目标 UI node 的整稿 Figma 原始 `.tsx` 预览，是默认视觉事实源。
- `reference-preview.png`：单元审核用参考图，优先从整稿 source preview 按 `get_metadata` 坐标裁剪/定位生成，或由本地 preview 高亮/截取对应 `data-node-id` 区域生成。只有合规 fallback 时才来自稳定父级/模块 `.tsx` 渲染。
- `implementation-preview.png`：步骤 3c 中，按项目实际载体渲染生成代码后保存。载体可为静态文件、dev server 路由、Storybook story 或临时挂载页面。
- `PROGRESS.md` 必须记录 `exportMode`、`sourceReferenceTsx`、`sourceReferencePreview`、每个单元的 reference/implementation preview 路径、attribute check、review status、失败/过期重拉项；若 fallback，必须记录 `fallbackReason`。

截图对照不替代属性表：截图擅长抓整体布局、间距、资源、层缺失和明显观感偏差；`extract-spec.mjs` 擅长抓圆角、字号、行高、颜色、关键字值、overflow 等截图不稳定或不明显的叶子属性。脚本只承诺支持模式的确定性抽取，未知/未解析项必须人工核对；两条都必须通过，或在卡点明确差异/降级原因。

## 二、PROGRESS.md 与卡点模板

`.figma-to-code/PROGRESS.md` 至少记录这些字段，字段名可按项目习惯微调，但信息不可缺：

```yaml
current_step: "3 / batch-1"
resource_branch: "B"
exportMode: "whole-node | fallback-modules"
fallbackReason: ""
source:
  id: "1809:5562"
  nodeIdSafe: "1809-5562"
  sourceReferenceTsx: ".figma-to-code/preview/src/source/1809-5562.tsx"
  sourceReferencePreview: ".figma-to-code/screenshots/1809-5562/source-reference-preview.png"
  registry: "registered"
units:
  - id: "2507:10307"
    nodeIdSafe: "2507-10307"
    status: "prefetched | implemented | reviewed"
    sourceNodePath: "source/1809-5562.tsx#data-node-id=2507:10307"
    referencePreview: ".figma-to-code/screenshots/2507-10307/reference-preview.png"
    implementationPreview: ".figma-to-code/screenshots/2507-10307/implementation-preview.png"
    attributeCheck: "not-run | pass | fail | manual-unknown"
    layoutRisk: "none | high | warning"
    reviewStatus: "pending | pass | fail | degraded"
    notes: "缺资源/缺字体/降级原因"
```

每批卡点统一按这个形状汇报，避免漏掉视觉或属性证据：

```text
卡点：批次 <n> / 单元 <nodeId>
- exportMode：whole-node / fallback-modules；fallbackReason：<无或原因>
- source reference：.figma-to-code/screenshots/<targetNodeIdSafe>/source-reference-preview.png
- 属性校验：通过 / 不通过 / 降级；未知/未解析项：<已核对项或无>
- layoutRisk：无 / high / warning；处理：<无或几何回到 source/get_metadata>
- reference preview：.figma-to-code/screenshots/<nodeIdSafe>/reference-preview.png
- implementation preview：.figma-to-code/screenshots/<nodeIdSafe>/implementation-preview.png
- 视觉结论：通过 / 不通过 / 降级；差异：<布局/间距/资源/层缺失>
- 资源/字体：齐全 / 待补 <项>
- 约束自检：无违反 / 有破例 <理由>
- 下一步：进入 3d / 回 3b 修正 / 等用户补资源
```

## 三、UI 真实数据源（2.5 整稿预拉取）

### 本质：优先保存目标 UI node 整稿导出 .tsx，用 React 渲染

- **整稿优先、逐字保存、零修改**：步骤 2.5 把用户目标 UI node 的 `get_design_context` 返回代码原封不动存为 `.figma-to-code/preview/src/source/<targetNodeIdSafe>.tsx`，所有类名/样式值、DOM 结构、嵌套层级、文案原样保留。这份 source `.tsx` 是默认属性事实源；其 React 运行时渲染是默认视觉参照。
- **单元从整稿派生**：每个工作单元按 `data-node-id` 从 source `.tsx` 定位子树；单元 reference preview 从整稿 preview 按 `get_metadata` 坐标裁剪/定位生成，或由本地 preview 高亮/截取。不要默认对每个单元重新 `get_design_context`。
- **fallback 先记录后导出**：只有整稿失败/超时/截断、整稿 `.tsx` shim 后仍不可编译、或整稿截图无法清晰分块时，才写 `exportMode: fallback-modules` 与 `fallbackReason` 后导出稳定父级/模块；目标本身是单组件时，该组件就是整稿 source，不再拆更小。
- **禁止**：优化、重构、合并、删冗余、改单位、调值、替换字体、补设计未给的值、把 `leading-[normal]` 之类关键字具体化成数字（A5）。
- **图片/资源直接用 Figma 导出的在线链接**：preview 是临时事实源产物，不依赖用户提前准备的本地资源。Figma asset URL 约 7 天过期，若实现期发现 source `.tsx` 图链或 source preview 失效，优先重拉目标 UI node 整稿 source；只有合规 fallback 时才单点重拉稳定父级/模块。
- **`.tsx` 缺数值属性时用 `use_figma` 读真值**：`get_design_context` 对 `VECTOR`/扁平图导出常缺 `cornerRadius`/`strokeWeight`/`fills`/`opacity`/effects 等，此时用 `use_figma` 插件 API 读节点真实属性补齐（A2），禁先写猜测值。详见 [03-code-generation.md](03-code-generation.md)。

### 一次性预览服务（`.figma-to-code/preview/`，已 gitignore）

独立子包（`package.json` `type:module`，避免与根包冲突），依赖 `vite` `react` `react-dom` `@vitejs/plugin-react` `tailwindcss` `@tailwindcss/vite`（v4）：

- `src/source/<targetNodeIdSafe>.tsx`：目标 UI node 整稿 Figma 原始导出逐字保存（默认导出组件）。
- `src/modules/<nodeIdSafe>.tsx`：仅用于合规 fallback 的稳定父级/模块导出，不作为默认下载目标。
- `src/registry.ts`：支持两类条目：`source`（整稿 source）和 `unit`（从 source 派生的单元视图或 fallback 模块）。派生 `unit` 不得触发新的 Figma 下载。
- `src/App.tsx`：从注册表渲染 source；单元预览通过定位/裁剪/高亮 source 中对应 node 区域生成。fallback 模块仍包在 `position:relative` + 设计稿 `w/h` 的定位容器里（Figma root 常是 `contents` 无尺寸，需有尺寸的定位祖先才撑得开）。
- `src/styles.css`：`@import "tailwindcss";` + `@font-face`（指向项目或临时预览字体路径）。
- `src/figma-shim.css`：非标 Tailwind 兜底层（见下）。
- 启动：`npm i` 后跑本地 Vite。若字体在 preview 根之外，`vite.config` 需设置 `server.fs.allow` 放开仓库根。

### 已知坑：Figma 导出不是标准 Tailwind

Figma 的导出夹带非标类，标准 Tailwind 不认会丢类导致布局塌陷。必须配一层一次性全局 `figma-shim.css`：

- **网格定位 `col-N`/`row-N`**：标准 Tailwind 不存在，shim 里补 `.col-1{grid-column:1}` `.row-1{grid-row:1}`（覆盖到出现的 N）。
- **字体伪族名 `font-['zihunxinquhei:Regular']`**：带冒号/变体后缀，映射不回真实族。shim 用属性选择器兜底到真实字体族。
- **transform（`rotate-150`/`-rotate-30`/`-scale-y-100`）**：逐一渲染验证；不生效的在 shim 用 `@layer utilities` 补等值实现，或保存 `.tsx` 时做等值替换。
- **SVG `<img>` 的 `var(--fill-N, fallback)`**：若兜底色不对，优先回查真实属性，必要时内联处理。
- **`display: contents` 承担定位职责**：fallback 分模块导出中若出现 `contents + left/top/right/bottom/inset/margin` 或 `relative contents`，reference preview 可能因 wrapper 不生成盒而丢偏移。此时该 fallback 只作叶子属性参考，几何回到整稿/稳定父级导出和 `get_metadata` 坐标。

## 四、3a 本地事实源确认

source `.tsx`、registry、source/unit reference preview 已在 2.5 预拉取/派生并登记，3a 不再下载全量代码，只确认本地事实源可用：

```text
0. 确认 source .tsx 已在 2.5 存好：preview/src/source/<targetNodeIdSafe>.tsx
1. 确认 registry 已登记 source，并记录 exportMode；fallback 时有 fallbackReason
2. 起 preview 服务，确认 source 编译无错、字体/图片请求可用、终端无 error
3. 确认本单元 node 可在 source .tsx 中按 data-node-id 定位；fallback 时确认使用稳定父级/模块
4. 确认 source-reference-preview.png 与 screenshots/<nodeIdSafe>/reference-preview.png 存在且清晰可打开
5. 若图链或截图失效：优先对目标 UI node 重拉整稿 source，合规 fallback 才单点重拉稳定父级/模块
6. 上述通过后才进 3b
```

若当前执行环境不能由 agent 自动截浏览器图，必须在卡点标「截图采集降级」，并要求用户用同一路径语义提供/确认 reference preview；不能把“服务无报错”当成截图验证通过。

## 五、3c 人工审核

### 审核载体

3c 开始时先按项目实际载体保存 `implementation-preview.png`：

- 纯静态（HTML/CSS）→ 直接用浏览器打开产出文件。
- 框架项目有 dev server → 打开对应路由 URL。
- 项目已有 Storybook → 打开该组件 story 的 iframe URL；无则临时挂载渲染。
- 不强制引入项目没有的 Storybook / dev server，有则用，无则用最简渲染方式。

没有 `implementation-preview.png` 时，不得进入人工审核结论。

### 审核内容

前置：3c-auto 已用 `extract-spec.mjs` 期望表逐项比对过叶子属性（圆角/显式宽高/行高/颜色/overflow 等，见 [08-attribute-verification.md](08-attribute-verification.md)）。人工审核不再从零扒属性，而是：

1. **整体视觉**：对照 `reference-preview.png` 与 `implementation-preview.png`，确认整体外观一致（F1/F6）。
2. **布局 / 间距 / 定位（A4）**：核对四边 padding 是否对称、各向间距/对齐/留白、绝对偏移、模块组合关系。
3. **抽查叶子属性兜底（F2）**：3c-auto 标为未知/非标的类、伪字体族映射，再人工确认一遍。
4. **不可见层复核（F5）**：复核 3c-auto 的装饰层可见性自检结果，确认设计里存在的装饰层没有被静默丢弃。

### 闭环

```text
0. （前置）3c-auto：extract-spec 期望表逐项比对叶子属性 + 不可见层自检
1. 渲染产出侧（静态文件 / dev server 路由 / Storybook story / 临时挂载）
2. 截实现预览，保存 screenshots/<nodeIdSafe>/implementation-preview.png
3. 对照 reference-preview.png vs implementation-preview.png
4. 用户核对布局/间距/定位（A4）+ 抽查未知/非标项 + 复核不可见层（F5）
5. 判定：
   - 通过 → 进 3d 登记
   - 不通过 → 指出差异项，回 03 迭代该单元，重走本步
```

每批卡点必须使用上方模板报告：属性校验结果、reference/implementation 预览截图路径、预览截图对照结论（通过 / 不通过 / 降级原因）、未知项处理、约束自检结果。

## 六、截图清晰度（F3 + F6）

F3 的 `get_screenshot` 清晰度规则仍保留，用于资源导出、结构分析长图查看、分支 A asset 导出等场景；F6 的浏览器预览截图同样必须清晰可核验。验收视觉对照以 source/reference/implementation preview 为准，不能用模糊整页图替代。

> **分辨率预算**：受两条上限叠加约束：Figma 单图长边上限 65536；读图侧有效分辨率预算经验值约 1500px 长边（可调）。任一超出，单张整页图都会被再降采样而糊。

1. **先看原始尺寸**：`get_metadata` 拿节点 `width/height`，长边即目标分辨率。
2. **默认 1x 取图**：`get_screenshot(maxDimension=节点长边)`，不传默认 1024 会把大节点压糊。
3. **取图后自检**：响应里 `width/height` 须等于 `original_width/original_height`；不相等说明被压缩，提高 `maxDimension` 重取。
4. **浏览器预览截图也要核尺寸**：`source-reference-preview.png`、单元 `reference-preview.png`、`implementation-preview.png` 的截图区域应与 `get_metadata` 尺寸/裁剪框一致；若文字或细线无法辨认，重截更高清晰度或按模块边界派生单元 preview。
5. **超长/超大节点沿模块边界纵向分块**：长边超分辨率预算时，按统一工作单元沿模块边界拆成更小单元/子区域分别截 1x 清晰图，按 `y` 坐标顺序查看。禁止用降采样整页单图做实现或审核依据；确实不可再拆且自身超预算的节点才降采样，并标注「降级：仅看结构，不用于实现/审核」。
6. **分块判定规则**：分块一律对模块 frame 的 nodeId 整帧截图，不按固定像素切；相邻兄弟帧不重叠，元素不被切断；单帧仍超预算则对其子帧递归下钻。

## Definition of Done

以 SKILL.md 的「Definition of Done」为准。本步重点：整稿 source 事实源齐全、source/reference/implementation 预览截图齐全清晰、预览截图对照通过或差异已在卡点说明、人工审核通过、支持模式的属性级自动校验无漏/错且未知项已人工核对，fallback 原因与 layout risk 已记录/处理。

## 要点

- 数据源默认是整稿 source `.tsx` 逐字保存 + React 渲染：不要理解后重画、手工转 HTML，或默认分模块下载。
- 视觉验证是截图证据链，不是 pixel diff；结论必须写成「通过 / 不通过 / 降级原因」。
- 组件级审核需可渲染载体；缺载体则补最小临时挂载。
- 叶子属性遗漏由 3c-auto（[08](08-attribute-verification.md)）兜底；人工把精力放在自动管不了的布局/间距/A4 上。

下一步（team 模式）：[06-team-workflow.md](06-team-workflow.md)。
