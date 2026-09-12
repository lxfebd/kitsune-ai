/**
 * MCP 接入配置模板生成 — 各家 agent 的 MCP 配置片段 + 配置路径解析
 *
 * ── 职责边界 ──
 * 桌宠监工新增 MCP 上报通道（petMcpHttpServer，http://127.0.0.1:6123/mcp）
 * 后，用户需要在各自的 AI agent（Claude Code / Cursor / Trae / Windsurf / ZCode…）
 * 里配置一个 MCP server。本文件生成可直接粘贴的配置 JSON 片段，并给出各 agent
 * 配置文件的实际（常见）路径——纯生成 + 展示，不自动写用户的配置文件（保持用户控制）。
 *
 * ── 两种接入形态 ──
 * 1) URL 直连（支持的 agent）：写给 http://127.0.0.1:6123/mcp 的 URL，
 *    换台电脑零路径依赖（MCP 的 Streamable HTTP）——这是本通道的核心价值。
 * 2) stdio 子进程（老版本/不支持 URL）：spawn out/main/petMcpServerChild.js，
 *    走现有子进程桥到 petMcpBridge（localhost 6122）。
 *
 * ── 与 petContract 的约定 ──
 * 模板里声明的 tools 只需 server 名正确即可——工具清单由 server 的
 * ListTools 动态返回（pet_report / triggerReaction），无需在配置里列全
 * （多数 agent 配置只需 url 或 command/args 两项）。
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

export type McpAgentId = 'claude_code' | 'cursor' | 'trae' | 'windsurf' | 'zcode' | 'opencode'

export interface McpAgentTemplate {
  /** agent 展示名 */
  label: string
  /** 接入形态：url=HTTP 直连 / stdio=子进程 */
  mode: 'url' | 'stdio'
  /** 配置片段（JSON 字符串，可直接粘贴进对应配置文件） */
  config: string
  /** 配置文件名（用户自建时提示） */
  configFile: string
  /** 配置文件候选路径（按优先级，可能为空——无法安全推断时展示文件名让用户自建） */
  configPaths: string[]
}

/** 主进程内嵌 MCP HTTP server 地址（与 petMcpHttpServer 的 DEFAULT_PORT 对齐） */
export const PET_MCP_HTTP_URL = 'http://127.0.0.1:6123/mcp'

/**
 * 生成某 agent 的 MCP 配置模板。
 *
 * @param agentId agent 标识（与契约白名单对齐）
 * @param stdioEntry 打包后 petMcpServerChild.js 的绝对路径；未提供时 stdio 模板
 *        生成占位，由用户在设置页按实际打包输出路径替换。
 * @param bridgePort stdio 路由的目的桥端口（默认 6122，与 petMcpBridge 一致）
 */
export function generateAgentMcpConfig(agentId: McpAgentId, stdioEntry?: string, bridgePort = 6122): McpAgentTemplate {
  const serverName = 'kitsune-pet'

  // URL 直连型：Claude Code / Trae / Windsurf / ZCode / Opencode 均支持 Streamable HTTP
  if (agentId !== 'cursor') {
    const config = {
      mcpServers: {
        [serverName]: {
          url: PET_MCP_HTTP_URL,
        },
      },
    }
    return {
      label: agentLabel(agentId),
      mode: 'url',
      config: JSON.stringify(config, null, 2),
      configFile: agentConfigFile(agentId),
      configPaths: agentConfigPaths(agentId),
    }
  }

  // Cursor 走 stdio 子进程桥（老架构，稳定兜底；URL 支持因版本而异）
  const entry = stdioEntry ?? '<打包后的 petMcpServerChild.js 绝对路径>'
  const config = {
    mcpServers: {
      [serverName]: {
        command: process.execPath,
        args: [entry],
        env: {
          PET_MCP_BRIDGE_PORT: String(bridgePort),
        },
      },
    },
  }
  return {
    label: agentLabel(agentId),
    mode: 'stdio',
    config: JSON.stringify(config, null, 2),
    configFile: agentConfigFile(agentId),
    configPaths: agentConfigPaths(agentId),
  }
}

function agentLabel(agentId: McpAgentId): string {
  const labels: Record<McpAgentId, string> = {
    claude_code: 'Claude Code',
    cursor: 'Cursor',
    trae: 'Trae',
    windsurf: 'Windsurf',
    zcode: 'ZCode',
    opencode: 'Opencode',
  }
  return labels[agentId]
}

function agentConfigFile(agentId: McpAgentId): string {
  const files: Record<McpAgentId, string> = {
    claude_code: 'claude_desktop_config.json',
    cursor: '.mcp.json',
    trae: '.mcp.json',
    windsurf: 'mcp_config.json',
    zcode: 'mcp.json',
    opencode: 'opencode.json',
  }
  return files[agentId]
}

/**
 * 各 agent 配置文件的实际（常见）路径。
 *
 * 纯路径推断（基于 os.homedir() 与各 agent 的公开配置约定），不探测文件是否存在；
 * 探测由调用方做（设置页可现场检查并提示"未找到"）。
 * 拿不到主目录或路径不确定时返回空数组，调用方只展示文件名让用户自建。
 */
export function agentConfigPaths(agentId: McpAgentId): string[] {
  const home = homedir()
  if (!home) return []

  const paths: Record<McpAgentId, string[]> = {
    // Claude Code：全局 user 级 claude_desktop_config.json（macOS/Linux/Windows）
    claude_code: [
      join(home, '.claude.json'),
      join(home, '.config', 'claude', 'claude_desktop_config.json'),
      join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'),
    ],
    // Cursor：项目级 .mcp.json（放项目根）；user 级配置目录
    cursor: [
      join(home, '.cursor', 'mcp.json'),
      join(home, 'AppData', 'Roaming', 'Cursor', 'mcp.json'),
    ],
    trae: [
      join(home, '.trae', 'mcp.json'),
      join(home, 'AppData', 'Roaming', 'Trae', 'mcp.json'),
    ],
    windsurf: [
      join(home, '.codeium', 'windsurf', 'mcp_config.json'),
      join(home, 'AppData', 'Roaming', 'Windsurf', 'mcp_config.json'),
    ],
    zcode: [
      join(home, '.zcode', 'mcp.json'),
      join(home, 'AppData', 'Roaming', 'ZCode', 'mcp.json'),
    ],
    opencode: [
      join(home, '.config', 'opencode', 'opencode.json'),
      join(home, 'AppData', 'Roaming', 'opencode', 'opencode.json'),
    ],
  }
  return paths[agentId]
}
