/**
 * Kitsune Minecraft Bot — Mineflayer 智能体
 *
 * 通过 server-sdk WebSocket 连接 server，以 minecraft-bot 身份注册，
 * 通过 context:update 推送 Minecraft 状态，监听 spark:command 执行操作。
 *
 * 复用：
 * - @kitsune/server-sdk Client（WebSocket 连接 + 模块注册）
 * - mineflayer（Minecraft 客户端）
 * - gaming-minecraft store 定义的事件契约
 */

import { env, exit } from 'node:process'

import { Client } from '@kitsune/server-sdk'
import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)
const log = useLogg('minecraft-bot').useGlobalConfig()

const SERVER_URL = env.SERVER_URL ?? 'ws://localhost:6121/ws'
const SERVER_TOKEN = env.SERVER_TOKEN ?? ''
const MINECRAFT_HOST = env.MINECRAFT_HOST ?? 'localhost'
const MINECRAFT_PORT = Number(env.MINECRAFT_PORT) || 25565
const MINECRAFT_USERNAME = env.MINECRAFT_USERNAME ?? 'KitsuneBot'
const MINECRAFT_PASSWORD = env.MINECRAFT_PASSWORD ?? ''

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bot: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: Client<any> | null = null

async function main() {
  log.log('Starting Kitsune Minecraft Bot...')

  client = new Client({
    url: SERVER_URL,
    token: SERVER_TOKEN,
    name: 'minecraft-bot',
    extension: { id: 'minecraft-bot' },
    identity: {
      id: `minecraft-bot-${Date.now()}`,
      extension: { id: 'minecraft-bot' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    handshake: 'module',
    autoConnect: true,
    autoReconnect: true,
    onReady: () => {
      log.log('Connected to server, ready to receive commands')
      void connectMinecraft()
    },
    onError: (err) => {
      log.withError(err).error('Server connection error')
    },
    onClose: () => {
      log.log('Server connection closed')
    },
  })

  client.onEvent('spark:command', async (event: any) => {
    log.withFields({ intent: event.data.intent, destinations: event.data.destinations }).log('Received spark:command')
    handleSparkCommand(event.data)
  })

  // 优雅关闭
  process.on('SIGINT', () => shutdown())
  process.on('SIGTERM', () => shutdown())
}

function connectMinecraft() {
  if (bot) return

  log.withFields({ host: MINECRAFT_HOST, port: MINECRAFT_PORT }).log('Connecting to Minecraft server...')

  try {
    // 动态 import mineflayer（防止模块加载时未安装依赖）
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mineflayer = require('mineflayer')
    bot = mineflayer.createBot({
      host: MINECRAFT_HOST,
      port: MINECRAFT_PORT,
      username: MINECRAFT_USERNAME,
      password: MINECRAFT_PASSWORD || undefined,
      auth: MINECRAFT_PASSWORD ? 'microsoft' : 'offline',
    })

    bot.on('login', () => {
      log.withFields({ username: bot.username }).log('Logged in to Minecraft')
      pushContextUpdate({ text: `已登录 Minecraft 服务器 ${MINECRAFT_HOST}:${MINECRAFT_PORT}，玩家名: ${bot.username}` })
    })

    bot.on('spawn', () => {
      log.log('Bot spawned in game')
      pushContextUpdate({ text: `Bot 已生成在游戏中，位置: ${bot.entity.position.toString()}` })
    })

    bot.on('chat', (username: string, message: string) => {
      log.withFields({ username, message }).log('Chat message')
      pushContextUpdate({ text: `[聊天] ${username}: ${message}`, lane: 'minecraft:chat' })
    })

    bot.on('death', () => {
      log.warn('Bot died')
      pushContextUpdate({ text: 'Bot 死亡', lane: 'minecraft:status' })
    })

    bot.on('kicked', (reason: string) => {
      log.warn(`Bot kicked: ${reason}`)
      pushContextUpdate({ text: `Bot 被踢出服务器: ${reason}`, lane: 'minecraft:status' })
    })

    bot.on('error', (err: Error) => {
      log.withError(err).error('Minecraft bot error')
    })

    bot.on('end', (reason: string) => {
      log.warn(`Bot disconnected: ${reason}`)
      bot = null
      // 自动重连（5 秒后）
      setTimeout(() => connectMinecraft(), 5000)
    })
  }
  catch (err) {
    log.withError(err).error('Failed to create mineflayer bot')
    pushContextUpdate({ text: `Minecraft 连接失败: ${String(err)}`, lane: 'minecraft:status' })
  }
}

function handleSparkCommand(data: any) {
  const intent = data.intent ?? ''
  const payload = data.payload ?? {}

  log.withFields({ intent, payload }).log('Handling spark command')

  if (!bot) {
    log.warn('Bot not connected, cannot execute command')
    return
  }

  try {
    switch (intent) {
      case 'minecraft:move':
        if (payload.x !== undefined && payload.z !== undefined) {
          bot.pathfinder?.goto({ x: payload.x, y: payload.y ?? bot.entity.position.y, z: payload.z })
        }
        break

      case 'minecraft:chat':
        if (payload.message) {
          bot.chat(payload.message)
        }
        break

      case 'minecraft:look':
        if (payload.yaw !== undefined && payload.pitch !== undefined) {
          bot.look(payload.yaw, payload.pitch, true)
        }
        break

      case 'minecraft:equip':
        if (payload.itemName) {
          const item = bot.inventory.items().find((i: any) => i.name.includes(payload.itemName))
          if (item) bot.equip(item, 'hand')
        }
        break

      case 'minecraft:status':
        pushContextUpdate({
          text: JSON.stringify({
            health: bot.health,
            food: bot.food,
            position: bot.entity.position.toString(),
            dimension: bot.game?.dimension,
            players: Object.keys(bot.players).slice(0, 10),
          }),
          lane: 'minecraft:status',
        })
        break

      default:
        log.warn(`Unknown intent: ${intent}`)
    }
  }
  catch (err) {
    log.withError(err).error(`Failed to execute intent: ${intent}`)
  }
}

function pushContextUpdate(data: { text: string, lane?: string }) {
  if (!client) return
  client.send({
    type: 'context:update',
    data: { text: data.text, lane: data.lane ?? 'minecraft:general' },
  } as any)
}

async function shutdown() {
  log.log('Shutting down...')
  if (bot) {
    bot.end()
    bot = null
  }
  if (client) {
    client.close()
    client = null
  }
  exit(0)
}

main().catch((err) => {
  log.withError(err).error('Fatal error')
  exit(1)
})