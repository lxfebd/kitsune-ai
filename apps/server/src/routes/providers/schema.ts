import { createInsertSchema, createSelectSchema } from 'drizzle-valibot'
import { boolean, object, optional, record, string } from 'valibot'

import * as schema from '../../schemas/providers'

export const UserProviderConfigSchema = createSelectSchema(schema.userProviderConfigs)
export const InsertUserProviderConfigSchema = createInsertSchema(schema.userProviderConfigs)

export const SystemProviderConfigSchema = createSelectSchema(schema.systemProviderConfigs)
export const InsertSystemProviderConfigSchema = createInsertSchema(schema.systemProviderConfigs)

// TODO(audit): Replace these schemas with explicit HTTP request DTOs — createInsertSchema-derived bodies still leak server-managed fields at the API boundary.
export const CreateProviderConfigSchema = object({
  id: optional(string()),
  definitionId: string(),
  name: string(),
  config: optional(record(string(), string())),
  validated: optional(boolean()),
  validationBypassed: optional(boolean()),
})

// PATCH is restricted to user-editable fields; validated/validationBypassed are
// server-managed state (set by validation flows) and must not be client-writable.
export const UpdateProviderConfigSchema = object({
  name: optional(string()),
  config: optional(record(string(), string())),
})
