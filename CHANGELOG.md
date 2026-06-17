# Changelog

本文件记录每次 skill 的变更，供用户判断是否需要更新。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

---

## [1.2.1] - 2026-06-17

### Changed

- `figma-to-code`：步骤 2.5 默认改为整稿一次性导出目标 UI node，分模块导出仅作为记录原因后的 fallback。
- `figma-to-code`：`extract-spec.mjs` 支持 `--node-id` 从整稿 `.tsx` 抽指定子树，并报告 `display: contents` 承担定位职责的布局风险。
- `figma-to-code`：强化 source/reference/implementation 预览截图清晰度与 `PROGRESS.md` 字段要求。

## [1.2.0] - 2026-06-16

### Added

- `figma-to-code`：将 Figma 设计稿转换为保真、可验证、复用现有组件的前端代码

## [1.1.0] - 2026-04-09

### Changed

- `spec-driven-learning`：强化实施阶段产出要求
  - 代码文件中关键逻辑块必须添加注释（说明「为什么」而非「写了什么」）
  - `.md` 笔记须包含知识点详细介绍与推导过程，不能只写结论
  - 示例代码后必须附逐块解释
  - 核心原则新增「注释完备」和「文档详尽」两条

## [1.0.0] - 2026-04-09

### Added

- 初始化项目结构
- `spec-driven-learning`：使用 OpenSpec 结构管理系统性技术学习项目
