import { McpConfigStore } from './mcpConfigStore.js'
import { McpServerInstance as McpServerInstanceClass } from './mcpServerInstance.js'

let McpServerInstance = McpServerInstanceClass

/**
 * MCP Client Manager — 管理所有MCP Server连接的生命周期
 *
 * 职责：
 * 1. 加载配置，管理Server实例的创建/销毁
 * 2. 按需连接/断开
 * 3. 提供统一的状态查询和工具调用接口
 */
class McpClientManager {
  constructor() {
    this.configStore = new McpConfigStore();
    /** @type {Map<string, McpServerInstance>} name → instance */
    this.instances = new Map();
    this._initialized = false;
  }

  /**
   * 初始化：加载配置并自动连接已启用的服务器
   */
  async initialize() {
    if (this._initialized) return;

    const servers = await this.configStore.listServers();
    const enabledServers = servers.filter(s => s.enabled !== false);

    console.log(`[MCP Manager] Found ${servers.length} servers (${enabledServers.length} enabled)`);

    // 并行连接所有启用的服务器
    const connectPromises = enabledServers.map(async (config) => {
      try {
        const instance = new McpServerInstance(config);
        this.instances.set(config.name, instance);
        await instance.connect();
      } catch (err) {
        console.error(`[MCP Manager] Failed to init server "${config.name}":`, err.message);
      }
    });

    await Promise.allSettled(connectPromises);
    this._initialized = true;
  }

  /**
   * 获取所有实例状态
   */
  getAllStatus() {
    return Array.from(this.instances.values()).map(inst => inst.getStatus());
  }

  /**
   * 获取单个服务器状态
   */
  getStatus(name) {
    const inst = this.instances.get(name);
    return inst ? inst.getStatus() : null;
  }

  /**
   * 获取所有已连接服务器的工具列表（扁平化）
   * 格式: [{ serverName, toolName, description, inputSchema }]
   */
  getAllTools() {
    const allTools = [];
    for (const [serverName, instance] of this.instances) {
      if (!instance.isConnected) continue;
      for (const tool of instance.tools) {
        allTools.push({
          serverName,
          toolName: tool.name,
          fullName: `mcp::${serverName}::${tool.name}`,
          description: `[${serverName}] ${tool.description}`,
          inputSchema: tool.inputSchema,
          _instance: instance  // 内部引用，用于调用
        });
      }
    }
    return allTools;
  }

  /**
   * 通过完整工具名调用MCP工具
   * fullName格式: mcp::{serverName}::{toolName}
   *
   * NOTICE:
   * 使用 :: 作为分隔符，避免与工具名中的 _ 冲突。
   * 旧格式 mcp_{serverName}_{toolName} 仍支持向后兼容。
   * Removal condition: 当所有客户端都迁移到新格式后移除兼容代码。
   */
  async callTool(fullName, args) {
    let serverName;
    let toolName;

    // 新格式: mcp::{serverName}::{toolName}
    const newFormatMatch = fullName.match(/^mcp::(.+)::(.+)$/);
    if (newFormatMatch) {
      [, serverName, toolName] = newFormatMatch;
    }
    // 旧格式兼容: mcp_{serverName}_{toolName}
    else if (fullName.startsWith('mcp_')) {
      const parts = fullName.split('_');
      if (parts.length < 3) {
        throw new Error(`invalid MCP tool name format: ${fullName}`);
      }
      serverName = parts.slice(1, -1).join('_');
      toolName = parts[parts.length - 1];
    }
    else {
      throw new Error(`invalid MCP tool name format: ${fullName}`);
    }

    const instance = this.instances.get(serverName);
    if (!instance || !instance.isConnected) {
      throw new Error(`MCP server "${serverName}" is not connected`);
    }

    return instance.callTool(toolName, args);
  }

  /**
   * 手动添加并连接一个新服务器
   */
  async addServer(serverDef) {
    // 先保存到配置
    await this.configStore.upsertServer(serverDef);

    // 创建实例
    const instance = new McpServerInstance(serverDef);
    this.instances.set(serverDef.name, instance);

    // 如果启用则立即连接
    if (serverDef.enabled !== false) {
      await instance.connect();
    }

    return instance.getStatus();
  }

  /**
   * 删除服务器：断开 + 移除配置
   */
  async removeServer(name) {
    const instance = this.instances.get(name);
    if (instance) {
      await instance.disconnect();
      this.instances.delete(name);
    }
    await this.configStore.removeServer(name);
  }

  /**
   * 更新服务器启用状态
   */
  async setEnabled(name, enabled) {
    await this.configStore.setEnabled(name, enabled);
    const instance = this.instances.get(name);
    if (instance) {
      if (enabled && !instance.isConnected) {
        await instance.connect();
      } else if (!enabled && instance.isConnected) {
        await instance.disconnect();
      }
    }
  }

  /**
   * 重连指定服务器
   */
  async reconnect(name) {
    const instance = this.instances.get(name);
    if (instance) {
      await instance.disconnect();
    }

    // 用最新类创建新实例（替换旧的）
    const config = await this.configStore.getServer(name);
    if (!config) throw new Error(`server "${name}" not found in config`);

    const newInstance = new McpServerInstance(config);
    this.instances.set(name, newInstance);
    await newInstance.connect();
    return newInstance.getStatus();
  }

  /**
   * 断开所有连接
   */
  async shutdown() {
    const disconnectPromises = [];
    for (const [name, instance] of this.instances) {
      disconnectPromises.push(
        instance.disconnect().catch(err => console.error(`[MCP] shutdown error ${name}:`, err))
      );
    }
    await Promise.allSettled(disconnectPromises);
    this.instances.clear();
    this._initialized = false;
  }
}

// 单例
export const manager = new McpClientManager()

export { McpClientManager }
