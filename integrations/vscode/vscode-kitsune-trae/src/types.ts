/**
 * Coding context information
 */
export interface CodingContext {
  /**
   * File information
   *
   * @example {
   *  "path": "/home/neko/Git/github.com/moeru-ai/airi/package.json",
   *  "languageId": "json",
   *  "fileName": "/home/neko/Git/github.com/moeru-ai/airi/package.json"
   * }
   */
  file: {
    path: string
    languageId: string
    fileName: string
    workspaceFolder?: string
  }
  /**
   * Cursor position
   *
   * {
   *  "line": 5,
   *  "character": 35
   * }
   */
  cursor: {
    line: number
    character: number
  }
  /** Selected text */
  selection?: {
    text: string
    start: { line: number, character: number }
    end: { line: number, character: number }
  }
  /** Current line */
  currentLine: {
    lineNumber: number
    text: string
  }
  /**
   * Context (previous and next N lines)
   *
   * @example {
   *   "before": [
   *     "{",
   *     "  \"name\": \"@kitsune/root\",",
   *     "  \"type\": \"module\",",
   *     "  \"version\": \"0.8.1-beta.12\",",
   *     "  \"private\": true,"
   *   ],
   *   "after": [
   *     "  \"description\": \"LLM powered virtual character\",",
   *     "  \"author\": {",
   *     "    \"name\": \"Moeru AI Project AIRI Team\",",
   *     "    \"email\": \"airi@moeru.ai\",",
   *     "    \"url\": \"https://github.com/moeru-ai\""
   *   ]
   * }
   */
  context: {
    before: string[]
    after: string[]
  }
  /** Git information */
  git?: {
    branch: string
    isDirty: boolean
  }
  /**
   * Timestamp
   *
   * @example 1768584314898
   */
  timestamp: number
}

/**
 * Event types sent to Airi
 */
export interface Events {
  type: 'coding:context' | 'coding:save' | 'coding:switch-file'
  data: CodingContext
}

export interface TaskExecuteOpenFile {
  type: 'open_file'
  path: string
  line?: number
  column?: number
}

export interface TaskExecuteInsertCode {
  type: 'insert_code'
  code: string
  position?: 'cursor' | 'end'
}

export interface TaskExecuteRunCommand {
  type: 'run_command'
  command: string
  args?: string[]
}

export type TaskExecutePayload = {
  taskId: string
} & (
  | TaskExecuteOpenFile
  | TaskExecuteInsertCode
  | TaskExecuteRunCommand
)

export interface TaskResultPayload {
  taskId: string
  success: boolean
  error?: string
}

// NOTICE:
// Why: ProtocolEvents/WebSocketEvents 已定义的协议事件不包含 IDE 任务执行相关事件，
//      需要本地扩展事件映射以便 Client.onEvent / send 能类型安全地处理 task:execute 与 task:result。
// Root cause: @kitsune/plugin-protocol 定义的协议事件是全局共享的，IDE 专有事件不适合放回上游。
// Source/context: packages/plugin-protocol/src/types/events.ts, packages/server-sdk/src/client.ts
// Removal condition: 当 task:execute/task:result 被提升为全局协议事件后可删除此合并。
declare module '@kitsune/server-shared/types' {
  interface WebSocketEvents<C = undefined> {
    'task:execute': TaskExecutePayload
    'task:result': TaskResultPayload
  }
}
