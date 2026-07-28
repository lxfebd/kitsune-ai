# 改动日志

## 日期

2026-07-02

## 改动列表

| 时间 | 文件 | 改动类型 | 改动说明 | 关联会话 |
|------|------|----------|----------|----------|
| 会话期间 | `.ai-memory/README.md` | 新增 | 建立项目内 AI 记忆同步库说明 | 20260702-knowledge-framework-setup |
| 会话期间 | `.ai-memory/templates/*.md` | 新增 | 会话摘要、决策记录、改动日志模板 | 20260702-knowledge-framework-setup |
| 会话期间 | `.ai-memory/sessions/20260702-knowledge-framework-setup.md` | 新增 | 记录本次会话摘要 | 20260702-knowledge-framework-setup |
| 会话期间 | `.ai-memory/architecture/knowledge-framework.md` | 新增 | 沉淀项目架构知识框架 | 20260702-knowledge-framework-setup |
| 会话期间 | `.ai-memory/changes/20260702-change-log.md` | 新增 | 本次改动日志（自引用） | 20260702-knowledge-framework-setup |
| 会话期间 | `.ai-memory/architecture/module-reference.md` | 新增 | 完整模块参考（6 apps + 48 packages + 6 services + 9 plugins） | 20260702-knowledge-base-completion |
| 会话期间 | `.ai-memory/architecture/data-flow-and-runtime.md` | 新增 | 数据流与运行时详解 | 20260702-knowledge-base-completion |
| 会话期间 | `.ai-memory/architecture/config-system.md` | 新增 | 配置系统、AI 技能、插件生态 | 20260702-knowledge-base-completion |
| 会话期间 | `.ai-memory/architecture/knowledge-framework.md` | 更新 | 扩展为完整知识库主入口 | 20260702-knowledge-base-completion |
| 会话期间 | `.ai-memory/sessions/20260702-knowledge-base-completion.md` | 新增 | 本次补全会话摘要 | 20260702-knowledge-base-completion |
| 会话期间 | `apps/stage-tamagotchi/package.json` | 修改 | @yachiyo 依赖改为 @kitsune（persona、emotion-mapper、tts-hybrid） | 2026-07-02 性能优化 |
| 会话期间 | `apps/stage-tamagotchi/electron.vite.config.ts` | 修改 | externalizeDeps 中 @yachiyo 改为 @kitsune | 2026-07-02 性能优化 |
| 会话期间 | `apps/stage-tamagotchi/src/main/services/kitsune/persona/index.ts` | 修改 | import 路径 @yachiyo 改为 @kitsune | 2026-07-02 性能优化 |
| 会话期间 | `packages/kitsune-mcp-bridge/src/index.js` | 修改 | JSDoc 注释中的 @yachiyo 改为 @kitsune | 2026-07-02 性能优化 |
| 会话期间 | `apps/stage-tamagotchi/package.json` | 修改 | 移除 6 个未使用的重型依赖（d3、three、@huggingface/transformers、onnxruntime-web、chess.js、jszip） | 2026-07-02 性能优化 |
| 会话期间 | `apps/stage-tamagotchi/src/main/index.ts` | 修改 | 6 个非关键服务改为动态 import()（godot-stage、mcp-servers、plugins、memory、persona、artistry-bridge） | 2026-07-02 性能优化 |
| 会话期间 | `apps/stage-tamagotchi/src/renderer/main.ts` | 修改 | nunito 字体移至 requestIdleCallback 异步加载 | 2026-07-02 性能优化 |
| 会话期间 | `apps/stage-tamagotchi/package.json` | 修改 | 移除未使用的 popmotion 依赖 | 2026-07-02 依赖清理 |
| 会话期间 | `apps/stage-tamagotchi/package.json` | 修改 | 移除未使用的 whatwg-mimetype、nprogress 及其 @types | 2026-07-02 依赖清理 |
| 会话期间 | `apps/stage-tamagotchi/package.json` | 修改 | 移除未使用的 @xsai-transformers/embed、@xsai-transformers/transcription | 2026-07-02 依赖清理 |

## 备注

- 2026-07-02 上午：建立项目内 AI 记忆同步基础设施与完整知识库文档。
- 2026-07-02 下午：执行性能优化，修复包名断层感、移除重型依赖、优化启动流程。
- 知识库包含：项目定位、顶层架构、核心数据流、模块完整参考、运行时详解、配置系统、阅读优先级。
