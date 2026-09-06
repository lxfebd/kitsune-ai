// src/live2d/emotionMapper.ts
//
// Live2D 情感映射器
// 根据工具名称、文本内容、响应分类等信息推断情感类型

/** 支持的情感类型 */
export type EmotionType = 'happy' | 'sad' | 'angry' | 'surprised' | 'thinking' | 'alert';

// ============================================================
// 映射配置类型
// ============================================================

/** 工具名 → 情感 映射条目 */
interface ToolEmotionEntry {
  /** 工具名关键词（支持精确匹配和前缀匹配） */
  pattern: string;
  /** 匹配模式：'exact' | 'prefix' | 'contains' */
  matchMode: 'exact' | 'prefix' | 'contains';
  /** 映射的情感类型 */
  emotion: EmotionType;
  /** 优先级（数值越大优先级越高） */
  priority: number;
}

/** 文本情感关键词条目 */
interface TextEmotionEntry {
  /** 关键词列表（任意一个匹配即触发） */
  keywords: string[];
  /** 映射的情感类型 */
  emotion: EmotionType;
  /** 权重（用于多条目冲突时的优先级） */
  weight: number;
}

/** 响应分类 → 情感 映射条目 */
interface CategoryEmotionEntry {
  /** 响应分类名称 */
  category: string;
  /** 映射的情感类型 */
  emotion: EmotionType;
}

// ============================================================
// 默认工具情感映射配置
// ============================================================

const DEFAULT_TOOL_EMOTIONS: ToolEmotionEntry[] = [
  // 代码执行类工具 — 专注/思考
  { pattern: 'execute', matchMode: 'contains', emotion: 'thinking', priority: 5 },
  { pattern: 'run', matchMode: 'contains', emotion: 'thinking', priority: 5 },
  { pattern: 'compile', matchMode: 'contains', emotion: 'thinking', priority: 5 },
  { pattern: 'build', matchMode: 'contains', emotion: 'thinking', priority: 5 },

  // 文件操作类工具 — 平静/思考
  { pattern: 'file', matchMode: 'contains', emotion: 'thinking', priority: 3 },
  { pattern: 'read', matchMode: 'contains', emotion: 'thinking', priority: 3 },
  { pattern: 'write', matchMode: 'contains', emotion: 'thinking', priority: 3 },
  { pattern: 'edit', matchMode: 'contains', emotion: 'thinking', priority: 3 },

  // 搜索/查询类工具 — 思考
  { pattern: 'search', matchMode: 'contains', emotion: 'thinking', priority: 4 },
  { pattern: 'find', matchMode: 'contains', emotion: 'thinking', priority: 4 },
  { pattern: 'query', matchMode: 'contains', emotion: 'thinking', priority: 4 },
  { pattern: 'grep', matchMode: 'contains', emotion: 'thinking', priority: 4 },

  // 网络/请求类工具 — 警觉
  { pattern: 'fetch', matchMode: 'contains', emotion: 'alert', priority: 4 },
  { pattern: 'request', matchMode: 'contains', emotion: 'alert', priority: 4 },
  { pattern: 'http', matchMode: 'contains', emotion: 'alert', priority: 4 },
  { pattern: 'api', matchMode: 'contains', emotion: 'alert', priority: 4 },
  { pattern: 'web', matchMode: 'contains', emotion: 'alert', priority: 4 },

  // 错误/调试类工具 — 警觉
  { pattern: 'debug', matchMode: 'contains', emotion: 'alert', priority: 6 },
  { pattern: 'error', matchMode: 'contains', emotion: 'alert', priority: 6 },
  { pattern: 'fix', matchMode: 'contains', emotion: 'alert', priority: 5 },
  { pattern: 'test', matchMode: 'contains', emotion: 'thinking', priority: 5 },

  // Git 操作类 — 平静
  { pattern: 'git', matchMode: 'prefix', emotion: 'thinking', priority: 4 },
  { pattern: 'commit', matchMode: 'contains', emotion: 'thinking', priority: 4 },
  { pattern: 'merge', matchMode: 'contains', emotion: 'thinking', priority: 4 },

  // 部署/发布类 — 警觉
  { pattern: 'deploy', matchMode: 'contains', emotion: 'alert', priority: 6 },
  { pattern: 'publish', matchMode: 'contains', emotion: 'alert', priority: 6 },
  { pattern: 'release', matchMode: 'contains', emotion: 'alert', priority: 6 },
];

// ============================================================
// 默认文本情感映射配置
// ============================================================

const DEFAULT_TEXT_EMOTIONS: TextEmotionEntry[] = [
  // 开心/积极
  {
    keywords: ['成功', '完成', '完成', '搞定', '棒', '厉害', '感谢', '谢谢', '太好了', '完美', '漂亮', '优秀'],
    emotion: 'happy',
    weight: 10,
  },
  {
    keywords: ['success', 'done', 'great', 'awesome', 'perfect', 'excellent', 'nice', 'wonderful'],
    emotion: 'happy',
    weight: 10,
  },

  // 悲伤/失望
  {
    keywords: ['失败', '错误', '抱歉', '对不起', '遗憾', '可惜', '难过', '失望', '不好', '糟糕'],
    emotion: 'sad',
    weight: 8,
  },
  {
    keywords: ['fail', 'error', 'sorry', 'unfortunately', 'sadly', 'disappointed', 'bad', 'terrible'],
    emotion: 'sad',
    weight: 8,
  },

  // 生气
  {
    keywords: ['讨厌', '烦', '气死', '混蛋', '滚', '闭嘴', '受够了', '受不了'],
    emotion: 'angry',
    weight: 12,
  },
  {
    keywords: ['hate', 'angry', 'furious', 'annoying', 'stupid', 'damn', 'terrible'],
    emotion: 'angry',
    weight: 12,
  },

  // 惊讶
  {
    keywords: ['哇', '天哪', '居然', '竟然', '没想到', '不可思议', '震惊', '啊', '哎呀'],
    emotion: 'surprised',
    weight: 11,
  },
  {
    keywords: ['wow', 'omg', 'really', 'unbelievable', 'amazing', 'shocking', 'incredible'],
    emotion: 'surprised',
    weight: 11,
  },

  // 思考/疑惑
  {
    keywords: ['想想', '思考', '分析', '分析一下', '为什么', '怎么', '如何', '什么', '考虑', '研究'],
    emotion: 'thinking',
    weight: 7,
  },
  {
    keywords: ['think', 'consider', 'analyze', 'why', 'how', 'what', 'maybe', 'perhaps', 'wonder'],
    emotion: 'thinking',
    weight: 7,
  },

  // 警觉/专注
  {
    keywords: ['注意', '警告', '危险', '小心', '重要', '紧急', '马上', '立刻', '快'],
    emotion: 'alert',
    weight: 11,
  },
  {
    keywords: ['alert', 'warning', 'danger', 'careful', 'important', 'urgent', 'immediately', 'now'],
    emotion: 'alert',
    weight: 11,
  },
];

// ============================================================
// 默认响应分类情感映射配置
// ============================================================

const DEFAULT_CATEGORY_EMOTIONS: CategoryEmotionEntry[] = [
  // 执行结果类
  { category: 'success', emotion: 'happy' },
  { category: 'completed', emotion: 'happy' },
  { category: 'done', emotion: 'happy' },

  // 错误类
  { category: 'error', emotion: 'alert' },
  { category: 'failure', emotion: 'sad' },
  { category: 'failed', emotion: 'sad' },
  { category: 'exception', emotion: 'alert' },

  // 进行中
  { category: 'running', emotion: 'thinking' },
  { category: 'processing', emotion: 'thinking' },
  { category: 'loading', emotion: 'thinking' },
  { category: 'pending', emotion: 'thinking' },

  // 信息类
  { category: 'info', emotion: 'thinking' },
  { category: 'message', emotion: 'thinking' },
  { category: 'notification', emotion: 'alert' },

  // 警告类
  { category: 'warning', emotion: 'alert' },
  { category: 'caution', emotion: 'alert' },
];

// ============================================================
// EmotionMapper 类
// ============================================================

/**
 * 情感映射器
 *
 * 根据工具名称、文本内容、响应分类等信息推断 Live2D 模型的情感类型。
 * 支持自定义映射配置，并提供默认配置。
 */
export class EmotionMapper {
  /** 工具 → 情感映射表 */
  private toolEmotions: ToolEmotionEntry[];

  /** 文本 → 情感映射表 */
  private textEmotions: TextEmotionEntry[];

  /** 响应分类 → 情感映射表 */
  private categoryEmotions: CategoryEmotionEntry[];

  /** 默认情感（当无法匹配时使用） */
  private defaultEmotion: EmotionType;

  /**
   * 创建情感映射器实例
   * @param options 可选配置
   */
  constructor(options?: {
    toolEmotions?: ToolEmotionEntry[];
    textEmotions?: TextEmotionEntry[];
    categoryEmotions?: CategoryEmotionEntry[];
    defaultEmotion?: EmotionType;
  }) {
    this.toolEmotions = options?.toolEmotions ?? [...DEFAULT_TOOL_EMOTIONS];
    this.textEmotions = options?.textEmotions ?? [...DEFAULT_TEXT_EMOTIONS];
    this.categoryEmotions = options?.categoryEmotions ?? [...DEFAULT_CATEGORY_EMOTIONS];
    this.defaultEmotion = options?.defaultEmotion ?? 'thinking';
  }

  // ----------------------------------------------------------
  // 公共 API
  // ----------------------------------------------------------

  /**
   * 根据工具名获取情感类型
   *
   * 支持三种匹配模式：
   * - 'exact': 完全匹配工具名
   * - 'prefix': 工具名以 pattern 开头
   * - 'contains': 工具名包含 pattern 子串
   *
   * 多条目匹配时，按 priority 降序取最高优先级。
   *
   * @param toolName 工具名称
   * @returns 匹配的情感类型，无匹配返回默认情感
   */
  getEmotionFromTool(toolName: string): EmotionType {
    if (!toolName || toolName.trim().length === 0) {
      return this.defaultEmotion;
    }

    const normalizedTool = toolName.toLowerCase().trim();
    let bestMatch: ToolEmotionEntry | null = null;

    for (const entry of this.toolEmotions) {
      if (this.matchToolEntry(normalizedTool, entry)) {
        if (!bestMatch || entry.priority > bestMatch.priority) {
          bestMatch = entry;
        }
      }
    }

    return bestMatch?.emotion ?? this.defaultEmotion;
  }

  /**
   * 根据文本内容获取情感类型
   *
   * 扫描文本中的关键词，匹配条目中任意关键词即触发。
   * 多条目匹配时，按 weight 降序取最高权重。
   * 同权重时，优先返回更具体的情感（非 thinking）。
   *
   * @param text 文本内容
   * @returns 匹配的情感类型，无匹配返回默认情感
   */
  getEmotionFromText(text: string): EmotionType {
    if (!text || text.trim().length === 0) {
      return this.defaultEmotion;
    }

    const normalizedText = text.toLowerCase();
    let bestMatch: TextEmotionEntry | null = null;

    for (const entry of this.textEmotions) {
      const hasKeyword = entry.keywords.some((kw) =>
        normalizedText.includes(kw.toLowerCase())
      );

      if (hasKeyword) {
        if (
          !bestMatch ||
          entry.weight > bestMatch.weight ||
          (entry.weight === bestMatch.weight && entry.emotion !== 'thinking')
        ) {
          bestMatch = entry;
        }
      }
    }

    return bestMatch?.emotion ?? this.defaultEmotion;
  }

  /**
   * 根据响应分类获取情感类型
   *
   * 精确匹配分类名称（忽略大小写）。
   *
   * @param category 响应分类
   * @returns 匹配的情感类型，无匹配返回默认情感
   */
  getEmotionFromResponseCategory(category: string): EmotionType {
    if (!category || category.trim().length === 0) {
      return this.defaultEmotion;
    }

    const normalizedCategory = category.toLowerCase().trim();
    const match = this.categoryEmotions.find(
      (entry) => entry.category.toLowerCase() === normalizedCategory
    );

    return match?.emotion ?? this.defaultEmotion;
  }

  // ----------------------------------------------------------
  // 配置管理
  // ----------------------------------------------------------

  /**
   * 添加工具情感映射规则
   * @param entry 映射条目
   */
  addToolEmotion(entry: ToolEmotionEntry): void {
    this.toolEmotions.push(entry);
  }

  /**
   * 移除指定工具名的所有映射规则
   * @param pattern 要移除的 pattern
   */
  removeToolEmotion(pattern: string): void {
    this.toolEmotions = this.toolEmotions.filter(
      (entry) => entry.pattern !== pattern
    );
  }

  /**
   * 添加文本情感映射规则
   * @param entry 映射条目
   */
  addTextEmotion(entry: TextEmotionEntry): void {
    this.textEmotions.push(entry);
  }

  /**
   * 添加响应分类情感映射规则
   * @param entry 映射条目
   */
  addCategoryEmotion(entry: CategoryEmotionEntry): void {
    this.categoryEmotions.push(entry);
  }

  /**
   * 设置默认情感类型
   * @param emotion 默认情感
   */
  setDefaultEmotion(emotion: EmotionType): void {
    this.defaultEmotion = emotion;
  }

  /**
   * 获取当前默认情感类型
   */
  getDefaultEmotion(): EmotionType {
    return this.defaultEmotion;
  }

  /**
   * 获取所有工具情感映射规则（只读副本）
   */
  getToolEmotions(): readonly ToolEmotionEntry[] {
    return Object.freeze([...this.toolEmotions]);
  }

  /**
   * 获取所有文本情感映射规则（只读副本）
   */
  getTextEmotions(): readonly TextEmotionEntry[] {
    return Object.freeze([...this.textEmotions]);
  }

  /**
   * 获取所有响应分类情感映射规则（只读副本）
   */
  getCategoryEmotions(): readonly CategoryEmotionEntry[] {
    return Object.freeze([...this.categoryEmotions]);
  }

  /**
   * 重置为默认配置
   */
  reset(): void {
    this.toolEmotions = [...DEFAULT_TOOL_EMOTIONS];
    this.textEmotions = [...DEFAULT_TEXT_EMOTIONS];
    this.categoryEmotions = [...DEFAULT_CATEGORY_EMOTIONS];
    this.defaultEmotion = 'thinking';
  }

  // ----------------------------------------------------------
  // 私有方法
  // ----------------------------------------------------------

  /**
   * 检查工具名是否匹配条目
   */
  private matchToolEntry(toolName: string, entry: ToolEmotionEntry): boolean {
    const pattern = entry.pattern.toLowerCase();

    switch (entry.matchMode) {
      case 'exact':
        return toolName === pattern;

      case 'prefix':
        return toolName.startsWith(pattern);

      case 'contains':
        return toolName.includes(pattern);

      default:
        return false;
    }
  }
}
