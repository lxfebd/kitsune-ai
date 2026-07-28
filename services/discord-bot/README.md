# Kitsune AI Discord Bot Service

This workspace runs Kitsune AI's dedicated Discord bot. It connects to a Discord server and bridges messages back to Kitsune AI.

## Setup

1. Install workspace dependencies from the repo root:

   ```bash
   pnpm i
   ```

2. Copy the template:

   ```bash
   cp services/discord-bot/.env services/discord-bot/.env.local
   ```

3. Edit `services/discord-bot/.env.local`.

4. Start the service:

   ```bash
   pnpm -F @kitsune/discord-bot dev
   ```

   Or, from `services/discord-bot/`:

   ```bash
   pnpm dev
   ```

5. The bot should automatically connect to both Kitsune AI and Discord.

## Environment Variables

- `DISCORD_TOKEN` - Discord bot token
- `KITSUNE_TOKEN` - Kitsune AI server token
- `KITSUNE_URL` - Kitsune AI WebSocket URL (default: `ws://localhost:6121/ws`)

## Development

- `pnpm dev` - Start the bot in development mode
- `pnpm lint` - Run ESLint
- `pnpm typecheck` - Run TypeScript type checking
