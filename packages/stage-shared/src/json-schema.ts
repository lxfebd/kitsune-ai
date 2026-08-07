/**
 * Shared JSON Schema normalization utilities.
 *
 * Consolidates 4 diverged copies of normalizeNullableAnyOf from:
 *   - packages/core-agent/src/agents/spark-notify/schema.ts
 *   - packages/stage-ui/src/tools/character/orchestrator/spark-command-shared.ts
 *   - apps/stage-tamagotchi/src/renderer/stores/tools/builtin/desktop-automation.ts
 *   - apps/stage-tamagotchi/src/renderer/stores/tools/builtin/widgets.ts
 *
 * Uses duck-typed Record<string, unknown> to avoid adding xsschema as a dependency.
 * Callers can pass their JsonSchema values directly (JsonSchema extends Record<string, unknown>).
 */

const NULLABLE_SCALAR_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'null'])

/** Duck-type check for JSON Schema objects (not arrays, not booleans). */
export function isJsonSchema(value: unknown): value is Record<string, unknown> {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object')
}

/**
 * Normalizes JSON Schema anyOf unions containing nullable scalar types.
 *
 * Collapses `anyOf: [{type: "string"}, {type: "null"}]` into `type: ["string", "null"]`
 * for Azure/OpenAI compatibility. Also extracts numeric constraints from collapsed entries
 * and cleans up stale `required` keys.
 *
 * Recurses into `properties`, `items`, `anyOf`, and `oneOf`.
 *
 * Before:
 * - `{ anyOf: [{ type: "string" }, { type: "null" }] }`
 *
 * After:
 * - `{ type: ["string", "null"] }`
 */
export function normalizeNullableAnyOf<T extends object>(schema: T): T {
  const next = { ...schema } as unknown as Record<string, unknown>

  if (next.properties && typeof next.properties === 'object') {
    const properties = Object.fromEntries(
      Object.entries(next.properties as Record<string, unknown>).map(([key, value]) => {
        if (!isJsonSchema(value))
          return [key, value]
        return [key, normalizeNullableAnyOf(value)]
      }),
    )
    next.properties = properties

    // Clean up stale required keys that reference properties removed during normalization.
    if (Array.isArray(next.required)) {
      const propertyNames = new Set(Object.keys(properties))
      next.required = (next.required as string[]).filter(key => propertyNames.has(key))
      if ((next.required as string[]).length === 0)
        delete next.required
    }
  }

  if (Array.isArray(next.items)) {
    next.items = next.items.map(item => isJsonSchema(item) ? normalizeNullableAnyOf(item) : item)
  }
  else if (isJsonSchema(next.items)) {
    next.items = normalizeNullableAnyOf(next.items)
  }

  if (Array.isArray(next.anyOf)) {
    next.anyOf = next.anyOf.map(value => isJsonSchema(value) ? normalizeNullableAnyOf(value) : value)

    const normalizedEntries = (next.anyOf as Record<string, unknown>[]).filter(isJsonSchema)
    const primitiveTypes = normalizedEntries
      .map(entry => entry.type)
      .filter((type): type is string => typeof type === 'string')
    const dedupedPrimitiveTypes = [...new Set(primitiveTypes)]

    if (
      primitiveTypes.length === normalizedEntries.length
      && dedupedPrimitiveTypes.length > 0
      && dedupedPrimitiveTypes.every(type => NULLABLE_SCALAR_TYPES.has(type))
    ) {
      // Lift numeric constraints from collapsed number/integer entries.
      for (const entry of normalizedEntries) {
        if (entry.type !== 'number' && entry.type !== 'integer')
          continue
        for (const key of ['multipleOf', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'] as const) {
          if (entry[key] !== undefined && next[key] === undefined)
            next[key] = entry[key]
        }
      }
      delete next.anyOf
      next.type = dedupedPrimitiveTypes
    }
  }

  if (Array.isArray(next.oneOf)) {
    next.oneOf = next.oneOf.map(value => isJsonSchema(value) ? normalizeNullableAnyOf(value) : value)
  }

  return next as unknown as T
}
