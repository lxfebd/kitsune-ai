import process, { env } from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)
const log = useLogg('Bot').useGlobalConfig()

// Create a new client instance
async function main() {
  // Create Discord adapter with configuration
  log.log('Starting Discord bot...')

  // Set up process shutdown hooks
  async function gracefulShutdown(signal: string) {
    log.log(`Received ${signal}, shutting down...`)
    process.exit(0)
  }

  process.on('SIGINT', async () => {
    await gracefulShutdown('SIGINT')
  })

  process.on('SIGTERM', async () => {
    await gracefulShutdown('SIGTERM')
  })
}

main().catch(err => log.withError(err).error('An error occurred'))
