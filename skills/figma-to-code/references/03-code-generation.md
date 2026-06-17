# 03 · 代码生成

目标：在 `facts-ready` 之后，把每个待建模块生成符合项目栈的代码。3b 的事实源是该模块自己的 reference `.tsx`、reference preview、metadata/geometry 和属性校验记录。

> 开工前必须读取 `PROGRESS.md` 并运行 `flow-guard --before 3b`。未通过时禁止写项目代码。

## 事实源优先级

1. **模块 reference `.tsx`**：`.figma-to-code/preview/src/modules/<nodeIdSafe>.tsx`，负责叶子样式、文案、字体、颜色、显式尺寸等。
2. **metadata/geometry**：负责模块几何、父子关系、坐标差、尺寸、可见性、隐藏节点和组合间距。
3. **reference preview**：负责视觉对照，不替代属性表。
4. **use_figma**：当 reference `.tsx` 缺少 cornerRadius、fills、strokeWeight、opacity、effects 等真实属性时读取真值。
5. **可选整稿 source**：仅作结构参考或小节点优化，不替代模块 facts gate。

## 3b 生成前检查

```bash
node .agents/skills/figma-to-code/scripts/flow-guard.mjs --before 3b
```

通过后再逐模块生成。若用户中途要求局部修复，也必须先过相同 gate；否则只能继续补模块事实源。

## 数据保真

- 所有设计值必须来自模块 reference `.tsx`、metadata/geometry、变量定义或 `use_figma`。
- 禁凭视觉猜值，禁跨实例复制近似值。
- 关键字值（`normal`/`auto`/`none`）原样保留。
- 文案按设计稿原文，不改写、不占位。
- reference `.tsx` 出现 layoutRisk 时，布局几何回到 metadata/geometry；该 `.tsx` 只作叶子属性参考。

## 单元生成流程

1. 打开本模块 reference `.tsx` 与 `reference-preview.png`。
2. 查看 metadata/geometry，计算父容器 padding、gap、坐标差和模块组合间距。
3. 扫描项目组件：命中复用则 import，不重建。
4. 扫描用户资源目录，按语义名引用本地资源；缺失则停下提示补齐。
5. 把 Figma React+Tailwind 按项目实际栈翻译，例如 React+TS+SCSS、Vue、RN 等；不得照抄 Tailwind 终稿。
6. 只实现设计稿给出的交互态/响应式，不臆造额外状态。
7. 写完立即进入 3c-auto，不得跳到下一模块。

## Token 与字体

- 项目已有 token 体系时，映射到既有 token；没有时使用局部变量或项目风格允许的裸值。
- 字体族、字重、字号严格来自设计稿。
- 缺失字体在卡点列出；临时降级必须显式标注。

## 间距与定位（A4）

间距属于父容器，子模块自包含且零外边距。

计算方式：

```text
竖直间距 = next.y - (current.y + current.h)
水平间距 = next.x - (current.x + current.w)
左 inset = child.x - parent.x
右 inset = (parent.x + parent.w) - (child.x + child.w)
上/下 padding 同理
```

不要假设左右/上下对称。隐藏节点不计入可见间距，但可解释相邻可见模块间距为何偏大。

## 资源处理

- CSS 能实现的不要切图。
- 项目代码只引用本地资源，禁 Figma 在线链接和 base64。
- 背景填充图作为容器 background 铺满。
- 用户提供的成品图按设计摆放框展示，禁用文件像素或内部矢量 bbox 反推尺寸。

## 3b 完成条件

- 代码只覆盖当前批次范围。
- 所有引用资源存在。
- 关键设计值能追溯到模块 facts。
- 未处理的未知项写入卡点。
- 随后立即跑 `extract-spec.mjs` 做 3c-auto。
