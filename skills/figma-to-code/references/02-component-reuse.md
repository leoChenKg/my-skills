# 02 · 复用判定（先查后建闸门，贯穿所有层级）

目标：在生成任何 UI 之前，先判断「这个单元是否已有可复用实现」，命中则复用，未命中才新建。这是「不重复造轮子」的关卡（约束 D1）。账号 Pro 席位无 Code Connect，复用完全靠**组件目录扫描 + 命名约定**。

> **关键**：复用判定**贯穿所有层级**，不止公共原子组件。分子、子模块、大模块在生成前都要先查复用；大模块复用已建的子模块、子模块复用已建的原子/分子。

## 核心理念：代码即唯一真相

不维护任何独立登记表（如 `component-registry.json`）。组件目录本身就是清单，实时扫描即可——零维护、不漂移（改名/删除即时反映）。步骤 1 已实现并合并的单元，自动成为后续批次的复用来源。

## 闸门流程

对步骤 1 识别出的**每个**工作单元执行：

1. **扫现有实现**：`node .agents/skills/figma-to-code/scripts/scan-components.mjs`（自动探测常见组件目录，或 `--root` 指定），输出现有可复用组件清单（名 + 路径）。在 skill 仓库内开发时使用 `node skills/figma-to-code/scripts/scan-components.mjs`。**包含本轮前序批次刚建好的单元**。
2. **对照设计系统**：用 `search_design_system` 搜该单元，确认它在 Figma 设计系统里的标准组件名、变体属性和状态属性。
3. **翻译 Figma 名 → 代码名**：按项目既有命名风格推断映射（看清单里现有怎么命名）。抽象模式：
   - `<FigmaComponent>/<variant>/<size>` → `<CodeComponent variant="..." size="...">`
   - `<FigmaStateProperty>` → `<CodeComponent stateProp="...">`
   - 项目无既有命名可参照时，AI 自行决定一套自洽命名（约束 D3：与项目风格自洽）。
4. **判定**：
   - **命中**（清单里有对应单元）→ 标记「复用」，记下要传的 props，步骤 3 直接 `import`，**不重建**。
   - **未命中** → 标记「待新建」，按依赖拓扑排进对应批次（先建依赖）。

## 多层嵌套 / 组合的复用

- **子模块组合成大模块**：上层单元生成前先查它依赖的子单元是否已建；已建则 import 组合，未建则该子单元必须排在更靠前的批次。
- **共享单元提前排批**：步骤 1 标记的「被多处引用」单元，提升到尽量靠前的批次先行实现并合并，避免多个上层批次各自重造（违反 D1）。
- **复用即停**：命中复用的单元不再进入资源准备/代码生成（它已有实现），只在组合时引用。

## 判定记录（建议结构）

```text
单元             设计系统名/变体        代码名/映射                 判定           批次
<atomUnit>       <componentVariant>     <CodeComponent props>       复用✓/新建      1
<moleculeUnit>   <componentVariant>     <CodeComposite props>       复用✓/新建      1
<subModuleUnit>  —                      <SubModuleComponent>        新建(依赖前序)  2
<moduleUnit>     —                      <ModuleComponent>           新建(组合子单元) 3
```

## 要点

- **首次新建不可避免**：空项目里底层单元总得先造。复用解决的是"避免后续重复造"。
- **命名映射靠推断**：以项目既有命名为准；项目越规整、匹配越可靠。
- **Token 复用门槛最低**：变量本身就是"名字→值"，搜到就能用（详见步骤 3 的 Token 适配）。
- 扫描策略依项目栈而异（TS barrel `index.ts` / Vue SFC / RN 等），`scan-components.mjs` 已覆盖这些形态。

下一步：[03-code-generation.md](03-code-generation.md)。
