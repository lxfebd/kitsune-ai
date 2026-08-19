/**
 * Kitsune Discord Bot
 *
 * 通过 server-sdk WebSocket 连接 server，以 discord-bot 身份注册。
 * 复用：
 * - @kitsune/server-sdk Client（WebSocket 连接 + 模块注册）
 * - @discordjs/voice（语音频道支持）
 * - @kitsune/audio（音频编码解码）
 * - stores/modules/discord store（配置管理）
 *
 * 消息流转：Discord → server-sdk WebSocket → server → LLM → 回复
 */

import { env, exit } from 'node:process'

import { Client } from '@kitsune/server-sdk'
import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)
const log = useLogg('discord-bot').useGlobalConfig()

const SERVER_URL = env.SERVER_URL ?? 'ws://localhost:6121/ws'
const SERVER_TOKEN = env.SERVER_TOKEN ?? ''
const DISCORD_TOKEN = env.DISCORD_TOKEN ?? ''

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: Client<any> | null = null
let discordClient: any = null

async function main() {
  log.log('Starting Kitsune Discord Bot...')

  if (!DISCORD_TOKEN) {
    log.warn('DISCORD_TOKEN not set, will wait for server config')
  }

  client = new Client({
    url: SERVER_URL,
    token: SERVER_TOKEN,
    name: 'discord-bot',
    extension: { id: 'discord-bot' },
    identity: {
      id: `discord-bot-${Date.now()}`,
      extension: { id: 'discord-bot' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    handshake: 'module',
    autoConnect: true,
    autoReconnect: true,
    onReady: () => {
      log.log('Connected to server')
      void connectDiscord()
    },
    onError: (err) => {
      log.withError(err).error('Server connection error')
    },
    onClose: () => {
      log.log('Server connection closed')
    },
  })

  // 监听 ui:configure 事件接收前端配置
  client.onEvent('ui:configure', async (event: any) => {
    const data = event.data
    if (data?.moduleName === 'discord') {
      log.withFields({ config: data.config }).log('Received discord config from server')
      if (data.config?.token) {
        await connectDiscord(data.config.token)
      }
    }
  })

  process.on('SIGINT', () => shutdown())
  process.on('SIGTERM', () => shutdown())
}

async function connectDiscord(token?: string) {
  const activeToken = token ?? DISCORD_TOKEN
  if (!activeToken) {
    log.warn('No Discord token available')
    return
  }

  if (discordClient) {
    log.log('Discord client already running, destroying old one')
    discordClient.destroy()
    discordClient = null
  }

  try {
    // 动态 import discord.js
    const { Client, GatewayIntentBits } = require('discord.js')
    discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
      ],
    })

    discordClient.on('ready', () => {
      log.withFields({ user: discordClient.user?.tag }).log('Discord bot logged in')
    })

    discordClient.on('messageCreate', async (message: any) => {
      // 忽略 bot 自身的消息
      if (message.author.bot) return

      log.withFields({ author: message.author.tag, channel: message.channel.id, content: message.content.slice(0, 100) }).log('Message received')

      // 通过 server-sdk 转发消息到 server
      if (client) {
        client.send({
          type: 'input:text',
          data: {
            text: `[Discord ${message.channel.name}] ${message.author.username}: ${message.content}`,
            metadata: {
              source: { type: 'discord', id: message.channel.id, name: message.channel.name },
            },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
      }
    })

    discordClient.on('error', (err: Error) => {
      log.withError(err).error('Discord client error')
    })

    await discordClient.login(activeToken)
  }
  catch (err) {
    log.withError(err).error('Failed to create Discord client')
  }
}

async function shutdown() {
  log.log('Shutting down...')
  if (discordClient) {
    discordClient.destroy()
    discordClient = null
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