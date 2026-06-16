# 07 · 端到端最小范例（小标题，HTML+CSS 栈）

目标：用一个最小但完整的工作单元，演示从步骤 2.5 统一预拉取到最终交付 CSS 的实际产物与衔接动作。它展示的是“一趟正确流程长什么样”：reference `.tsx` 负责属性事实源，reference preview 负责视觉参照，implementation preview 负责最终对照。

> 本文数值是示例：`22px / #333 / 40px` 等都来自这个特定 node。你的实现一律以自己的 `get_design_context` 返回为准，不要把这里的具体值当通用默认值。
>
> 范例栈为 HTML+CSS；React/Vue 等栈把第 ⑤ 步换成对应写法即可，前 4 步与第 ⑥ 步通用。

---

## 目录

- [输入](#输入)
- [2.5 预拉取](#①-25--统一预拉取-get_design_context-参考代码节选)
- [3a 本地事实源确认](#③-3a--本地事实源确认)
- [3c-auto 属性表](#④-3c-auto--a6-映射表由-extract-specmjs-自动产出agent-核对不再手填)
- [3b 产出代码](#⑥-3b--产出项目代码html--css)
- [3c 预览截图对照](#⑦-3c-auto--3c--自动校验--预览截图对照f4--f1--f2--f6)

## 输入

- 工作单元：小标题，`node-id = 2507:10307`
- `nodeIdSafe = 2507-10307`
- 项目栈（步骤 0 探测结论）：HTML + CSS、资源目录 `demo/assets/`、字体 `zihunxinquhei`

---

## ① 2.5 · 统一预拉取 get_design_context 参考代码（节选）

```tsx
// 容器：h-[40px] overflow-clip relative w-[132px]
<div className="h-[40px] overflow-clip relative w-[132px]" data-node-id="2507:10307">
  <div className="absolute h-[40px] left-0 top-0 w-[133px]">
    <div className="absolute h-[8.532px] left-[2.5px] top-[22.76px] w-[125.5px]">
      <img src={img5081} />   {/* 下划线标记图 */}
    </div>
    <p className="font-['zihunxinquhei:Regular'] leading-[normal] not-italic text-[#333] text-[22px] whitespace-nowrap">
      我的学习表现
    </p>
  </div>
</div>
```

设计变量提示：`中性色/Color_Gray_02: #333333`。

## ② 2.5 · 逐字存 .tsx + registry + reference preview

- 逐字保存为 `.figma-to-code/preview/src/modules/2507-10307.tsx`（零修改，图片用导出在线链接）。
- 登记到 `src/registry.ts`：`{ id:'2507:10307', name:'小标题-中', Component, w:132, h:40 }`。
- 起 Vite/React 预览，确认编译无报错、字体和图片加载正常，非标 `font-['zihunxinquhei:...']` 由 `figma-shim.css` 兜底。
- 保存 `.figma-to-code/screenshots/2507-10307/reference-preview.png`，并把路径写入 `.figma-to-code/PROGRESS.md`。

## ③ 3a · 本地事实源确认

实现该单元前不再重新下载全量代码，只确认步骤 2.5 的本地事实源可用：

```text
[x] preview/src/modules/2507-10307.tsx 存在
[x] registry 已登记 2507:10307 / w=132 / h=40
[x] screenshots/2507-10307/reference-preview.png 存在且可打开
[x] preview 服务编译无 error
```

若图片链接过期或 reference preview 失效，只对 `2507:10307` 单点重拉 `get_design_context`，覆盖 `.tsx` 并重截 reference preview。

## ④ 3c-auto · A6 映射表（由 extract-spec.mjs 自动产出，agent 核对，不再手填）

跑 `node scripts/extract-spec.mjs .figma-to-code/preview/src/modules/2507-10307.tsx`，脚本机器抽出「期望属性表」（见 [08-attribute-verification.md](08-attribute-verification.md)）：

```text
[node 2507:10307] 叶子(自动比对):
  height: 40px            ← 易漏，必落
  overflow: hidden        ← (overflow-clip) 易漏，必落
  font-size: 22px         ← (text-[22px])
  color: #333             ← (text-[#333])
  line-height: normal     ← 关键字保留，禁具体化 (A5)
  font-family: 'zihunxinquhei:Regular'  ← 伪字体族，映射回真实族
  white-space: nowrap
  font-style: normal      ← (not-italic)
布局(人工/A4): absolute, left-0, top-0
```

agent 拿这张表逐项落到产出代码（3c-auto），不再凭记忆手填。文字撑开宽度，所以 `display:inline-block`，不写死 `w-[132px]`。

## ⑤ 3b · 资源判定（B6 + B7）

- 标记图文件名 `small-title-marker-marks-bg.png` 含 `bg` → 判定捷径：直接当背景填充图，整图铺满，不反推 `left-[2.5px] top-[22.76px] w-[125.5px]` 等内部坐标。

```css
/* 错法：从 inset 反推内部坐标 */
background-position: 2.5px 22.76px;
background-size: calc(100% - 6.5px) 8.532px;

/* 对法：直接作容器背景铺满 */
background: url("../assets/images/small-title-marker-marks-bg.png") no-repeat;
background-size: 100% 100%;
```

## ⑥ 3b · 产出项目代码（HTML + CSS）

```html
<div class="small-title"><span class="small-title__text">我的学习表现</span></div>
```

```css
.small-title {
  display: inline-block;          /* 宽度由文字撑开 */
  height: 40px;                   /* h-[40px] */
  overflow: hidden;               /* overflow-clip */
  background: url("../assets/images/small-title-marker-marks-bg.png") no-repeat;
  background-size: 100% 100%;     /* B6 直接铺满 */
}
.small-title__text {
  display: block;
  font-family: "zihunxinquhei", "PingFang SC", -apple-system, sans-serif;
  font-size: 22px;                /* text-[22px] */
  color: #333;                    /* text-[#333] */
  line-height: normal;            /* leading-[normal]，关键字保留 */
  font-style: normal;             /* not-italic */
  white-space: nowrap;            /* whitespace-nowrap */
}
```

## ⑦ 3c-auto + 3c · 自动校验 + 预览截图对照（F4 / F1 / F2 / F6）

**3c-auto（脚本兜叶子属性）**：agent 拿 ④ 的期望表逐项比对 ⑥ 产出代码，确认无漏/错：

```text
[x] height 40px        [x] overflow hidden
[x] font-size 22px     [x] color #333
[x] line-height normal （未被具体化 A5）
[x] font-family zihunxinquhei（伪族已映射）
```

**3c（人工）**：

- 渲染产出侧（此例打开 `demo/index.html`），保存 `.figma-to-code/screenshots/2507-10307/implementation-preview.png`。
- 对照 `.figma-to-code/screenshots/2507-10307/reference-preview.png` 与 `implementation-preview.png`。
- 人工聚焦自动管不了的：背景图整图铺满、随文字宽度自适应、整体观感、布局/间距/A4。
- 通过 → 3d 登记，进下一单元；不通过 → 说明差异，回 3b 修正并重走 3c-auto/3c。

---

## 这个范例堵住的真实坑

1. **A6 漏属性**：凭记忆写会漏 `h-[40px]` / `overflow-clip`（视觉上不明显，肉眼审核也难发现）→ 由 `extract-spec.mjs` 出期望表 + 3c-auto 逐项比对兜住（F4）。
2. **B6 反推内部坐标**：看到 `left-[2.5px]/top-[22.76px]` 就去精确定位背景 → 应按“文件名含 bg → 直接铺满”处理。
3. **A5 关键字具体化**：把 `leading-[normal]` 写成某个 px 数字凑高度。
4. **动态宽度**：宽度由文字撑开的单元，不要写死 `width: 132px`。
