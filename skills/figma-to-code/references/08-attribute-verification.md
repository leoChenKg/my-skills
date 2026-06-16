# 08 · 属性级自动校验（脚本抽期望表 + agent 逐项比对）

目标：堵住"生成代码时**静默漏/错叶子样式属性**"（`overflow-clip` 漏掉、`leading-[normal]` 被具体化成数字、颜色/字号写错）——这是 design-to-code 最常见、且**肉眼审核最难发现**的翻车点（见 [07-worked-example.md](07-worked-example.md) 头号坑）。

> 流程位置：步骤 3 的 **3c-auto**，在 3b 代码生成之后、3c 人工审核之前（约束 F4 叶子属性 + F5 不可见层自检）。

## 机制：脚本只抽"期望表"，比对由 agent 做

```text
原始 .tsx ──extract-spec.mjs(静态解析)──▶ 逐 node 期望属性表
                                              │
agent 生成的代码 ──────────────────────────┴──▶ agent 逐项比对 ──▶ 漏/错差异 ──▶ 修正 ──▶ 复跑
```

- **确定性在"支持模式的抽取"**：`node scripts/extract-spec.mjs <模块.tsx>` 机器解析，对已支持的 Tailwind/Figma class 模式确定性抽出样式属性；未知、非标、未解析项必须进入清单由 agent 人工核对，不能假装已覆盖。agent 不再凭记忆列"该查哪些属性"，而是以脚本输出 + 未知项清单作为核对入口。
- **比对由 agent 执行**：agent 擅长读自己刚生成的代码，拿期望表逐项核对。
- **不渲染、不碰预览、不用浏览器**：自动校验是纯静态脚本 + agent 比对，零运行时依赖；预览子包与截图只供 2.5/3c 的视觉参照和人工审核。

## 期望表分三类（脚本输出）

1. **叶子(自动比对)**：font-size / font-weight / font-family / line-height(保留 `normal` 等关键字) / letter-spacing / text-align / white-space / font-style / text-transform / color / 显式 width·height / padding-* / border-radius / border / background(-color) / box-shadow / overflow / gap / 任意属性 `[prop:value]`（如 `word-break`）。**这些是 agent 必须逐项比对的对象。**
2. **布局(人工/A4)**：`absolute`/`relative`、`inset/top/left/right/bottom`、`margin`、`flex`/`grid` 排布、`translate/rotate/scale` 等——`.tsx` 是 Figma**绝对定位导出**、产出是**语义化重写**，二者天然不同，**自动判会大量误报**，故只标注、不自动判对错，归**人工 + 约束 A4**（间距取值见 [03-code-generation.md](03-code-generation.md)「间距与定位还原」）。
3. **非标(figma/shim) / 未知(agent 人判)**：`col-N`/`row-N`/伪字体族等非标 Figma 类原样列出；脚本未覆盖的类进"未知"清单——**必须逐个确认设计含义再落代码，不得忽略**。

## 用法与闭环（3c-auto）

```text
1. node scripts/extract-spec.mjs .figma-to-code/preview/src/modules/<nodeIdSafe>.tsx
2. agent 拿「叶子」逐项对照本单元生成代码：
   - 期望表有、代码没有 → 漏属性 → 补
   - 值不一致（如 line-height 被写成 30px 而期望 normal）→ 错 → 改（A5：关键字禁具体化）
   - 伪字体族需映射回真实族（C 字体保真）
3. 「布局项」由人工在 3c 按 A4 核对（自动不接管）
4. 「非标/未知」逐个人判后落代码
5. 不可见层自检（F5）：装饰层 fill vs 父容器背景色色差，≈ 则回查真实色再填（见下「不可见层确定性自检」）
6. 全部对齐（或差异已在卡点说明）→ 进 3c 人工审核
```

## 不可见层确定性自检（F5，3c-auto 之后）

叶子属性比对之后，再做一道**确定性自检**，堵住"设计里有、产出里看不见"的静默丢弃层（如白圈叠白卡、白字叠白底）——这种层肉眼审核也极易漏。

```text
对本单元每个"用 CSS 还原的装饰层"（背景/描边/光晕/分隔等纯装饰）：
1. 取该层的实际填充色 fill（生成代码里写的值）
2. 取其所在容器的背景色 bg（父链上第一个非透明背景）
3. 计算色差（如 sRGB 欧氏距离 / ΔE）：
   - fill ≈ bg（差异极小、且该层无边框/阴影等其他可见性来源）
     → 判定"该层等于没画" → 回查设计真实色（优先 get_design_context 该节点 var defs / use_figma 读 fills）再填
   - fill 与 bg 有可感知差异 → 通过
```

- **典型场景**：头像外圈半透明白 `rgba(255,255,255,0.3)` 叠白卡 → 几乎不可见；真实色常是浅色变量（如 `Color_Orange_03 #FFF3EB`），逐实例读真值即可（见 A1 / [03-code-generation.md](03-code-generation.md)）。
- **由 agent 计算**：色差比对由 agent 执行（读自己生成的 fill 与父背景），不新增脚本；与 A1「禁跨实例复制猜测值」联动。
- **呼应 F5**：设计里存在的层，产出里必须"看得见"地存在。

## 映射覆盖（Tailwind 任意值 → CSS）

`h-[]`→height、`w-[]`→width、`size-[]`→width/height、`p-/px-/py-/pt-/pr-/pb-/pl-[]`→padding、`text-[16px]`→font-size、`text-[#hex]`→color、`leading-[]`→line-height、`font-['..']`→font-family、`tracking-[]`→letter-spacing、`gap-[]`→gap、`rounded(-corner)-[]`→border-radius、`border-[]`→border-width/color、`bg-[]`→background-color/image、`shadow-[]`→box-shadow、`opacity-[]`→opacity、`[prop:value]`→该 CSS 属性；关键字类 `whitespace-nowrap`/`overflow-clip`/`not-italic`/`font-bold` 等直接映射。`text-[..]` 按值是色还是长度自动判 color/font-size。未覆盖的进"未知"，绝不假装解析。

## 局限（如实知会）

- **比对非编译级铁证**：支持模式的抽取是确定的，但脚本不承诺覆盖所有样式来源；"比对"仍靠 agent 读代码，未知/未解析项必须人工核对。因此它高于自由发挥，却不是 100% 机械证明，必须保留 3c 人工审核做最终把关。
- **不覆盖布局/定位/间距**（A4）：设计上排除，人工仍需做。
- **任意值含空格的极端字体族名**（`font-['Family Name']`）可能拆词，遇到时人工确认。

## 与其他文档的关系

- [07-worked-example.md](07-worked-example.md) ④ 的「A6 强制映射表」：现由 `extract-spec.mjs` 自动产出，agent 核对而非手填。
- [05-visual-verification.md](05-visual-verification.md) 的 3c 人工审核：叶子属性已由本步 3c-auto 兜底，人工聚焦**布局 / 整体观感 / A4**。
