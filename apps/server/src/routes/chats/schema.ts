import { array, check, literal, maxLength, minLength, object, optional, pipe, string, union } from 'valibot'

const ChatTypeSchema = union([
  literal('private'),
  literal('bot'),
  literal('group'),
  literal('channel'),
])

const ChatMemberTypeSchema = union([
  literal('user'),
  literal('character'),
  literal('bot'),
])

// Discriminated member invariants:
// - type === 'user' requires userId
// - non-user member types require characterId
// Enforced at the HTTP boundary so invalid combinations fail as 4xx (createBadRequestError).
const MemberSchema = pipe(
  object({
    type: ChatMemberTypeSchema,
    userId: optional(string()),
    characterId: optional(string()),
  }),
  check(member => member.type === 'user' ? Boolean(member.userId) : Boolean(member.characterId)),
)

export const CreateChatSchema = object({
  id: optional(pipe(string(), minLength(1), maxLength(30))),
  type: optional(ChatTypeSchema),
  title: optional(string()),
  members: optional(array(MemberSchema)),
})

export const UpdateChatSchema = object({
  title: optional(string()),
})

export const AddMemberSchema = MemberSchema
