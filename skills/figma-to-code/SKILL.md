---
name: figma-to-code
description: >-
  Generate production-grade frontend code from Figma designs that strictly
  matches the design data, reuses existing components instead of reinventing
  them, keeps fonts faithful, and is verified by an attribute-level auto-check
  plus preview screenshot comparison (no pixel diff): compare a faithful .tsx
  React reference preview screenshot against the generated implementation
  preview screenshot before human review. Assets
  are handled via a selectable branch: user-prepared (default) or agent-assisted
  export. Human-in-the-loop: works unit-by-unit in dependency batches with
  mandatory review checkpoints. Zero-config: detects the project's
  stack/components/tokens at runtime. Use when the user shares a Figma URL or
  node-id, asks to implement / build / code a Figma design, screen, page, or
  component, or mentions design-to-code.
---

# Figma 设计稿 → 理想前端代码

把 Figma 设计转成「**严格按设计稿数据、不重复造轮子、资源用户预备、字体保真、预览截图对照、经人工审核**」的前端代码。**人在环路**：按依赖批次自底向上逐单元实现，每批设强制 review 卡点。**零配置**：项目相关事实全部运行时探测——有则遵循，无则按本 skill 缺省规则。

> 模块拆分和复用判定完成后，在步骤 2.5 **优先对用户目标 UI node 整体一次性 `get_design_context`**，逐字保存整稿 `.tsx` 并生成整稿 `source-reference-preview.png`。后续单元从整稿 `.tsx` 中按 `data-node-id` 定位取值；只有整稿导出不可用时才允许分模块 fallback。细节见约束 A6。

## 术语单一真相

- `nodeIdSafe = nodeId.replace(/[:]/g, '-')`，所有临时文件路径都用它命名。
- `targetNodeIdSafe = targetNodeId.replace(/[:]/g, '-')`，用户给的目标 UI node（页面/区块/组件）作为整稿 source 命名。
- `source reference .tsx`：步骤 2.5 逐字保存的目标 UI node 整稿 Figma 原始导出，路径为 `.figma-to-code/preview/src/source/<targetNodeIdSafe>.tsx`，是默认属性事实源。
- `source reference-preview.png`：步骤 2.5 渲染 source reference `.tsx` 后保存，路径为 `.figma-to-code/screenshots/<targetNodeIdSafe>/source-reference-preview.png`，是默认视觉参照。
- `unit reference .tsx`：仅在整稿导出不可用并记录 fallback 原因后，才允许保存到 `.figma-to-code/preview/src/modules/<nodeIdSafe>.tsx` 的分模块导出；不得作为默认路径。
- `reference-preview.png`：单元审核用预览，优先由整稿 source preview 按 `get_metadata` 坐标裁剪/定位生成；fallback 时才来自该单元/稳定父级 `.tsx` 渲染。
- `implementation-preview.png`：步骤 3c 渲染最终项目代码后保存，路径为 `.figma-to-code/screenshots/<nodeIdSafe>/implementation-preview.png`，只与 reference preview 做视觉对照。
- `3a` 只确认本地事实源齐全可用；`3b` 生成项目代码；`3c-auto` 做属性表比对；`3c` 做截图对照 + 人工审核。

## 全局约束（全流程强制遵守，违反即停）

以下约束在**每一个步骤、每一个单元、每一个卡点**都必须遵守。卡点处必须先做一遍约束自检并报告「无违反 / 有破例（理由）」再请求确认。默认绝对遵守；个别可破例项（C.2 临时降级字体）必须在卡点显式说明，**禁止静默破例**。

> 多步操作细节（A4 间距取值法、F3 分块取图）只在表内留一句核心指令 + 指向 references，完整规则在对应 reference 文档，避免双写漂移。

| 代号 | 规则（违反即停） |
| --- | --- |
| **A 数据保真** | |
| A1 | 禁猜测/编造设计值；必须来自 `get_design_context`/`get_variable_defs`/`get_metadata`；颜色/数值逐实例读真值，禁跨实例复制近似值（典型坑见 [references/03](references/03-code-generation.md)「颜色/数值逐实例读真值」） |
| A2 | 取不到的值先用 `use_figma` 插件 API 读节点真实属性（`cornerRadius`/`fills`/`strokeWeight`/`opacity`/effects）；仍取不到才卡点标「待确认」，禁先猜（典型坑见 [references/03](references/03-code-generation.md)「缺数值属性时」） |
| A3 | 禁以"视觉接近"为由偏离设计数值 |
| A4 | 间距/定位全方向逐一取值，禁假设对称/居中；间距归父容器，子单元零外边距；取值法见 [references/03](references/03-code-generation.md)「间距与定位还原」 |
| A5 | 关键字值（`normal`/`auto`/`none`）原样保留，禁具体化成数字；设计未给的属性不新增 |
| A6 | 步骤 2.5 只对目标 UI node 整体做一次 `get_design_context`，逐字存为 source `.tsx`；各单元从整稿按 `data-node-id` 取值；禁默认分模块下载、禁手抄、禁手工转 HTML |
| A7 | 分模块导出只是 fallback（整稿失败/超时/截断才允许）；fallback 前把 `exportMode=fallback-modules` 与 `fallbackReason` 写入 `PROGRESS.md`；fallback `.tsx` 若有 `contents + left/top/…` 或 `relative contents`，只作叶子属性参考，几何回到整稿/父级导出与 `get_metadata` |
| **B 资源** | |
| B1 | 能 CSS 实现的禁切图（渐变/圆角/阴影/描边/纯色块/简单形状） |
| B2 | 项目代码禁写 Figma 在线链接，只引本地路径（例外：source/fallback 原始 `.tsx` 可用在线链接，见 A6/A7） |
| B3 | 资源准备走分支（默认 B）：分支 B 用户自备语义命名资源；分支 A agent 用 `get_screenshot` 导出确定项，判断性决策标待确认。详见 [references/04](references/04-asset-handling.md) |
| B4 | 禁 base64 内联图片 |
| B6 | 成品图尺寸/位置取设计摆放框，禁反推 Figma 内部坐标；背景填充图整图铺满。决策树见 [references/04](references/04-asset-handling.md) |
| B7 | 资源语义命名放项目目录；3b 扫描目录按语义名引用现存资源，缺失 jit 提示补齐 |
| **C 字体** | |
| C1 | 禁自作主张替换字体：族/字重/字号严格按设计稿 |
| C2 | 缺失字体记入清单、卡点提醒；临时降级须显式标注，禁默不作声 |
| **D 组件复用** | |
| D1 | 禁重复造已有组件：生成前先扫 `scan-components.mjs` + `search_design_system`，命中则复用 |
| D2 | `get_design_context` 返回的 React+Tailwind 是参考，必须适配项目实际栈，禁照抄当终稿 |
| D3 | 命名/目录结构/lint/格式化按项目既有约定，不另起一套 |
| D4 | 禁过度组件化：单纯图片、无复用的简单结构直接内联，不抽成独立单元 |
| D5 | 禁用超出项目兼容范围的 CSS/ES 语法；步骤 0 探测 browserslist/tsconfig/构建 target，探测不到则向现有源码看齐。详见 [references/00](references/00-project-detection.md) |
| **E 流程/卡点** | |
| E1 | 禁跳过人工卡点擅自推进：到卡点停下请求确认，未确认不进下一阶段 |
| E2 | 禁一口气从头实现到尾：必须分批，做一批停一批 |
| E3 | 禁跳过结构拆分直接写页面代码 |
| E4 | 禁人工审核未通过就宣称完成或推进下一批 |
| E5 | 每批开工前主动询问用户是否需补充信息/参考 |
| **F 视觉/人工审核** | |
| F1 | 禁凭感觉宣称还原：每单元/批次必经人工视觉审核（对照 `reference-preview.png` 与 `implementation-preview.png`），未过不推进 |
| F2 | 人工重点复核：布局/间距/定位（A4）+ 3c-auto 标的「未知/非标」类 + 伪字体族映射；叶子属性由 F4 兜底，禁仅看整体外观 |
| F3 | `get_screenshot` 只用于结构分析/资源导出等非验收场景，必须 1x 清晰；超长节点按模块 nodeId 分块。详见 [references/05](references/05-visual-verification.md)「截图清晰度」 |
| F4 | 叶子样式属性须经 3c-auto 校验：跑 `extract-spec.mjs` 抽期望表逐项比对；未知/未解析项必须人工核对后才进审核；布局/间距仍归人工 A4。详见 [references/08](references/08-attribute-verification.md) |
| F5 | 禁静默丢弃设计层：装饰层 fill ≈ 父容器背景色即视为"该层等于没画"，回查真实色再填；3c-auto 后做确定性自检，详见 [references/08](references/08-attribute-verification.md) |
| F6 | 每单元保留 `reference-preview.png` 与 `implementation-preview.png`；单元 reference 优先从整稿 source preview 按 `get_metadata` 坐标派生。详见 [references/05](references/05-visual-verification.md) |
| **G 范围/安全** | |
| G1 | 禁超出本次单元/批次范围擅自改动其他模块/文件 |
| G2 | 禁删除或重构与当前任务无关的既有代码 |
| G3 | 禁提交/推送代码，除非用户明确要求 |

## 开工闸门（每个步骤/子步骤开始前必做，违反即停）

进入任一步骤（0/1/2、2.5、3a/3b/3c、4/5）**动手之前**，先走三步：

1. **重读**上方「全局约束 A~G」全文（回看原文，不凭记忆）；
2. **声明**：一句话写出"本步适用约束：<代号 + 该条一句话原文>"；
3. 声明完成后才动手。**未重读、未声明不得动手。**

> 这是防止长会话约束滚出上下文、agent 凭记忆跑偏的强制再注入点。

## 开工前

- **MCP 前置检查**：确认 Figma MCP 已连接，可运行 `node scripts/check-mcp.mjs`，缺失则按提示安装。（浏览器截图能力可选；缺失时在卡点降级为用户确认截图。）
- **多人开发提示**：若由多人协作实现，先明确分工（详见 [references/06-team-workflow.md](references/06-team-workflow.md)）。

## 核心模型：统一工作单元 + 依赖批次

不区分「公共组件阶段 / 业务模块阶段」。所有 UI（原子 / 分子 / 子模块 / 大模块 / 页面）统一抽象为「**工作单元**」，按依赖拓扑**自底向上**实现：

- 任意层级都可复用，大单元复用已建的小单元（嵌套组合）。
- **资源准备是任何待建单元的前置**（分支 B 用户下载 / 分支 A agent 导出，含最底层共享/公共组件批次），按批次对齐到卡点。
- 被多处引用的「共享单元」自动排进更靠前的批次先行实现。

## 快速通道（小任务可裁剪流程，但不裁剪约束）

完整 5 步流程是为「整页 / 多模块 / 多人协作」设计的。**单个组件 / 单个小改动**可裁剪流程，避免过度仪式化：

- **适用判定**：目标是**单一工作单元**（一个组件/一处局部），无多模块依赖、无复用拓扑需要排序 → 走快速通道。**纯静态 HTML/CSS 项目（无组件概念）**：步骤 1 的"依赖拓扑与批次切分"完全不适用，整体视作单工作单元走快速通道；端到端参见 [references/07-worked-example.md](references/07-worked-example.md)。
- **可合并/跳过**：步骤 1 结构分析（无需依赖图与批次切分）、步骤 2 的批次排序、步骤 4 页面组合可合并或跳过；卡点①与"每批卡点"合并为**一次卡点**。
- **不可裁剪（硬性保留）**：步骤 0 探测（至少认栈/资源目录）、步骤 2.5 **整稿优先预拉取原始 .tsx + 保存 source/reference preview 截图**、3a 本地事实源确认、3b 对照 .tsx 生成、3c 截 implementation preview + 人工审核、**全局约束 A~G + 开工闸门**——这些与任务大小无关，一律执行。
- **升级规则**：一旦发现该单元牵出多个子单元/共享依赖，立即回到完整流程做结构分析与批次切分。

> 一句话：**流程可因任务变小而精简，数据保真/资源/字体/审核等约束不因此放松。**

## 工作流（步骤 0 + 5 步，含动态卡点）

复制此清单跟踪进度：

```
进度：
- [ ] 运行初始化 —— 确保 .gitignore 含 .figma-to-code/ + 搭好 .figma-to-code/preview/（一次性 Vite/React 预览）+ 建 .figma-to-code/PROGRESS.md 进度文档（跨窗口续作）
- [ ] 0. 项目探测   —— 探测栈/组件/Token/资源策略
- [ ] 1. 结构分析   —— 全量工作单元 + 依赖图 + 复用关系 + 组合关系 + 批次切分（只拆分/判复用，不碰资源）
        ── 卡点① 确认拆分 / 依赖 / 复用 / 批次顺序 ──
- [ ] 2. 复用判定   —— 全层级先查后建，命中复用 / 未命中排批
        ── 资源准备（默认分支B 用户语义命名备好+告知目录 / 分支A agent get_screenshot 导出+manifest 待确认）──
- [ ] 2.5 整稿预拉取 —— 卡点①确认 + 步骤2复用判定后，优先一次性把用户目标 UI node 的 get_design_context 逐字存为 source/<targetNodeIdSafe>.tsx + 登记整稿 registry + 渲染 source-reference-preview.png；各单元从整稿按 data-node-id 派生 reference preview。仅必要时记录 fallbackReason 后分模块导出稳定父级/模块
- [ ] 3. 逐批实现   —— 自底向上，每批：3a 本地事实源确认(source .tsx+registry+source/unit reference-preview 齐全，过期优先单点重拉整稿 source) / 3b 代码生成(扫资源引用+对照 source .tsx 中该 node 子树+缺失jit) / 3c-auto 属性级自动校验(extract-spec --node-id 期望表逐项比对 + 不可见层自检 + fallback layoutRisk) / 3c 截 implementation-preview.png + 预览截图对照 + 人工审核 / 3d 登记
        ── 卡点(每批) 开工前先问用户是否需补充信息(E5) + 本批单元 + 自动校验 + reference/implementation 预览截图对照结论 + 人工审核 + 约束自检，确认才进下一批；更新 PROGRESS.md ──
- [ ] 4. 页面组合   —— 复用所有已建模块拼装页面
- [ ] 5. 整体校验   —— 整体 review + 整体人工审核 = Done
- [ ] 收尾清理   —— 汇总缺失字体/未补资源 → 用户确认 → 删除 .figma-to-code/
```

动手前再读对应的 `references/` 分步文档（见各步末尾链接）。**首次使用本 skill 或衔接步骤不确定时，先看一遍端到端最小范例 [references/07-worked-example.md](references/07-worked-example.md)**——它用一个最小单元演示从 `get_design_context` 到交付 CSS 的每一步实际产物与衔接动作。

### 运行初始化（每次运行开始）

`.figma-to-code/` 用于存放**单次运行的临时产物（原始 .tsx + 一次性 React 预览），不写死在 skill 里**：

1. 确保 `.gitignore` 含 `.figma-to-code/`（无则追加一行；项目无 `.gitignore` 则新建），避免临时产物被误提交。
2. 搭好 `.figma-to-code/preview/` 一次性预览子包（Vite+React+Tailwind v4 + `figma-shim.css` + `registry.ts` + `App.tsx`；`source/<targetNodeIdSafe>.tsx` 在步骤 2.5 整稿预拉取时逐字写入，`modules/` 仅用于 fallback）。结构与坑点见 [references/05-visual-verification.md](references/05-visual-verification.md)。**注：预览子包固定使用 Vite+React+Tailwind v4，与项目实际框架无关；Vue/Angular/纯 HTML 等非 React 项目也需在此目录下安装 React 工具链（约 200 MB），这是为忠实渲染 Figma source .tsx 的有意取舍，随 `.figma-to-code/` 整体清理不留残余。**
3. 建 `.figma-to-code/PROGRESS.md` **进度文档**：记录当前步骤/批次、待确认项、资源分支(A/B)、`exportMode`、`fallbackReason`、整稿 source 事实源、每个单元的 reference preview/implementation preview/attribute check/review status。最小字段模板见 [references/05](references/05-visual-verification.md)。
4. 不再生成资源清单：资源由用户提前准备并提供目录（见 [references/04-asset-handling.md](references/04-asset-handling.md)）。

### 步骤 0 · 项目探测

> 开工闸门：先执行「开工闸门」三步（重读全局约束 + 声明本步适用条目）再动手。

读 `package.json` 与各类配置、运行 `node scripts/scan-components.mjs` 看既有组件、搜 token 体系，得出「栈=? 样式=? 组件目录=? Token=? 资源策略=? 资源分支=A/B（默认 B）? **兼容范围=?（browserslist/tsconfig target/构建 target/autoprefixer）**」结论。详见 [references/00-project-detection.md](references/00-project-detection.md)。

### 步骤 1 · 结构分析（产出依赖拓扑 + 批次）

> 开工闸门：先执行「开工闸门」三步（重读全局约束 + 声明本步适用条目）再动手。

用 `get_metadata` 拿目标 node 结构，拆成全量 `node-id` 工作单元，标注：层级、依赖图、**复用关系**（哪些被多处引用=共享单元）、**组合关系**（子模块如何组合成大模块）、据依赖拓扑切「实现批次」。**本步只关心"怎么拆、哪些可复用"，不探索、不列任何资源**（资源在实现期由用户预备，见步骤 3）。

**卡点①**：停下，把拆分/依赖/复用/批次顺序给用户 review，做约束自检，确认后才继续。详见 [references/01-structure-analysis.md](references/01-structure-analysis.md)。

### 步骤 2 · 复用判定（贯穿所有层级）

> 开工闸门：先执行「开工闸门」三步（重读全局约束 + 声明本步适用条目）再动手。

对每个工作单元（不止公共组件）：`node scripts/scan-components.mjs` 扫现有组件 + `search_design_system` 对照设计系统 → 命中则复用、不重建；未命中按拓扑排进对应批次。详见 [references/02-component-reuse.md](references/02-component-reuse.md)。

> **资源准备（两分支可选，步骤0/2 选定，默认 B）**：
> - **分支 B · 用户自备（默认）**：用户自行下载（分辨率/透明等自理）、**语义化命名**放入项目目录并告知路径；agent 在 3b 扫描引用、缺失 jit（B3/B7）。
> - **分支 A · agent 协助导出**：agent 用 `get_screenshot` 导出**确定的 `<img>` 节点**到资源目录，并产出 `asset-manifest`，把"整体导出 vs 拆碎 / 透明 / @2x / 背景图判定"等**判断性决策标为待确认交用户裁决**；确定性导出归 agent，判断归用户。
> 两分支下游引用方式一致。详见 [references/04-asset-handling.md](references/04-asset-handling.md)。

### 步骤 2.5 · 整稿预拉取参考代码 + source/reference preview 截图（卡点①确认 + 步骤2复用判定后，一次性）

> 开工闸门：先执行「开工闸门」三步（重读全局约束 + 声明本步适用条目，本步高危：A6 / A7 / B2）再动手。

在分析完整体结构/复用/批次、完成复用判定后，**优先只对用户给的目标 UI node 做一次 `get_design_context` 整稿导出**，再分批实现。模块拆分只决定实现批次和复用，不再默认驱动 Figma 代码分段下载：

1. 对目标 UI node `get_design_context`（传 `fileKey` + `targetNodeId`），**逐字保存**为 `.figma-to-code/preview/src/source/<targetNodeIdSafe>.tsx`（零修改、图片用导出在线链接），登记 source registry，并在 `PROGRESS.md` 写 `exportMode: whole-node`、`sourceReferenceTsx`。
2. 启动 `.figma-to-code/preview/`，渲染整稿 source 并保存 `.figma-to-code/screenshots/<targetNodeIdSafe>/source-reference-preview.png`；这张图是默认视觉参照。
3. 对每个待新建单元，从整稿 source `.tsx` 中按 `data-node-id` 定位其子树；单元 `reference-preview.png` 优先从整稿 source preview 按 `get_metadata` 坐标裁剪/定位生成，或由本地 preview 高亮/截取对应 node 区域生成，**不得为了省事重新请求该单元 `get_design_context`**。
4. 仅在整稿 `get_design_context` 失败/超时/被截断、整稿 `.tsx` 经 shim 后仍无法编译、或整稿截图超出可验证预算且无法清晰分块时，才允许 `exportMode: fallback-modules`。用户目标本身是单个组件时，该组件就是整稿 source，不得继续拆更小。启用 fallback 前必须把 `fallbackReason` 写入 `PROGRESS.md`，并优先导出更大的稳定父级节点，不直接导出最小子模块。
5. fallback `.tsx` 必须跑 `extract-spec.mjs` 做 layout risk audit；若出现 `contents + left/top/right/bottom/inset/margin` 或 `relative contents`，该导出只可作叶子属性参考，布局几何回到整稿/父级导出与 `get_metadata` 坐标。
6. **URL 失效**：Figma asset 在线链接约 7 天过期；预拉取后到实现期若发现 source `.tsx` 图链或 source preview 已失效，优先重拉目标 UI node 整稿 source。只有当前已处于合规 fallback 时才单点重拉对应稳定父级/模块。
7. 在 `PROGRESS.md` 记录 source prefetch、source registry、source reference preview、各单元派生 reference preview、fallback 原因和重拉项，便于关窗续作。

> 与步骤 1 区别：步骤 1 只拆结构、不碰任何代码/资源；本步只拉目标 UI node 的"结构+数值源"整稿 `.tsx` 和预览截图，**图片资源仍按步骤 2 的 A/B 分支在实现期处理**。

### 步骤 3 · 逐批实现（自底向上）

> 开工闸门：3a / 3b / 3c-auto / 3c **每个子步骤动手前**都各执行一次「开工闸门」三步（重读全局约束 + 声明本步适用条目），不是每批只做一次。

对每个批次（= 一组依赖已就绪、可并行的单元）。**每批开工前先按 E5 询问用户是否需补充信息/参考**，再动手：

1. **3a 本地事实源确认**（开工闸门 · 本步高危：A6 / A7 / F6）：整稿 source `.tsx`、source registry、`source-reference-preview.png` 已在**步骤 2.5 整稿预拉取**时准备好；本单元 `reference-preview.png` 已从整稿派生，或已记录 fallback 原因。确认 source 可编译、单元 node 可在 source `.tsx` 中定位、reference preview 清晰可打开；若图链已过期，优先重拉整稿 source。通过后才进入 3b。详见 [references/05-visual-verification.md](references/05-visual-verification.md)。
2. **3b 代码生成**（开工闸门 · 本步高危：A1 / A4 / A5 / A6 / A7 / B1 / B2 / B6 / B7 / C1 / D1 / D2 / D5）：以 2.5/3a 确认过的整稿 source `.tsx` 中该 `data-node-id` 子树为属性事实源、单元 `reference-preview.png` 为视觉参照，适配项目栈（D2），**逐字段对照 `.tsx`**严格按设计数据（约束 A），复用已建下层单元（约束 D），能 CSS 不切图（B1），背景填充图整图铺满（B6），字体保真（约束 C），**产出语法限定在项目兼容范围内、不用项目目标环境不支持的 CSS/ES 语法（D5）**；**扫描用户提供的资源目录按语义名引用现存资源**，缺失则就地提示补齐（B7）。详见 [references/03-code-generation.md](references/03-code-generation.md)。
3. **3c-auto 属性级自动校验 + 不可见层自检**（开工闸门 · 本步高危：F4 / A5 / F5 / A7）：跑 `node scripts/extract-spec.mjs .figma-to-code/preview/src/source/<targetNodeIdSafe>.tsx --node-id <nodeId>` 拿机器生成的「期望属性表」，**逐项比对本单元生成代码**——支持模式的叶子属性漏/错即修（A5 关键字禁具体化、伪字体族映射回真实族），布局项留给 3c 人工按 A4 核，非标/未知/未解析项逐个人判；若处于 fallback，必须查看脚本输出的 `layoutRisk` 并按 A7 处理；并做**不可见层自检**（装饰层 fill ≈ 父容器背景色即"等于没画"，回查真实色，F5）；支持项无差异且未知项已说明/核对后才进 3c。详见 [references/08-attribute-verification.md](references/08-attribute-verification.md)。
4. **3c 截 implementation preview + 预览截图对照 + 人工审核**（开工闸门 · 本步高危：F1 / F2 / F6）：叶子属性已由 3c-auto 兜底，先按项目实际载体保存 `.figma-to-code/screenshots/<nodeIdSafe>/implementation-preview.png`，再用 `reference-preview.png` 对照 `implementation-preview.png`，人工聚焦**布局 / 整体观感 / A4 间距**；未过回 3b 迭代。详见 [references/05-visual-verification.md](references/05-visual-verification.md)。
5. **3d 登记**：完成的单元即进入"可复用"清单（代码即清单），供后续批次复用。

**卡点（每批）**：停下，本批单元 + 自动校验结果 + 预览截图对照结论（reference-preview vs implementation-preview）+ 人工审核结果 + 约束自检报告给用户 review，确认才进下一批；并**更新 `PROGRESS.md`**（已完成单元、截图路径、待确认项、下一批入口），以便跨窗口续作。

### 步骤 4 · 页面组合

> 开工闸门：先执行「开工闸门」三步（重读全局约束 + 声明本步适用条目，本步高危：A4）再动手。

复用所有已建模块拼装顶层页面；有自身需引用的资源则同样按 B7 扫描引用（缺失即时提示）。子单元**自包含、各向不带外边距**；各方向间距 / 对齐 / 留白归**父容器**在组合时统一施加，取值方式见 [references/03-code-generation.md](references/03-code-generation.md) 的「间距与定位还原」（遵守 A4）。

### 步骤 5 · 整体校验

> 开工闸门：先执行「开工闸门」三步（重读全局约束 + 声明本步适用条目，本步高危：F1 / F2 / F6）再动手。

整体 review + 整体人工审核（reference preview vs implementation preview + 逐属性核对）。通过 Definition of Done 即完成。

### 收尾清理（全流程跑通后）

1. **汇总给用户**：仍未补的「缺失字体」、3b 中提示过但仍未补齐的资源（jit 未补项）。
2. 请用户确认是否清理本次临时产物：
   - **无未完成项 + 用户确认** → 删除 `.figma-to-code/preview/`（及其余临时产物，一并删 `.figma-to-code/`）。
   - **仍有未完成项**（如第三方字体未补）→ **保留**，提示用户补齐后再删，不强行删除。

## Definition of Done（每单元/每批 + 整体）

- 约束自检：全局约束（A~G）无违反，破例已在卡点说明。
- 数据保真：整稿 source `.tsx` 已逐字保存并登记，与目标 UI node 的 Figma 导出代码 1:1；代码逐字段对照 source `.tsx` 中对应 `data-node-id` 子树，fallback 已记录原因且不把风险布局当几何事实源（A5/A6/A7）。
- 本地事实源：整稿 source `.tsx`、source registry、`source-reference-preview.png` 已在步骤 2.5 准备完成；每个待建单元的 `reference-preview.png` 已从整稿派生或有合规 fallback 记录；后续批次只消费这些本地事实源，过期优先重拉整稿 source。
- 预览截图证据：整稿 `source-reference-preview.png`、每单元/批次的 `reference-preview.png` 与 `implementation-preview.png` 齐全且清晰可打开；视觉差异已修正或在卡点说明（F6）。
- 属性级自动校验：3c-auto 跑 `extract-spec.mjs <source.tsx> --node-id <nodeId>` 期望表逐项比对，支持模式的叶子属性无漏/错（或差异已在卡点说明），未知/未解析项已人工核对，fallback `layoutRisk` 已处理（F4/A7）。
- 不可见层自检：3c-auto 后已做"装饰层 fill vs 父容器背景色"距离自检，无"等于没画"的静默丢弃层（F5）。
- 资源齐全：代码引用的资源均已在项目中（agent 扫描命中），无 jit 提示后仍未补的资源。
- 人工审核：用户对照 `reference-preview.png` 与 `implementation-preview.png`，并逐属性核对 source `.tsx`/期望表后通过（F1/F2）。
- 进度文档：`.figma-to-code/PROGRESS.md` 已更新到当前批次/单元状态，包含 `exportMode`、`sourceReferenceTsx`、`sourceReferencePreview`、必要时的 `fallbackReason`（支持跨窗口续作）。
- 兼容范围：产出未使用超出项目兼容范围的 CSS/ES 语法，命中风险已降级或在卡点说明（D5）。
- lint 通过、无新增重复组件、无过度组件化（D4）。
- 通过对应 review 卡点的人工确认。

## 关键约束速记

> 仅列 A~G 未覆盖的环境事实；数据保真/资源/审核/截图等规则一律以上方「全局约束」为准。

- 速率：Figma Pro Dev seat 约 10 次 MCP 调用/分钟；步骤 2.5 默认整稿一次导出，只有合规 fallback 才分模块请求，避免无谓打满限流。
- 锚点：以 `node-id` 为单元，重生成不冲掉人工改动。
- 进度文档：`.figma-to-code/PROGRESS.md` 记录当前步骤/批次、资源分支、`exportMode`、整稿 source 事实源、每单元截图/属性校验/审核状态、必要时的 `fallbackReason`；每个卡点更新，字段模板见 [references/05](references/05-visual-verification.md)。
- 截图目录：`.figma-to-code/screenshots/<targetNodeIdSafe>/source-reference-preview.png` 存整稿参照；`.figma-to-code/screenshots/<nodeIdSafe>/` 存单元 `reference-preview.png`、`implementation-preview.png`；随 `.figma-to-code/` 作为临时产物默认不提交。`nodeIdSafe = nodeId.replace(/[:]/g, '-')`。
- 缺值兜底：`get_design_context`（尤其 `VECTOR`/扁平图导出）缺数值属性时，用 `use_figma` 插件 API 读节点真实属性，禁先写猜测值（A2）。
- figma-shim：Figma 导出夹带非标 Tailwind（`col-N`/`row-N`/伪字体族/裸数值 transform），预览须配一层一次性全局 shim 兜底，否则照样塌陷。
- extract-spec：`scripts/extract-spec.mjs <source.tsx> --node-id <nodeId>` 静态解析整稿 `.tsx` 中指定子树出「期望属性表」，3c-auto agent 拿表逐项比对生成代码、抓漏/错叶子属性，并查看 fallback `layoutRisk`（F4/A7）。
- Code Connect：Pro 席位不可用，复用靠「组件目录扫描 + 命名推断」。
- 兼容范围：步骤0 探测 `browserslist`/`tsconfig` target/构建 target/autoprefixer，生成代码不超出该范围；探测不到则向项目现有源码写法看齐（D5）。
- 零配置：项目事实运行时探测；但全局约束随 skill 强制内置。
