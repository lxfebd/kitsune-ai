/**
 * mcpAgentConfig 纯函数测试
 *
 * 覆盖：
 *  - URL 直连型（claude_code/trae/windsurf/zcode/opencode）生成 url 配置，含正确 URL
 *  - Cursor 生成 stdio 配置（command=process.execPath + args 指向打包入口）
 *  - stdio 配置带 PET_MCP_BRIDGE_PORT env 透传
 *  - 未提供 stdioEntry 时占位可见（不抛错）
 *  - 配置 JSON 全部可 parse 且结构正确（mcpServers.kitsune-pet 存在）
 *  - 路径推断：各 agent 返回基于 homedir 的候选数组
 */

import { homedir } from 'node:os'
import { describe, expect, it } from 'vitest'

import {
  agentConfigPaths,
  generateAgentMcpConfig,
  PET_MCP_HTTP_URL,
  type McpAgentId,
} from './mcpAgentConfig'

const URL_AGENTS: McpAgentId[] = ['claude_code', 'trae', 'windsurf', 'zcode', 'opencode']

describe('mcpAgentConfig — URL 直连型模板', () => {
  it.each(URL_AGENTS)('%s 生成 url 直连配置', (agentId) => {
    const tpl = generateAgentMcpConfig(agentId, '/abs/path/petMcpServerChild.js')
    expect(tpl.mode).toBe('url')
    const parsed = JSON.parse(tpl.config) as { mcpServers: Record<string, { url?: string }> }
    const server = parsed.mcpServers['kitsune-pet']
    expect(server).toBeDefined()
    expect(server?.url).toBe(PET_MCP_HTTP_URL)
    expect(tpl.label).toBeTruthy()
    expect(tpl.configFile).toBeTruthy()
  })
})

describe('mcpAgentConfig — Cursor stdio 模板', () => {
  it('提供 stdioEntry 时用 process.execPath + 绝对路径参数', () => {
    const tpl = generateAgentMcpConfig('cursor', 'C:\\kitsune\\out\\main\\petMcpServerChild.js')
    expect(tpl.mode).toBe('stdio')
    const parsed = JSON.parse(tpl.config) as { mcpServers: Record<string, { command: string, args: string[], env?: Record<string, string> }> }
    const server = parsed.mcpServers['kitsune-pet']
    expect(server.command).toBe(process.execPath)
    expect(server.args).toEqual(['C:\\kitsune\\out\\main\\petMcpServerChild.js'])
  })

  it('env 透传 PET_MCP_BRIDGE_PORT（自定义端口生效）', () => {
    const tpl = generateAgentMcpConfig('cursor', undefined, 6234)
    const parsed = JSON.parse(tpl.config) as { mcpServers: Record<string, { env?: Record<string, string> }> }
    expect(parsed.mcpServers['kitsune-pet'].env?.PET_MCP_BRIDGE_PORT).toBe('6234')
  })

  it('未提供 stdioEntry 时生成占位且不抛错', () => {
    const tpl = generateAgentMcpConfig('cursor')
    const parsed = JSON.parse(tpl.config) as { mcpServers: Record<string, { args: string[] }> }
    expect(parsed.mcpServers['kitsune-pet'].args[0]).toContain('<')
    expect(tpl.mode).toBe('stdio')
  })
})

describe('mcpAgentConfig — 配置片段可解析', () => {
  it.each(['claude_code', 'cursor', 'trae', 'windsurf', 'zcode', 'opencode'] as McpAgentId[])(
    '%s 的 config 是合法 JSON 且含 mcpServers.kitsune-pet',
    (agentId) => {
      const tpl = generateAgentMcpConfig(agentId, '/abs/petMcpServerChild.js')
      expect(() => JSON.parse(tpl.config)).not.toThrow()
      const parsed = JSON.parse(tpl.config) as { mcpServers: Record<string, unknown> }
      expect(parsed.mcpServers['kitsune-pet']).toBeDefined()
    },
  )
})

describe('mcpAgentConfig — 配置路径推断', () => {
  it('各 agent 返回候选路径数组（基于 homedir）', () => {
    const home = homedir()
    for (const agentId of ['claude_code', 'cursor', 'trae', 'windsurf', 'zcode', 'opencode'] as McpAgentId[]) {
      const paths = agentConfigPaths(agentId)
      expect(Array.isArray(paths)).toBe(true)
      // 有主目录时可推断出至少一条候选路径，且路径以主目录开头
      if (home) {
        expect(paths.length).toBeGreaterThan(0)
        expect(paths[0].startsWith(home)).toBe(true)
      }
    }
  })

  it('路径含配置文件名（各 agent 的约定文件名）', () => {
    const expectFiles: Array<[McpAgentId, string]> = [
      ['claude_code', 'claude_desktop_config.json'],
      ['cursor', 'mcp.json'],
      ['trae', 'mcp.json'],
      ['windsurf', 'mcp_config.json'],
      ['zcode', 'mcp.json'],
      ['opencode', 'opencode.json'],
    ]
    for (const [agentId, fileName] of expectFiles) {
      const paths = agentConfigPaths(agentId)
      if (paths.length > 0) {
        expect(paths.some(p => p.endsWith(fileName))).toBe(true)
      }
    }
  })
})