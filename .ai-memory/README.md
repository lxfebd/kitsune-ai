# AI 记忆同步库

本目录用于同步 AI 助手（Claude / TRAE Agent）与 Kitsune AI 项目协作过程中的关键记忆。

## 用途

- 记录每次会话的摘要、决策和改动
- 沉淀项目架构知识、踩坑记录、设计决策
- 在后续会话中快速恢复上下文，避免重复探索

## 目录结构

```
.ai-memory/
├── README.md                          # 本文件
├── sessions/                          # 会话摘要
│   └── YYYYMMDD-short-title.md
├── decisions/                         # 架构 / 设计决策记录 (ADR)
│   └── YYYYMMDD-decision-title.md
├── architecture/                      # 架构知识沉淀
│   └── knowledge-framework.md
├── issues/                            # 问题与解决方案
│   └── YYYYMMDD-issue-title.md
├── changes/                           # 改动日志（按日期聚合）
│   └── YYYYMMDD-change-log.md
└── templates/                         # 记录模板
    ├── session-summary-template.md
    ├── decision-record-template.md
    └── change-log-template.md
```

## 使用规范

1. **每次会话结束后**，AI 助手应将会话摘要写入 `sessions/YYYYMMDD-short-title.md`。
2. **涉及架构或设计选择时**，写入 `decisions/` 目录。
3. **每次代码改动**应在 `changes/YYYYMMDD-change-log.md` 中留下一行记录：文件、改动意图、关联会话。
4. **重要 bug 或踩坑记录**写入 `issues/` 目录。
5. 文件名统一使用 `YYYYMMDD-` 前缀，便于排序和检索。
6. 优先使用中文记录，保持与项目语言一致。

## 注意事项

- 避免记录敏感信息（密钥、token、个人隐私）。
- 不记录显而易见或可通过代码直接获得的信息。
- 保持简洁，每条记录聚焦一个主题。
