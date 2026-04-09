# my-skills

个人 AI Agent Skills 库，适用于 Cursor、Claude Code、OpenCode 等工具。

遵循 [Agent Skills 规范](https://agentskills.io)。

## 安装

使用 [`npx skills`](https://github.com/vercel-labs/skills) 一键安装：

```bash
# 交互式选择安装哪些 skill
npx skills add sunshine/my-skills

# 安装全部
npx skills add sunshine/my-skills --all

# 全局安装（所有项目可用）
npx skills add sunshine/my-skills -g

# 只安装到指定工具
npx skills add sunshine/my-skills -a cursor -a claude-code
```

## Skills 列表

| Skill | 描述 |
|-------|------|
| [spec-driven-learning](./skills/spec-driven-learning/) | 使用 OpenSpec 结构管理系统性技术学习项目 |

## 目录结构

```
my-skills/
└── skills/
    └── <skill-name>/
        ├── SKILL.md          # 必须，包含 name、description frontmatter
        ├── reference.md      # 可选，详细参考文档
        └── scripts/          # 可选，辅助脚本
```

## 新增 Skill

```bash
# 用官方模板初始化
npx skills init my-new-skill

# 然后把生成的目录移入 skills/
mv my-new-skill skills/
```

每个 `SKILL.md` 必须包含：

```markdown
---
name: skill-name
description: 描述这个 skill 做什么，以及什么时候触发（第三人称）
---

# Skill 标题

具体指令...
```

## 浏览更多 Skills

- [skills.sh](https://skills.sh) — 社区 Skills 目录
- [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) — 官方示例库
