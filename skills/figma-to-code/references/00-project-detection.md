# 00 · 项目探测（运行时，零配置）

本机制零配置——不读任何项目档案文件。每次开工前，先探测项目既有的栈 / 组件 / Token / 资源策略，并按统一原则决定怎么做：

> **总原则**：项目中**有**约束或既有实现就**遵循它**；**没有**就按下表的缺省策略处理（自行决定 / 生成最合适 / 按铁律实现）。两类例外：交互态与响应式**完全按设计稿**；审核方式由本 skill 写死（人工审核，不依赖项目）。

## 逐领域探测表

| 领域 | 探测什么（命中即遵循） | 没有时的缺省 |
| --- | --- | --- |
| 技术栈 / 样式 | `package.json`（依赖/scripts）、框架配置（`vite.config`/`next.config`/`vue.config`/`angular.json`/`metro.config`）、lint/格式化（`.eslintrc*`/`.prettierrc*`/`biome.json`）、`tsconfig.json`、既有源码写法 | AI 自行选最合理的栈与样式方案 |
| 兼容范围（D5） | `browserslist`（`package.json` 字段 / `.browserslistrc`）、`tsconfig.json` 的 `target`/`lib`、构建工具 target（`vite`/`esbuild`/`babel.config`/`@babel/preset-env` 的 targets）、是否配 autoprefixer / postcss-preset-env / `@tailwindcss` 的目标、`engines` | 无明确配置时**向项目现有源码的语法看齐**（保守取齐已用到的最低写法），不擅自引入更新的 CSS/ES 特性 |
| 组件目录 / 命名 | 既有组件目录与其命名风格（运行 `scan-components.mjs`）、barrel `index` 导出、目录分层（atoms/molecules 或扁平或按域） | 不强制结构，AI 按需新建并保持自洽 |
| 设计 Token | `tailwind.config.*`（theme）、SCSS/LESS 变量文件、`theme.ts`/`tokens.ts`、`:root` CSS 自定义属性、`design-tokens.json` | 生成最符合该项目栈的 token 设置（如 Tailwind 项目写进 theme.extend；CSS 项目建 `:root` 变量） |
| 资源落地 | 既有图标体系（SVGR / sprite / `<Icon>` 读目录 / iconfont）、`src/assets`、`public/`、CDN 用法、既有图标库 | 选**资源分支**（默认 B）：分支 B 用户提前语义命名备好 + 提供目录；分支 A agent 用 `get_screenshot` 导出确定项 + manifest 标不确定项待用户裁决。两分支下游引用一致（B3/B7，见 04） |
| 交互态 / 响应式 | —（不看项目约定） | **完全按设计稿**：见下 |
| 审核方式 | —（不看项目约定） | **本 skill 写死**：步骤 2.5 统一把 Figma 导出代码逐字存为 `.tsx`，登记 registry 并生成 `reference-preview.png`；交付代码保存 `implementation-preview.png`，由**人工对照两张预览截图 + 逐属性核对原始 `.tsx`/期望表**审核（无像素对比，见 05） |

## 交互态 / 响应式：完全按设计稿

不要靠项目默认或臆测补交互态。主动去设计稿里找：

- **状态帧**：同一组件的 `正常 / hover / 点击(pressed) / 加载(loading) / 禁用(disabled)` 等同级帧或变体（Figma component set 的 variants，或相邻命名帧）。用 `get_metadata` 看同级节点、`search_design_system` 看 component set 的变体属性。
- **断点 / 响应式**：设计稿里若有多个尺寸的画板（如 mobile / desktop 帧），按各断点分别实现；只有单一尺寸时按该尺寸实现，不臆造断点。
- 找到几个状态就实现几个状态，以设计稿为唯一依据。

## 探测怎么做（命令与信号）

```bash
# 栈/规范：看依赖与配置文件
cat package.json            # 框架、样式库、storybook、playwright、scripts
ls -a                       # 各类 *.config.* / .eslintrc* / tsconfig.json

# 组件目录与命名（自动探测常见目录，或 --root 指定）
node scripts/scan-components.mjs

# Token：搜既有体系
# tailwind.config.* / *.scss 变量 / theme.ts / :root { --... }

# 兼容范围（D5）：目标浏览器 / ES target
cat .browserslistrc 2>/dev/null            # 或 package.json 的 "browserslist" 字段
# tsconfig.json 的 compilerOptions.target / lib
# babel.config / @babel/preset-env 的 targets、vite/esbuild 的 build.target
# package.json 的 "engines"、是否依赖 autoprefixer / postcss-preset-env
```

把探测结论一句话记下来（栈=? 样式=? 组件目录=? Token 体系=? 资源策略=? 资源分支=A/B 默认B? 兼容范围=?），作为后续 02~05 的依据。

> **兼容范围怎么用**：探测到目标环境后，3b 生成代码时按它约束语法——不引入目标浏览器不支持的 CSS（`:has()`、容器查询 `@container`、`:is()`/`:where()` 在旧版、`gap` 于旧 flexbox、`inset` 简写、`aspect-ratio` 等）或未转译的 ES 语法；命中风险降级到等价兼容写法，无等价则卡点说明（D5）。**探测不到任何配置时，以项目现有源码已经在用的写法为上界**，不擅自"升级"。
