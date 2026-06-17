# 01 · 结构分析（统一单元模型 + 依赖批次）

目标：把一个 Figma node（页面 / Frame / 区块）拆成一组**可独立实现的工作单元**，理清依赖、复用、组合关系，并据依赖拓扑切成「实现批次」。这是后续复用判定、分批生成、卡点 review 的基础。

> 本步结束有 **卡点①**：必须停下，把拆分结果给用户 review 确认后才能继续（约束 E1/E3）。

## 输入

- 一个 Figma URL 或 `fileKey` + `node-id`。
- 从 URL 解析：`figma.com/design/:fileKey/...?node-id=1789-7671` → `node-id` 把 `-` 换成 `:` 得 `1789:7671`。
- URL 无 `node-id` 时向用户索要节点级链接，不臆造 ID。

## 核心：统一工作单元模型

> **本步不碰资源**：结构分析只产出"模块拆分 / 依赖 / 复用 / 批次"，**不探索、不列任何资源**。资源在实现期由用户提前语义命名备好并提供目录，agent 在 3b 扫描引用（见 [04-asset-handling.md](04-asset-handling.md)）。

不区分「公共组件 / 业务模块」两类，统一为「工作单元」。每个单元有层级标注，层级只表示**依赖深浅**，不表示流程阶段：

```text
原子   (atom)      : Button、Input、Icon、Tag …
分子   (molecule)  : SearchBar(=Input+Button)、Card …
子模块 (sub-module): 由分子/原子组合的中等区块（如 CourseCard、FilterBar）
大模块 (module)    : 由子模块组合的业务区块（如 CourseList、Header）
页面   (page)      : 由大模块组合的完整页面
```

任意层级都可被更高层复用；大单元复用已建的小单元（嵌套组合）。

## 步骤

1. **拿结构概览**：先用 `get_metadata`（传 `fileKey` + `nodeId`）拿节点树（层级、命名、类型、尺寸、相对位置），开销远小于 `get_design_context`，适合先摸全貌。**概览取图策略**：若节点长边超出分辨率预算（约 1500px），不要截降采样整页单图，改为对 `get_metadata` 列出的顶层模块 frame 逐个/相邻几个按 1x 截清晰图、按 `y` 坐标顺序查看——按节点边界整帧截图（不按像素切、相邻帧不重叠、元素不被切断，单帧超预算则递归下钻其子帧），既看清模块排布顺序又为后续逐批实现复用清晰图（遵守 F3，详见 [05-visual-verification.md](05-visual-verification.md) 的截图清晰度小节）。
2. **识别工作单元**（按优先级）：
   - Figma **Component / Instance** 节点 → 一个可复用 UI 单元（最高优先，以设计系统定义为准）。
   - 页面里**重复出现的区块**（卡片、列表项、表单行）→ 候选可复用单元。
   - 业务区域（Header / 内容区 / Footer / 各模块）→ 组织/模块单元。
   - 不靠截图猜边界，以节点结构 + 设计系统 Component 为准。
   - **禁过度组件化（D4）**：单纯图片、无复用的简单结构**不抽成独立工作单元/组件**，留待实现期内联——是否抽取以"是否被多处复用"为唯一判据，避免一堆只用一次的薄包装单元。
3. **标注每个单元**：
   - **层级**：原子 / 分子 / 子模块 / 大模块 / 页面。
   - **依赖**：内部用到了哪些更底层单元。
   - **复用关系**：被几个地方引用——**被多处引用的标记为「共享单元」**（需提前实现，避免重复造）。
   - **组合关系**：哪些子单元组合成它（嵌套），并记录**父容器布局模式**（方向 / `itemSpacing` / 四边 padding / 对齐 / wrap，或绝对定位的坐标），供步骤4 组合时精确还原各向间距与定位（A4）。
4. **切实现批次**（关键产出）：据依赖拓扑做分层排序——
   - 被依赖越多、层级越低的单元越靠前。
   - 共享单元提升到尽量靠前的批次先行实现。
   - 同一批内的单元互不依赖、可并行。
   - 自底向上：底层批次先做、合并、登记，上层批次复用它。

## 输出（建议结构）

```text
目标 node: 1789:7671 (课程首页)
工作单元 + 标注：
- [原子] Button      1789:7680  依赖:—            复用:多处(共享)
- [原子] Icon        1789:7682  依赖:—            复用:多处(共享)
- [分子] CourseCard  1789:7715  依赖:Button,Icon  复用:CourseList 内多次
- [大模块] CourseList 1789:7740  依赖:CourseCard  复用:首页1处
- [大模块] Header    1789:7700  依赖:Icon         复用:首页1处
- [页面] HomePage    1789:7671  依赖:Header,CourseList

实现批次（自底向上）：
  批次1(共享底层): Button, Icon
  批次2: CourseCard
  批次3: CourseList, Header   ← 可并行
  批次4(页面组合): HomePage

依赖图：
  Button,Icon → CourseCard → CourseList → HomePage
               Icon → Header → HomePage
```

## 卡点①（必做）

停下，向用户展示：单元清单 + 层级 + 依赖图 + 复用关系（共享单元）+ 组合关系 + 批次顺序。做一遍约束自检，报告「无违反 / 有破例」，请求确认。用户确认/调整后才进入步骤 2。

> **衔接整稿预拉取（步骤 2.5）**：卡点①确认拆分/批次后，进入步骤 2 复用判定，再到**步骤 2.5 整稿预拉取**——默认只对用户目标 UI node 一次性 `get_design_context`，逐字存为 `.figma-to-code/preview/src/source/<targetNodeIdSafe>.tsx`、登记 source registry，并保存 `.figma-to-code/screenshots/<targetNodeIdSafe>/source-reference-preview.png`。各工作单元后续从整稿 `.tsx` 按 `data-node-id` 定位取值，单元 `reference-preview.png` 从整稿 preview 按 `get_metadata` 坐标裁剪/定位生成。只有整稿导出失败/超时/截断、整稿 `.tsx` 无法编译、或整稿截图无法清晰分块时，才记录 `fallbackReason` 后分模块导出稳定父级/模块；用户目标本身是单组件时，该组件就是整稿 source，不再拆更小。详见 SKILL.md 步骤 2.5。

## 要点

- **大页面必拆**：拆细既提升还原度，又避免输出截断、节省 MCP 速率（约 10 次/分钟）。
- **复用关系决定批次**：漏标共享单元 → 上层批次会各自重造它（违反 D1）。
- 该输出直接喂给步骤 2（复用判定）和步骤 3（分批生成）。

下一步：[02-component-reuse.md](02-component-reuse.md)。
