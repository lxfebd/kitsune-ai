---
name: drizzle-orm
description: >-
  Drizzle ORM development for PostgreSQL. Use when defining schemas, writing queries,
  managing migrations, or working with database operations in apps/server/schemas/
  and services/domain/.
---

# Drizzle ORM Development

Guide for using Drizzle ORM in the Kitsune server.

## When to Use

- Defining database schemas (tables, relations)
- Writing queries (select, insert, update, delete)
- Creating database migrations
- Working with transactions
- Integrating Valibot validation

## Core Architecture

```
apps/server/
├── schemas/              # Drizzle table definitions
│   ├── accounts.ts       # User accounts
│   ├── characters.ts     # Character definitions
│   ├── chats.ts          # Chat sessions
│   ├── providers.ts      # LLM providers
│   ├── flux.ts           # Credit system
│   └── index.ts          # Schema exports
├── drizzle/              # Generated migrations
│   └── migrations/
├── drizzle.config.ts     # Drizzle Kit config
└── services/domain/      # Business logic using DB
```

## Schema Definition

### Basic Table

```typescript
// schemas/my-table.ts
import { pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core'

export const myTable = pgTable('my_table', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  count: integer('count').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

### With References

```typescript
import { pgTable, uuid, text } from 'drizzle-orm/pg-core'
import { users } from './users'

export const characters = pgTable('characters', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
})
```

### Relations

```typescript
// schemas/relations.ts
import { relations } from 'drizzle-orm'
import { users } from './users'
import { characters } from './characters'

export const usersRelations = relations(users, ({ many }) => ({
  characters: many(characters),
}))

export const charactersRelations = relations(characters, ({ one }) => ({
  user: one(users, {
    fields: [characters.userId],
    references: [users.id],
  }),
}))
```

### JSON/JSONB Columns

```typescript
import { pgTable, uuid, jsonb } from 'drizzle-orm/pg-core'

export const configs = pgTable('configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  settings: jsonb('settings').$type<{
    theme: string
    language: string
    notifications: boolean
  }>(),
})
```

### Enums

```typescript
import { pgTable, pgEnum } from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('role', ['user', 'admin', 'moderator'])

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  role: roleEnum('role').default('user').notNull(),
})
```

## Query Patterns

### Select

```typescript
import { db } from '../db'
import { characters } from '../schemas/characters'
import { eq, and, like } from 'drizzle-orm'

// Simple select
const allCharacters = await db.select().from(characters)

// With conditions
const userCharacters = await db
  .select()
  .from(characters)
  .where(eq(characters.userId, userId))

// With multiple conditions
const filtered = await db
  .select()
  .from(characters)
  .where(
    and(
      eq(characters.userId, userId),
      like(characters.name, '%test%')
    )
  )

// Select specific columns
const names = await db
  .select({ name: characters.name })
  .from(characters)
```

### Insert

```typescript
// Single insert
const [newCharacter] = await db
  .insert(characters)
  .values({
    userId,
    name: 'My Character',
  })
  .returning()

// Bulk insert
const newCharacters = await db
  .insert(characters)
  .values([
    { userId, name: 'Character 1' },
    { userId, name: 'Character 2' },
  ])
  .returning()
```

### Update

```typescript
const [updated] = await db
  .update(characters)
  .set({ name: 'New Name', updatedAt: new Date() })
  .where(eq(characters.id, characterId))
  .returning()
```

### Delete

```typescript
const [deleted] = await db
  .delete(characters)
  .where(eq(characters.id, characterId))
  .returning()
```

### Joins

```typescript
import { characters } from '../schemas/characters'
import { users } from '../schemas/users'

const result = await db
  .select({
    characterName: characters.name,
    userName: users.name,
  })
  .from(characters)
  .innerJoin(users, eq(characters.userId, users.id))
```

### With Relations (Query API)

```typescript
import { characters } from '../schemas/characters'

// Load with relations
const characterWithUser = await db.query.characters.findFirst({
  where: eq(characters.id, characterId),
  with: {
    user: true,
  },
})

// Nested relations
const userWithCharacters = await db.query.users.findFirst({
  where: eq(users.id, userId),
  with: {
    characters: {
      with: {
        chats: true,
      },
    },
  },
})
```

## Transactions

```typescript
const result = await db.transaction(async (tx) => {
  const [user] = await tx
    .insert(users)
    .values({ name: 'New User' })
    .returning()

  const [character] = await tx
    .insert(characters)
    .values({ userId: user.id, name: 'Default Character' })
    .returning()

  return { user, character }
})
```

## Pagination

```typescript
import { characters } from '../schemas/characters'

const PAGE_SIZE = 20

// Offset-based
const page = await db
  .select()
  .from(characters)
  .limit(PAGE_SIZE)
  .offset(pageNumber * PAGE_SIZE)

// Cursor-based
const cursorPage = await db
  .select()
  .from(characters)
  .where(gt(characters.id, lastCursor))
  .limit(PAGE_SIZE)
  .orderBy(characters.id)
```

## Valibot Integration

```typescript
import { object, string, number, parse } from 'valibot'
import { drizzleValibot } from 'drizzle-valibot'
import { characters } from '../schemas/characters'

// Infer schema from Drizzle table
const insertCharacterSchema = drizzleValibot(characters).insert

// Validate before insert
const validated = parse(insertCharacterSchema, requestBody)
const [newCharacter] = await db.insert(characters).values(validated).returning()
```

## Migrations

### Generate Migration

```bash
# Generate migration from schema changes
pnpm -F @kitsune/server db:generate

# Push schema directly (dev only)
pnpm -F @kitsune/server db:push
```

### drizzle.config.ts

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/schemas/*',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

## Testing with Mock DB

```typescript
import { describe, it, expect, vi } from 'vitest'

// Mock the database module
vi.mock('../db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: '1' }]),
  },
}))

describe('Character Service', () => {
  it('should list characters', async () => {
    const result = await characterService.list()
    expect(result).toEqual([])
  })
})
```

## Best Practices

1. **Always use `.returning()`** for mutations to get the affected rows
2. **Use `eq()` from `drizzle-orm`** for comparisons, not raw SQL
3. **Define relations** in a separate file for cleaner organization
4. **Use transactions** for multi-table mutations
5. **Validate input** with Valibot before database operations
6. **Use `$type<T>()`** for JSON/JSONB columns to get proper TypeScript types

## Checklist

- [ ] Define tables in `schemas/` directory
- [ ] Add relations in `schemas/relations.ts`
- [ ] Use Valibot for request validation
- [ ] Use transactions for multi-table operations
- [ ] Generate migrations with `pnpm db:generate`
- [ ] Test database operations with mocked DB
