import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import YAML from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const CONFIG_PATH = path.resolve(__dirname, '..', '..', '..', 'config', 'mcp.yaml')

/**
 * MCP 配置存储 — 管理服务器列表的持久化
 */
export class McpConfigStore {
  constructor() {
    this.configPath = CONFIG_PATH
    this._ensureExists()
  }

  _ensureExists() {
    const dir = path.dirname(this.configPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    if (!fs.existsSync(this.configPath)) {
      this.save(this._getDefaultConfig())
    }
  }

  _getDefaultConfig() {
    return {
      version: 1,
      servers: [],
    }
  }

  async load() {
    try {
      const raw = await fsp.readFile(this.configPath, 'utf8')
      return YAML.parse(raw)
    }
    catch (err) {
      console.error('[McpConfigStore] load failed:', err.message)
      return this._getDefaultConfig()
    }
  }

  async save(config) {
    const dir = path.dirname(this.configPath)
    await fsp.mkdir(dir, { recursive: true })
    const raw = YAML.stringify(config)
    await fsp.writeFile(this.configPath, raw, 'utf8')
  }

  /**
   * 获取所有服务器配置
   */
  async listServers() {
    const config = await this.load()
    return config.servers || []
  }

  /**
   * 获取单个服务器配置
   */
  async getServer(name) {
    const servers = await this.listServers()
    return servers.find(s => s.name === name) || null
  }

  /**
   * 添加或更新服务器
   */
  async upsertServer(serverDef) {
    if (!serverDef.name || !serverDef.name.trim()) {
      throw new Error('server name is required')
    }
    const config = await this.load()
    const servers = config.servers || []
    const idx = servers.findIndex(s => s.name === serverDef.name)
    if (idx >= 0) {
      servers[idx] = { ...servers[idx], ...serverDef }
    }
    else {
      servers.push({
        name: serverDef.name,
        command: serverDef.command || '',
        args: serverDef.args || [],
        url: serverDef.url || '',
        env: serverDef.env || {},
        enabled: serverDef.enabled !== false,
        transport: serverDef.transport || 'stdio',
        ...Object.fromEntries(
          Object.entries(serverDef).filter(([_, v]) => v !== undefined && v !== null),
        ),
      })
    }
    config.servers = servers
    await this.save(config)
    return servers[idx >= 0 ? idx : servers.length - 1]
  }

  /**
   * 删除服务器
   */
  async removeServer(name) {
    const config = await this.load()
    config.servers = (config.servers || []).filter(s => s.name !== name)
    await this.save(config)
  }

  /**
   * 更新服务器启用状态
   */
  async setEnabled(name, enabled) {
    const config = await this.load()
    const server = (config.servers || []).find(s => s.name === name)
    if (server) {
      server.enabled = Boolean(enabled)
      await this.save(config)
    }
  }
}
