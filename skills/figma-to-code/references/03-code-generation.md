# 03 · 代码生成（以 source .tsx + reference preview 为事实源 + 数据保真 + 字体保真）

目标：把每个**待新建**单元生成为符合项目既有栈与规范的代码（探测不到则 AI 选最合理的），**以步骤 2.5 整稿预拉取并经 3a 确认的 source `.tsx` 中该 `data-node-id` 子树为取值数据源、单元 `reference-preview.png` 为视觉参照逐字段对照**，引用既有/新建 token，复用已命中的组件。流程位置：步骤 3 的 **3b**（在 3a 本地事实源确认之后、3c 人工审核之前）。

> 前提：目标 UI node 的 `get_design_context` 导出代码已在**步骤 2.5 整稿预拉取**时逐字保存为 `.figma-to-code/preview/src/source/<targetNodeIdSafe>.tsx`，登记到 source registry，并已保存 `.figma-to-code/screenshots/<targetNodeIdSafe>/source-reference-preview.png`；本单元 `reference-preview.png` 已由整稿 preview 派生，或已有合规 fallback 记录。3a 已确认 source `.tsx`、registry、reference preview 均可用，非标类已在 figma-shim 兜底（见 [05-visual-verification.md](05-visual-verification.md)）；所需资源由用户提前语义命名备好并提供了资源目录（见 [04-asset-handling.md](04-asset-handling.md)）。

> 开工闸门：写代码前回到 SKILL.md 重读「全局约束」，声明本步适用 A1 / A4 / A5 / A6 / B6 / B7 / C1 / D1 / D2 / D5 等再动手。

## 目录

- [事实源](#以-source-tsx--reference-preview-为事实源约束-a6先做)
- [数据保真](#数据保真闸门约束-a最高优先)
- [单元生成流程](#单元生成流程)
- [Token 与资源](#token-适配)
- [间距与响应式](#间距与定位还原约束-a4全维度)
- [交互态与要点](#按设计稿补全交互态--响应式)

## 以 source .tsx + reference preview 为事实源（约束 A6，先做）

3b 不再"回去逐个读散值手搭"，也不照抄一份手工 HTML，也不默认重新下载模块代码，而是**对照步骤 2.5/3a 确认过的整稿 source `.tsx` 中对应 `data-node-id` 子树（取值源）+ 单元 reference preview（视觉参照）逐字段改写成项目栈**：

1. 打开 `.figma-to-code/preview/src/source/<targetNodeIdSafe>.tsx`（它与用户目标 UI node 的 Figma 整稿导出 1:1），按本单元 `data-node-id` 定位子树，并查看 `.figma-to-code/screenshots/<nodeIdSafe>/reference-preview.png`。
2. **逐字段映射**：`.tsx` 里的每个尺寸/间距/圆角/颜色/字体/对齐/背景 → 项目栈对应写法（token/类名/样式），**不漏字段、不改值**。
3. 用该单元的「属性核对清单」自检：每项都已落到代码里。
4. 把"翻译"从"读散值手抄"变成"对照保真源改写栈"——这是堵住"手抄遗漏属性"的核心。

## 数据保真闸门（约束 A，最高优先）

规则全文以 SKILL.md「全局约束」A1~A7 为准；本步落地要点：**所有设计值以整稿 source `.tsx` / MCP 精确返回为准**——尺寸/间距/圆角/位置取 `get_metadata`+source `.tsx`，颜色/字号/字重/行高/token 取 `get_variable_defs`+source `.tsx`，文案取设计稿原文不改写不占位；取不到的值不编造、卡点标「待确认」（A2）；不以"视觉接近"偏离数值（A3）；关键字值原样保留、禁具体化（A5）。fallback 分模块导出只作降级事实源，命中 `contents` 布局风险时不得采用其几何表达（A7）。

### 缺数值属性时用 `use_figma` 读真值（约束 A2，禁先猜）

`get_design_context` 把 `VECTOR` / 被导出成扁平 PNG 的节点摊平后，常**缺少数值属性**（`cornerRadius` / `strokeWeight` / `fills` / `opacity` / 阴影 effects 等）。此时：

1. **先用 `use_figma` 插件 API 读节点真实属性**——`node.cornerRadius`、`node.fills`、`node.strokeWeight`、`node.opacity`、`node.effects` …，拿到真值再落代码。
   - 实战教训：白卡圆角矩形圆角（曾猜 16px，实测 `cornerRadius=12px`）、圆点环宽（曾猜 1.5px）、头像外圈光晕透明度（曾猜 0.3）——这些 `get_design_context` 扁平化后取不到，但 `use_figma` 都能读到真值。
2. **禁先写猜测值**（即便带「待确认」标注）——插件 API 是导出代码缺属性时的权威兜底；只有 `use_figma` 也读不到，才卡点显式标「设计稿未给出，待确认」。

### 颜色/数值逐实例读真值，禁跨实例复制（约束 A1）

- **逐实例**把颜色/数值映射到**该节点** `get_design_context` 返回的真实 `fill` / 变量定义（变量名 → 值都在该节点的 var defs 里）。
- **禁把某一处的猜测/近似值复制到另一处实例**：同名组件在不同背景下，错误的近似色会从"看着还行"变成"完全消失"。
  - 实战教训：头像外圈在橙色 banner 上用半透明白 `rgba(255,255,255,0.3)` 看着还行；同组件搬到**白卡**上时若照抄该值，白圈叠白底=完全看不见，装饰层被"静默丢弃"（见 F5）。其真实色 `衍生色/Color_Orange_03 #FFF3EB` 本就在该节点 var defs 里——读真值即可避免。

## 单元生成流程

对每个待新建单元：

1. **以 source .tsx + reference preview 为事实源**：打开 `source/<targetNodeIdSafe>.tsx` 并定位本单元 `data-node-id` 子树，查看对应 `reference-preview.png`。**这是参考不是终稿**（D2）——绝不把 React+Tailwind 原样照抄到非 React/Tailwind 项目，而是据 `.tsx` 逐字段改写。不要拿整页低分辨率图替代 reference preview 做依据。
2. **适配项目栈**（用步骤 0 探测结果；探测不到则 AI 选最合理的）：
   - 框架：React / Vue / RN / Svelte —— 用项目框架写法重写结构。
   - 样式：Tailwind / CSS Modules / styled-components / SCSS —— 用项目既有方案表达。
   - 规范：命名、文件组织、lint 按项目既有配置（D3）。
   - **兼容范围（D5）**：按步骤0 探测的 `browserslist`/`tsconfig` target/构建 target/autoprefixer 约束语法——不用目标环境不支持的 CSS（`:has()`/`@container`/旧版 `gap` 于 flex/`inset` 简写/`aspect-ratio` 等）或未转译 ES 语法；命中风险降级到等价兼容写法，无等价则卡点说明；探测不到则向项目现有源码已用写法看齐，不擅自升级。
3. **Token 适配**（见下节）。
4. **复用而非重写**：步骤 2 命中的下层单元直接 `import` 并传 props，不重新实现（D1）。
5. **资源引用（B7）**：**扫描用户提供的资源目录**，按语义名 + 用途匹配现存资源，引用其本地路径（B2：不写在线链接、不 base64）；**缺失则就地按单元提示用户补齐(jit)**、补齐后继续。背景填充图按 B6 整图铺满（见下节）。详见 [04-asset-handling.md](04-asset-handling.md)。
6. **按设计稿补全交互态 / 响应式**（见下节）。

## Token 适配

1. `get_variable_defs` 提取该 node 的 Figma 变量（颜色 / 间距 / 字号 / 圆角等），得到「变量名 → 值」。
2. **项目有 token 体系**（探测到 tailwind.config / SCSS 变量 / theme.ts / `:root` CSS 变量）→ 映射到既有 token 引用：

   | 项目 token 体系 | 引用写法示例 |
   | --- | --- |
   | Tailwind | `class="bg-primary-500 p-4 rounded-lg"` |
   | CSS 变量 | `color: var(--color-primary-500)` |
   | SCSS | `color: $color-primary-500` |
   | TS theme | `theme.colors.primary[500]` |

3. **引用 token，不写裸值**（避免散落魔法值；值本身仍以 Figma 精确值为准）。
4. **项目尚无 token 体系**时：生成最符合该项目栈的 token 设置（Tailwind 写进 `theme.extend`；纯 CSS 建 `:root`；SCSS 建变量文件），再引用。

## 背景填充图实现（约束 B6）

被判定为"背景填充图"的导出图（最底层 z 序、bbox≈父容器框、有内容叠在其上）：

1. **整图作容器背景铺满**：`background-image:url(<本地路径>); background-size:100% 100%; background-position:center;`，容器宽随内容自适应。
2. **禁止反推内部**：不要从该图内部矢量的紧致 bbox、或中间 wrapper 的 `inset[...]` 去推算像素条带的尺寸/位置（这是常见错法）。
3. 用户提供的背景图已编码好内部元素位置与透明留白，**直接用即可**。判定与决策树见 [04-asset-handling.md](04-asset-handling.md)。

## 字体保真（约束 C）

1. **字体族 / 字重 / 字号严格取自** source `.tsx` / `get_variable_defs` / `get_design_context`，**禁自作主张替换字体**（C1）；关键字行高等保留原样（A5）。
2. 检测到项目未引入的第三方字体 → 在**卡点明确提醒用户补充字体资源**（按 B7 由用户语义命名放入项目）。
3. 字体到位前**不得用近似字体顶替后默不作声**；如确需临时降级，必须在卡点显式标注「临时用 X 顶替 Y，待补」（C2）。

## 间距与定位还原（约束 A4，全维度）

「间距」是全维度的，不只竖直：竖直/水平间距、四边内边距 padding（可不对称）、留白/insets、对齐、行列/网格 gap、绝对偏移，**逐一取值、禁猜**。

1. **归属**：间距 / 对齐 / 留白属于**父容器**；子单元各向**零外边距**、自包含，便于复用与重生成。模块单独实现时不要把"到上一个模块的间距"写进模块自身。
2. **优先读父容器布局**：对容器跑 `get_design_context`——Auto Layout 取「**方向** + `itemSpacing`(主轴间距) + **四边 `padding`** + **对齐** + wrap 的行/列 gap + 子项 override」，映射成项目的 flex/grid + gap/padding。
3. **绝对定位用坐标差**（坐标同父系，来自 `get_metadata`）：
   - 竖直间距 `= 下一个.y − (当前.y + 当前.h)`
   - 水平间距 `= 下一个.x − (当前.x + 当前.w)`
   - 左 inset `= 子.x − 父.x`；右 inset `= (父.x + 父.w) − (子.x + 子.w)`；上/下 padding 同理
4. **禁假设**：左右/上下可**不对称**、各间距可**不等**、对齐**未必居中**——每一处单独取值（A1/A4）。实测本类稿：竖直间距多为 20px 但有 68px 例外；水平 insets 有 `x=16 w=343`（左右各 16）与 `x=0 w=375`（全宽通栏）两种。
5. **隐藏节点**（`hidden=true`）不计入间距，但可解释相邻可见单元间距为何偏大（中间压着隐藏占位）。

### 分模块导出的布局风险（A7）

如果处于 fallback 分模块导出，先用 `extract-spec.mjs <fallback.tsx> --json` 查看 `layoutRisk`：

1. 命中 `absolute/relative contents + left/top/right/bottom/inset/margin` 时，不要保留这个 wrapper 的布局表达；`display:contents` 不生成盒子，偏移会丢失。
2. 对顶部帽、卡片内缩、重叠装饰层、背景叠层等结构，几何关系优先取整稿 source/稳定父级导出和 `get_metadata` 坐标差。
3. 典型还原：若帽子 `x=0,w=359`，白卡 `x=8,w=343`，则父容器宽 `359px`，白卡相对帽子 `left/top=8px`；禁止因 fallback `.tsx` 的 `contents` wrapper 塌陷而把白卡写成 `x=0`。

### 响应式（仅布局层，数值仍严格按设计 · A4）

布局**结构**响应式化，数值**保真**——两者不冲突：

1. **去掉非必要写死的容器宽高**：容器宽度优先用 `100%` / `flex:1` / `auto`，不写死 `375px` 之类，让其随父容器自适应。
2. **用 flex/grid + gap/百分比/auto 表达布局关系**：方向、对齐、主轴间距用 Auto Layout 映射的 flex/grid + gap，而非堆绝对定位/魔法 margin。
3. **数值仍严格取设计值**：间距/字号/圆角/颜色/边框等具体数值照旧逐字段对照 `.tsx`，**不因"响应式"放松保真**（不与 A1/A3 冲突）——响应式只改"怎么排"，不改"值是多少"。
4. **单一画板按该尺寸实现、不臆造断点**；有多尺寸画板才按断点分别实现（见下「响应式」小节）。

### 亚像素描边（1px / 0.5px）

设计里 `1px` / `0.5px` 这类亚像素描边，在高 DPR 下直接写易被取整或显示偏粗。实现方式：**设置原始值（如 `1px`）再用 `transform: scale()` 缩放**到目标视觉粗细（例如外层元素正常尺寸，描边层 `height:1px; transform:scaleY(0.5); transform-origin:center;`），而不是直接写一个非整数像素值。具体倍率取自设计真实值（A1）。

## 按设计稿补全交互态 / 响应式

**完全以设计稿为依据，不看项目约定、不臆测**（约束 A）：

1. `get_metadata` 看同级节点、`search_design_system` 看 component set 变体，找出设计稿给出的状态帧（正常 / hover / 点击 / 加载 / 禁用）。
2. 找到几个状态就实现几个，逐个对照还原；若状态帧在目标 UI node 内，直接从整稿 source `.tsx` 按 `data-node-id` 定位；若状态帧是目标外的独立 node，把该状态帧作为新的目标 UI node 走整稿预拉取，不默认分模块下载。
3. 响应式：有多尺寸画板（mobile / desktop）则按各断点分别实现；只有单一尺寸时按该尺寸实现，不臆造断点。

## 要点

- **禁过度组件化（D4）**：单纯图片、无复用的简单结构直接内联实现，不为其单独抽组件/独立单元——降低仪式成本，避免一堆只用一次的薄包装。是否抽取以"是否被多处复用"为准（见 [01-structure-analysis.md](01-structure-analysis.md)）。
- 分批生成：单元粒度小，避免输出截断、省 MCP 速率。
- 重生成以 `node-id` 为锚点，只更新对应节点，不冲掉人工改动。
- 生成后立即过项目 lint，纳入 Definition of Done；再进 3c 人工审核。
- **兼容范围（D5）**：产出语法限定在步骤0 探测到的目标环境内（探测不到则向现有源码看齐），不引入项目不支持的 CSS/ES 特性；命中风险降级或卡点说明。
- 本步相关约束：A1/A2/A3/A4/A5/A6/A7、B1/B2/B4/B6/B7、C1/C2、D1/D2/D3/D5、G1/G2。

下一步：[05-visual-verification.md](05-visual-verification.md)（3c 预览截图对照 + 人工审核）；资源处理详见 [04-asset-handling.md](04-asset-handling.md)。
