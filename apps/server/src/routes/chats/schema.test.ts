import { describe, expect, it } from 'vitest'
import { safeParse } from 'valibot'

import { AddMemberSchema, CreateChatSchema } from './schema'

describe('chats schema member invariants', () => {
  describe('AddMemberSchema', () => {
    it('accepts a user-type member with a userId', () => {
      const result = safeParse(AddMemberSchema, { type: 'user', userId: 'user-1' })
      expect(result.success).toBe(true)
    })

    it('rejects a user-type member without a userId', () => {
      const result = safeParse(AddMemberSchema, { type: 'user' })
      expect(result.success).toBe(false)
    })

    it('accepts a character-type member with a characterId', () => {
      const result = safeParse(AddMemberSchema, { type: 'character', characterId: 'char-1' })
      expect(result.success).toBe(true)
    })

    it('rejects a character-type member without a characterId', () => {
      const result = safeParse(AddMemberSchema, { type: 'character' })
      expect(result.success).toBe(false)
    })

    it('rejects a bot-type member without a characterId', () => {
      const result = safeParse(AddMemberSchema, { type: 'bot' })
      expect(result.success).toBe(false)
    })

    it('rejects an unknown member type', () => {
      const result = safeParse(AddMemberSchema, { type: 'admin', userId: 'user-1' })
      expect(result.success).toBe(false)
    })
  })

  describe('CreateChatSchema', () => {
    it('applies the same invariants to nested members', () => {
      const ok = safeParse(CreateChatSchema, {
        type: 'private',
        members: [
          { type: 'user', userId: 'user-1' },
          { type: 'character', characterId: 'char-1' },
        ],
      })
      expect(ok.success).toBe(true)

      const bad = safeParse(CreateChatSchema, {
        type: 'private',
        members: [{ type: 'user' }],
      })
      expect(bad.success).toBe(false)
    })
  })
})
