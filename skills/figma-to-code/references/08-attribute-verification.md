# 08 · 属性级自动校验

目标：用 `extract-spec.mjs` 从模块 reference `.tsx` 抽取期望属性表，防止生成代码时静默漏掉字号、颜色、圆角、overflow、关键字行高等叶子样式。默认输入是模块 `.tsx`，不是整稿 source。

## 覆盖的导出形态

脚本是纯静态正则解析（零依赖、不渲染、不用浏览器），覆盖 Figma `get_design_context` 导出的常见写法：

- **className**：字符串字面量 `className="..."`、表达式 `className={className || "..."}`、模板字面量 `className={\`base ${cond ? "x" : "y"}\`}`（基础类与三元分支类都抽取）。
- **内联 style**：对象式 `style={{ backgroundImage: "linear-gradient(...)" }}` 与字符串式 `style="..."`。落在 style 上的叶子值（渐变、背景图、`maskImage` 等）不再被丢弃；style 里的布局类属性（`left`/`top`/`transform` 等）归布局/人工。
- **边界**：完全动态拼接产出的 class（来自变量、函数返回值，而非字符串字面量）仍可能漏抽——这是不引入 AST 的固有取舍，属预期范围，需在 3c 人工兜底。

## 默认输入

对每个待建模块运行：

```bash
node .agents/skills/figma-to-code/scripts/extract-spec.mjs \
  .figma-to-code/preview/src/modules/<nodeIdSafe>.tsx \
  --node-id <nodeId>
```

在 skill 仓库内开发时，脚本路径为：

```bash
node skills/figma-to-code/scripts/extract-spec.mjs <module-reference.tsx> --node-id <nodeId>
```

整稿 source 只在小节点优化或用户明确要求时作为可选输入；它不再是 3c-auto 的默认前提。

## 输出类别

1. **叶子属性（必须逐项比对）**：font-size、font-weight、font-family、line-height、letter-spacing、text-align、white-space、font-style、text-transform、color、显式 width/height、padding、border-radius、border-width/border-style/border-color、background、background-image（含渐变方向与 `from`/`via`/`to` 色标）、box-shadow/text-shadow、filter（drop-shadow）、object-fit、opacity、overflow、gap、任意属性 `[prop:value]`，以及内联 style 里的同类叶子值（标注「style 内联」来源）。
2. **布局项（人工/A4）**：absolute/relative、inset/top/left/right/bottom、margin、flex/grid 排布、transform、`mask-*`、`pointer-events-*` 等；内联 style 的布局类属性以 `[style] prop: value` 标注。脚本只标注，最终布局以 metadata/geometry + 人工 A4 核对为准。
3. **非标/未知项（必须人判）**：`col-N`、`row-N`、伪字体族、脚本未覆盖的 Tailwind/Figma 类。不得忽略。
4. **被忽略的非 class 字符串字面量**：嵌套条件里被误抓的 prop 取值（如 `["2个tab","4个tab-左边"].includes(prop1)` 的操作数，多含 CJK/空格，必非合法 class）会被剔除，不计入属性表，footer 透明提示「已忽略 N 个」。注意：含 CJK 的**合法**任意值（如 `font-['思源黑体']`）带方括号，已提前归为叶子，不在此列。
5. **layoutRisk（A7）**：`contents + left/top/right/bottom/inset/margin`、`relative contents`、或 metadata 显示 contents 节点承担几何职责。命中后，reference `.tsx` 只作叶子属性参考，布局几何回到 metadata 或稳定父级。

## 3c-auto 闭环

1. 对本批每个模块 reference `.tsx` 跑 `extract-spec.mjs`。
2. 将叶子属性逐项对照生成代码：
   - 期望表有、代码没有：补属性。
   - 值不一致：改回设计值。
   - 关键字值如 `normal`/`auto`/`none`：原样保留，禁具体化成数字。
   - 伪字体族：映射回真实字体族，并记录缺失字体。
3. 将布局项交给 3c 人工审核，按 metadata/geometry 做 A4 间距定位核对。
4. 将未知/非标项逐个人判，说明如何落代码或为何降级。
5. 若输出 layoutRisk，写入 `PROGRESS.md`，并声明哪些布局值回到 metadata。
6. 做不可见层自检。
7. 全部通过或差异已在卡点说明后，才能进入 3c 截图对照。

## 不可见层自检

对本单元每个用 CSS 还原的装饰层：

```text
1. 取该层实际 fill。
2. 取父链第一个非透明背景色。
3. 计算感知差异。
4. fill 近似背景且无边框/阴影等可见来源时，判定“等于没画”，回查设计真实色。
```

常见坑：低对比装饰层、近背景色边框/高光、细分隔线、叠加在近似背景上的浅色层。不得把某个背景上的近似色复制到另一处实例。

## 与 flow guard 的关系

- `extract-spec` 输出或 layoutRisk 记录是 `facts-ready` 的必要条件之一。
- 若 `PROGRESS.md` 中待建模块缺少 `attributeCheck` 且缺少 `layoutRisk`，`flow-guard --before 3b` 必须失败。
- 3b 之后若代码修正影响叶子属性，必须重新跑本模块 3c-auto 或明确记录人工核对结果。

## 局限

- 脚本是静态抽取，不承诺覆盖所有样式来源。
- 覆盖字符串字面量 / 模板字面量 / `{expr || "..."}` 形态的 className 与内联 style；**完全动态拼接**（变量、函数返回值产出的 class）仍可能漏抽，需 3c 人工兜底。
- 布局、定位、间距不做自动判定，必须人工按 A4 核。
- 未知/未解析项必须进入卡点，不能因脚本没识别就当不存在。
- 被忽略的非 class 字符串字面量仅限「明显不是 class」者（含 CJK/空格）；若 footer 提示忽略数异常偏高，回查是否误伤，必要时人工核对该模块。
