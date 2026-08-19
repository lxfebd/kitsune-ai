# Kitsune AI 项目实际可用性审计报告

> 生成日期：2026-08-10
> 范围：全项目 6 apps + 51 packages + 3 services + 配置
> 目的：识别"代码完整但实际跑不通"的问题，而非代码结构问题

---

## 一、审计结论概览

| 模块 | 状态 | 关键问题数 | 严重度 |
|------|------|-----------|--------|
| A1 stage-tamagotchi | ✅ 已修复 | 8/8 已修复 | 运行可用 |
| A2 stage-web | 🟡 可用 | 1（依赖后端） | 需后端 |
| A3 server | 🟡 已修复 | 1/1 已修复（OAuth 凭据） | 需配置 |
| A4 stage-pocket | 🟡 已修复 | 1/1 已修复（capacitor 依赖缺失） | 需后端 |
| A5 ui-admin | 🟡 可用 | 0（依赖后端） | 需后端 |
| A6 component-calling | 🟢 独立可用 | 0 | 独立 |
| P1-P15 packages | 🟢 可用 | 0（库代码，无运行时依赖） | 库 |
| S1-S3 services | ✅ 已实现 | 3/3 已实现 | 需配置环境 |

---

## 二、已修复问题（A1模块）

见 `project-slicing-complete.md` 和 A1 修复记录。

---

## 三、待修复问题

### P1 - 配置缺失导致无法启动

| # | 模块 | 问题 | 根因 | 修复方案 |
|---|------|------|------|---------|
| 4 | **A3 server** | Google/GitHub OAuth 凭据非空校验 | `env.ts` 标记为 `nonEmpty` 但 auth 运行时可选 | ✅ 已修复 |

### P2 - 依赖安装不完整（环境问题）

| # | 模块 | 问题 | 根因 | 修复方案 |
|---|------|------|------|---------|
| 5 | **全项目** | `@proj-airi/drizzle-duckdb-wasm` 未链接 | pnpm 安装不完整 | 运行 `pnpm install` 重建 node_modules |
| 6 | **全项目** | `moduleResolution` 需设为 `bundler` | tsconfig 配置 | 更新 tsconfig.json 的 moduleResolution |

---

## 四、模块详细状态

### Apps（6 个）

| 应用 | 代码完整度 | 实际可用性 | 说明 |
|------|-----------|-----------|------|
| stage-tamagotchi | 100% | ✅ 已修复 | 桌面端，所有服务已修复 |
| stage-web | 100% | 🟡 需后端 | Web 端，依赖 server 运行 |
| server | 95% | 🟡 需配置 | 需要 Postgres + Redis + 配置 env |
| stage-pocket | 80% | 🟡 需后端 | 移动端，需要 Capacitor 原生层 + 后端 |
| ui-admin | 100% | 🟡 需后端 | 管理后台，需要 server 运行 |
| component-calling | 100% | 🟢 独立可用 | 演示工具，配置 LLM 即可 |

### Services（3 个）

| 服务 | 代码完整度 | 实际可用性 | 说明 |
|------|-----------|-----------|------|
| computer-use-mcp | 90% | 🟡 需安装依赖 | MCP 服务，20 个工具，需 `pnpm install` 安装 @modelcontextprotocol/sdk |
| discord-bot | 90% | 🟡 需配置 Token | 154 行实现，通过 server-sdk WebSocket 连接 server，接收 ui:configure 配置 |
| minecraft | 95% | 🟡 需配置服务器 | 214 行实现，Mineflayer 智能体，支持移动/聊天/状态/装备/spark:command |

### Packages（51 个）

大部分包是库代码，依赖接口而非实现，不存在"实际跑不通"问题。核心包（stage-ui、core-agent、ccc、audio、kitsune-persona 等）在 A1 使用中已验证可工作。

---

## 五、建议

1. **P0 优先**：三个 services 需要决定是完整实现还是从 `pnpm-workspace.yaml` 中移除
2. **P1 已修复**：server 的 OAuth 凭据问题已修复
3. **P2 环境**：`pnpm install` 和 `tsconfig` 更新，属于开发环境配置