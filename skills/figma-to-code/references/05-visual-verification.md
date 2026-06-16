# 05 · 视觉验证（reference preview + implementation preview + 人工审核）

目标：把视觉验证收敛为一条稳定链路：步骤 2.5 统一渲染 Figma 原始 `.tsx` 得到 `reference-preview.png`，步骤 3c 渲染生成代码得到 `implementation-preview.png`，人工只对照这两张预览截图；叶子属性仍由 `extract-spec.mjs` 的期望表兜底。**不做像素级自动对比**，避免字体抗锯齿、浏览器差异和资源加载时序造成误报。

> **为什么不再手工转 HTML 快照**：把 React+Tailwind 导出手工逐行转 HTML 会引入失真，例如漏转 Figma 的非标类、误折叠复杂角标、把保真源当成了重画。直接保存原始 `.tsx` 让 React 自己渲染，才能把 reference preview 作为视觉参照。

> 开工闸门：审核/取数据源前回到 SKILL.md 重读「全局约束」，声明本步适用 A6 / F1 / F2 / F3 / F6 再动手。

## 目录

- [事实源与截图工件](#一事实源与截图工件)
- [PROGRESS 与卡点模板](#二progressmd-与卡点模板)
- [UI 真实数据源](#三ui-真实数据源25-统一预拉取)
- [3a 本地事实源确认](#四3a-本地事实源确认)
- [3c 人工审核](#五3c-人工审核)
- [截图清晰度](#六截图清晰度f3仅用于分析资源场景)

## 一、事实源与截图工件

每个待新建单元只保留两张验收截图，统一放在：

```text
.figma-to-code/screenshots/<nodeIdSafe>/
  reference-preview.png
  implementation-preview.png
```

- `nodeIdSafe = nodeId.replace(/[:]/g, '-')`，例如 `2507:10307` 写入 `2507-10307/`。
- `reference-preview.png`：步骤 2.5 中，浏览器渲染 `.figma-to-code/preview/src/modules/<nodeIdSafe>.tsx` 后保存。它来自 Figma 原始 `.tsx` 的 React 预览，是后续视觉审核的唯一参考截图。
- `implementation-preview.png`：步骤 3c 中，按项目实际载体渲染生成代码后保存。载体可为静态文件、dev server 路由、Storybook story 或临时挂载页面。
- `PROGRESS.md` 必须记录每个单元的 prefetch 状态、registry 状态、reference preview 截图路径、implementation preview 截图路径、失败/过期重拉项。

截图对照不替代属性表：截图擅长抓整体布局、间距、资源、层缺失和明显观感偏差；`extract-spec.mjs` 擅长抓圆角、字号、行高、颜色、关键字值、overflow 等截图不稳定或不明显的叶子属性。脚本只承诺支持模式的确定性抽取，未知/未解析项必须人工核对；两条都必须通过，或在卡点明确差异/降级原因。

## 二、PROGRESS.md 与卡点模板

`.figma-to-code/PROGRESS.md` 至少记录这些字段，字段名可按项目习惯微调，但信息不可缺：

```yaml
current_step: "3 / batch-1"
resource_branch: "B"
units:
  - id: "2507:10307"
    nodeIdSafe: "2507-10307"
    status: "prefetched | implemented | reviewed"
    referenceTsx: ".figma-to-code/preview/src/modules/2507-10307.tsx"
    registry: "registered"
    referencePreview: ".figma-to-code/screenshots/2507-10307/reference-preview.png"
    implementationPreview: ".figma-to-code/screenshots/2507-10307/implementation-preview.png"
    attributeCheck: "not-run | pass | fail | manual-unknown"
    reviewStatus: "pending | pass | fail | degraded"
    notes: "缺资源/缺字体/降级原因"
```

每批卡点统一按这个形状汇报，避免漏掉视觉或属性证据：

```text
卡点：批次 <n> / 单元 <nodeId>
- 属性校验：通过 / 不通过 / 降级；未知/未解析项：<已核对项或无>
- reference preview：.figma-to-code/screenshots/<nodeIdSafe>/reference-preview.png
- implementation preview：.figma-to-code/screenshots/<nodeIdSafe>/implementation-preview.png
- 视觉结论：通过 / 不通过 / 降级；差异：<布局/间距/资源/层缺失>
- 资源/字体：齐全 / 待补 <项>
- 约束自检：无违反 / 有破例 <理由>
- 下一步：进入 3d / 回 3b 修正 / 等用户补资源
```

## 三、UI 真实数据源（2.5 统一预拉取）

### 本质：保存 Figma 原始导出 .tsx，用 React 渲染

- **逐字保存、零修改**：步骤 2.5 把 `get_design_context` 返回的导出代码原封不动存为 `.figma-to-code/preview/src/modules/<nodeIdSafe>.tsx`，所有类名/样式值、DOM 结构、嵌套层级、文案原样保留。这份 `.tsx` 是该单元的属性事实源；其 React 运行时渲染是视觉参照。
- **禁止**：优化、重构、合并、删冗余、改单位、调值、替换字体、补设计未给的值、把 `leading-[normal]` 之类关键字具体化成数字（A5）。
- **图片/资源直接用 Figma 导出的在线链接**：preview 是临时事实源产物，不依赖用户提前准备的本地资源。Figma asset URL 约 7 天过期，若实现期发现某 `.tsx` 图链或 reference preview 失效，按需对该单个节点重新 `get_design_context` 覆盖并重截即可。
- **`.tsx` 缺数值属性时用 `use_figma` 读真值**：`get_design_context` 对 `VECTOR`/扁平图导出常缺 `cornerRadius`/`strokeWeight`/`fills`/`opacity`/effects 等，此时用 `use_figma` 插件 API 读节点真实属性补齐（A2），禁先写猜测值。详见 [03-code-generation.md](03-code-generation.md)。

### 一次性预览服务（`.figma-to-code/preview/`，已 gitignore）

独立子包（`package.json` `type:module`，避免与根包冲突），依赖 `vite` `react` `react-dom` `@vitejs/plugin-react` `tailwindcss` `@tailwindcss/vite`（v4）：

- `src/modules/<nodeIdSafe>.tsx`：Figma 原始导出逐字保存（默认导出组件）。
- `src/registry.ts`：`{ id, name, Component, w, h }[]`，每保存一个模块就登记。
- `src/App.tsx`：从注册表渲染，每个模块包在 `position:relative` + 设计稿 `w/h` 的定位容器里（Figma root 常是 `contents` 无尺寸，需有尺寸的定位祖先才撑得开），按页面底色堆叠展示，便于逐模块/整页比对。
- `src/styles.css`：`@import "tailwindcss";` + `@font-face`（指向项目或临时预览字体路径）。
- `src/figma-shim.css`：非标 Tailwind 兜底层（见下）。
- 启动：`npm i` 后跑本地 Vite。若字体在 preview 根之外，`vite.config` 需设置 `server.fs.allow` 放开仓库根。

### 已知坑：Figma 导出不是标准 Tailwind

Figma 的导出夹带非标类，标准 Tailwind 不认会丢类导致布局塌陷。必须配一层一次性全局 `figma-shim.css`：

- **网格定位 `col-N`/`row-N`**：标准 Tailwind 不存在，shim 里补 `.col-1{grid-column:1}` `.row-1{grid-row:1}`（覆盖到出现的 N）。
- **字体伪族名 `font-['zihunxinquhei:Regular']`**：带冒号/变体后缀，映射不回真实族。shim 用属性选择器兜底到真实字体族。
- **transform（`rotate-150`/`-rotate-30`/`-scale-y-100`）**：逐一渲染验证；不生效的在 shim 用 `@layer utilities` 补等值实现，或保存 `.tsx` 时做等值替换。
- **SVG `<img>` 的 `var(--fill-N, fallback)`**：若兜底色不对，优先回查真实属性，必要时内联处理。

## 四、3a 本地事实源确认

`.tsx`、`registry`、`reference-preview.png` 已在 2.5 预拉取并登记，3a 不再下载全量代码，只确认本地事实源可用：

```text
0. 确认本单元 .tsx 已在 2.5 存好：preview/src/modules/<nodeIdSafe>.tsx
1. 确认 registry 已登记该单元 id / name / Component / w / h
2. 起 preview 服务，确认编译无错、字体/图片请求可用、终端无 error
3. 确认 screenshots/<nodeIdSafe>/reference-preview.png 存在且清晰可打开
4. 若图链或截图失效：仅对该 node 重拉 get_design_context，覆盖 .tsx，重登记 registry 并重截 reference preview
5. 三项通过后才进 3b
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

## 六、截图清晰度（F3，仅用于分析/资源场景）

F3 的 `get_screenshot` 清晰度规则仍保留，但不再作为视觉验收主链路。它只用于资源导出、结构分析长图查看、分支 A asset 导出等场景；验收视觉对照以 `reference-preview.png` 与 `implementation-preview.png` 为准。

> **分辨率预算**：受两条上限叠加约束：Figma 单图长边上限 65536；读图侧有效分辨率预算经验值约 1500px 长边（可调）。任一超出，单张整页图都会被再降采样而糊。

1. **先看原始尺寸**：`get_metadata` 拿节点 `width/height`，长边即目标分辨率。
2. **默认 1x 取图**：`get_screenshot(maxDimension=节点长边)`，不传默认 1024 会把大节点压糊。
3. **取图后自检**：响应里 `width/height` 须等于 `original_width/original_height`；不相等说明被压缩，提高 `maxDimension` 重取。
4. **超长/超大节点沿模块边界纵向分块**：长边超分辨率预算时，按统一工作单元沿模块边界拆成更小单元/子区域分别截 1x 清晰图，按 `y` 坐标顺序查看。禁止用降采样整页单图做实现或审核依据；确实不可再拆且自身超预算的节点才降采样，并标注「降级：仅看结构，不用于实现/审核」。
5. **分块判定规则**：分块一律对模块 frame 的 nodeId 整帧截图，不按固定像素切；相邻兄弟帧不重叠，元素不被切断；单帧仍超预算则对其子帧递归下钻。

## Definition of Done

以 SKILL.md 的「Definition of Done」为准。本步重点：本地事实源齐全、reference/implementation 两张预览截图齐全清晰、预览截图对照通过或差异已在卡点说明、人工审核通过、支持模式的属性级自动校验无漏/错且未知项已人工核对。

## 要点

- 数据源是原始 `.tsx` 逐字保存 + React 渲染：不要理解后重画或手工转 HTML。
- 视觉验证是截图证据链，不是 pixel diff；结论必须写成「通过 / 不通过 / 降级原因」。
- 组件级审核需可渲染载体；缺载体则补最小临时挂载。
- 叶子属性遗漏由 3c-auto（[08](08-attribute-verification.md)）兜底；人工把精力放在自动管不了的布局/间距/A4 上。

下一步（team 模式）：[06-team-workflow.md](06-team-workflow.md)。
