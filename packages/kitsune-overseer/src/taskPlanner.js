/**
 * TaskPlanner — 自主任务规划器
 *
 * 职责：
 * - 把用户自然语言目标拆成可执行步骤
 * - 为每个步骤选择工具并生成参数
 * - 输出标准 PlanStep 数组供 AutonomousAgentLoop 执行
 */

const { randomUUID } = require('node:crypto');

/** 可用工具清单与风险类别（必须与 RiskController / AgentToolKit 对齐） */
const AVAILABLE_TOOLS = [
  { name: 'fs_read', category: 'read', description: '读取文件内容', params: { path: 'string' } },
  { name: 'fs_write', category: 'write', description: '写入/覆盖文件', params: { path: 'string', content: 'string' } },
  { name: 'fs_list', category: 'read', description: '列出目录内容', params: { path: 'string' } },
  { name: 'search_code', category: 'read', description: '在代码库中搜索文本', params: { query: 'string', path: 'string' } },
  { name: 'llm_ask', category: 'read', description: '向 LLM 提问获取分析', params: { prompt: 'string' } },
  { name: 'shell_exec', category: 'shell', description: '执行 shell 命令', params: { command: 'string', timeout: 'number' } },
  { name: 'test_run', category: 'shell', description: '运行测试命令', params: { command: 'string' } },
  { name: 'browser_open', category: 'network', description: '获取网页内容', params: { url: 'string' } },
];

const SYSTEM_PROMPT = `你是桌宠的"任务规划大脑"。用户会给出一个目标，你需要把它拆成可执行步骤。

可用工具（严格使用以下名称和参数）：
${JSON.stringify(AVAILABLE_TOOLS, null, 2)}

输出格式（严格 JSON，不要 markdown 代码块）：
{
  "steps": [
    {
      "description": "步骤描述，给人看",
      "tool": "工具名",
      "params": { /* 工具所需参数 */ }
    }
  ],
  "summary": "对整体计划的简要说明"
}

规划原则：
1. 先读取/搜索，再分析，最后写入或执行 shell；
2. 每个步骤只调一个工具；
3. 不要假设文件内容，需要时先用 fs_read / search_code；
4. 修改文件前必须先读取原文件；
5. 步骤数量控制在 3-10 步之间；
6. 如果目标不明确，先用 llm_ask 澄清，再出计划。`;

class TaskPlanner {
  /**
   * @param {Object} opts
   * @param {any} opts.llmManager 需提供 getReasoner()
   * @param {Console|Object} [opts.logger]
   */
  constructor({ llmManager, logger = console } = {}) {
    this.llmManager = llmManager;
    this.logger = logger;
  }

  /**
   * 根据目标生成执行计划
   * @param {string} goal 用户目标
   * @param {Object} [context] 上下文（如当前项目路径、已收集的信息）
   * @returns {Promise<import('./autonomousTypes').PlanStep[]>}
   */
  async plan(goal, context = {}) {
    if (!this.llmManager) throw new Error('llmManager not initialized');
    const reasoner = await this.llmManager.getReasoner();
    if (!reasoner) throw new Error('reasoner not available');

    const prompt = this._buildPrompt(goal, context);
    const response = await reasoner.decide({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ]
    });

    const raw = response?.output || response?.assistantMessage?.content || '';
    return this._parsePlan(raw, goal);
  }

  _buildPrompt(goal, context) {
    return `用户目标：${goal}

当前上下文：
${JSON.stringify(context, null, 2)}

请输出 JSON 执行计划。`;
  }

  _parsePlan(raw, goal) {
    let jsonText = raw;
    const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonText = codeBlockMatch[1].trim();
    const braceMatch = jsonText.match(/\{[\s\S]*\}/);
    if (braceMatch) jsonText = braceMatch[0];

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      this.logger.error?.('[TaskPlanner] plan parse failed:', err.message, '\nraw:', raw);
      throw new Error(`Failed to parse planner output: ${err.message}`);
    }

    if (!Array.isArray(parsed.steps)) {
      throw new Error('Planner output missing steps array');
    }

    const validTools = new Set(AVAILABLE_TOOLS.map(t => t.name));
    return parsed.steps.map((step, index) => {
      if (!validTools.has(step.tool)) {
        throw new Error(`Unknown tool in plan: ${step.tool}`);
      }
      return {
        id: randomUUID(),
        description: step.description || `Step ${index + 1}`,
        tool: step.tool,
        params: step.params || {},
        status: 'pending',
        result: undefined,
        error: undefined,
        startedAt: null,
        completedAt: null,
      };
    });
  }

  /** @returns {typeof AVAILABLE_TOOLS} */
  static getAvailableTools() {
    return AVAILABLE_TOOLS;
  }
}

module.exports = { TaskPlanner, AVAILABLE_TOOLS };
