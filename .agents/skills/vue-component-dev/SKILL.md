---
name: vue-component-dev
description: >-
  Vue 3 component development for Kitsune AI. Use when creating new Vue components,
  composables, Pinia stores, or working with Vue SFCs in packages/stage-ui/,
  apps/stage-web/, or apps/stage-tamagotchi/.
---

# Vue Component Development

Guide for developing Vue 3 components in the Kitsune project.

## When to Use

- Creating new Vue components in `packages/stage-ui/src/components/`
- Writing composables in `packages/stage-ui/src/composables/`
- Building Pinia stores in `packages/stage-ui/src/stores/`
- Adding pages to `apps/stage-web/src/pages/` or `apps/stage-tamagotchi/src/renderer/pages/`
- Working with UnoCSS styling
- Testing Vue components

## Core Architecture

```
packages/stage-ui/src/
├── components/           # Shared UI components
│   ├── animations/       # Animation components
│   ├── auth/             # Authentication UI
│   ├── form/             # Form components
│   ├── graphics/         # Graphics/rendering
│   ├── layouts/          # Layout components
│   ├── markdown/         # Markdown rendering
│   ├── misc/             # Utility components
│   ├── scenarios/        # Page-specific components
│   └── widgets/          # Widget components
├── composables/          # Business composables
│   ├── use-analytics.ts
│   ├── use-audio-*.ts
│   ├── use-chat-session.ts
│   └── use-*.ts
├── stores/               # Pinia stores
│   ├── chat/             # Chat state
│   ├── character/        # Character state
│   ├── modules/          # Feature modules
│   ├── settings/         # Settings state
│   └── providers/        # LLM providers
└── utils/                # Utilities
```

## SFC Component Pattern

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

// Props with defaults
const props = withDefaults(defineProps<{
  title: string
  count?: number
  variant?: 'primary' | 'secondary'
}>(), {
  count: 0,
  variant: 'primary',
})

// Emits
const emit = defineEmits<{
  update: [value: string]
  submit: [data: FormData]
}>()

// Composables
const { t } = useI18n()

// Reactive state
const isOpen = ref(false)

// Computed
const displayTitle = computed(() => `${props.title} (${props.count})`)

// Methods
function handleClick() {
  isOpen.value = !isOpen.value
  emit('update', displayTitle.value)
}
</script>

<template>
  <div
    :class="[
      'px-4 py-2 rounded-lg',
      'flex items-center gap-2',
      variant === 'primary'
        ? 'bg-primary text-white'
        : 'bg-secondary text-gray-800',
    ]"
    @click="handleClick"
  >
    <span>{{ displayTitle }}</span>
    <slot name="actions" />
  </div>
</template>
```

## Composable Pattern

```typescript
// composables/use-feature.ts
import { ref, computed, onUnmounted } from 'vue'
import { useSharedStore } from '../stores/shared'

export function useFeature(options?: { autoStart?: boolean }) {
  const store = useSharedStore()
  const isLoading = ref(false)
  const error = ref<Error | null>(null)

  const data = computed(() => store.featureData)

  async function fetchData() {
    isLoading.value = true
    error.value = null
    try {
      await store.loadFeatureData()
    } catch (e) {
      error.value = e as Error
    } finally {
      isLoading.value = false
    }
  }

  // Cleanup
  onUnmounted(() => {
    // Cleanup resources if needed
  })

  if (options?.autoStart) {
    fetchData()
  }

  return {
    data,
    isLoading,
    error,
    fetchData,
  }
}
```

## Pinia Store Pattern

```typescript
// stores/feature.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useFeatureStore = defineStore('feature', () => {
  // State
  const items = ref<Item[]>([])
  const currentId = ref<string | null>(null)

  // Getters
  const currentItem = computed(() =>
    items.value.find((item) => item.id === currentId.value)
  )

  const sortedItems = computed(() =>
    [...items.value].sort((a, b) => a.name.localeCompare(b.name))
  )

  // Actions
  async function loadItems() {
    const response = await fetch('/api/items')
    items.value = await response.json()
  }

  async function addItem(item: Omit<Item, 'id'>) {
    const response = await fetch('/api/items', {
      method: 'POST',
      body: JSON.stringify(item),
    })
    const newItem = await response.json()
    items.value.push(newItem)
    return newItem
  }

  function setCurrent(id: string) {
    currentId.value = id
  }

  return {
    items,
    currentId,
    currentItem,
    sortedItems,
    loadItems,
    addItem,
    setCurrent,
  }
})
```

## UnoCSS Styling Rules

### Use Class Arrays

```vue
<!-- Good -->
<template>
  <div :class="['px-4 py-2', 'flex items-center', 'bg-white dark:bg-black']">
    Content
  </div>
</template>

<!-- Bad - avoid long inline strings -->
<template>
  <div class="px-4 py-2 flex items-center bg-white dark:bg-black">
    Content
  </div>
</template>
```

### Dark Mode

```vue
<template>
  <div :class="['bg-white dark:bg-gray-900', 'text-gray-900 dark:text-white']">
    Dark mode ready
  </div>
</template>
```

### Responsive

```vue
<template>
  <div :class="['w-full md:w-1/2 lg:w-1/3']">
    Responsive
  </div>
</template>
```

## Component Testing

```typescript
// MyComponent.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MyComponent from './MyComponent.vue'

describe('MyComponent', () => {
  it('renders title', () => {
    const wrapper = mount(MyComponent, {
      props: { title: 'Test' },
    })
    expect(wrapper.text()).toContain('Test')
  })

  it('emits update on click', async () => {
    const wrapper = mount(MyComponent, {
      props: { title: 'Test' },
    })
    await wrapper.trigger('click')
    expect(wrapper.emitted('update')).toHaveLength(1)
  })
})
```

## Page Component Pattern

```vue
<!-- apps/stage-web/src/pages/my-page.vue -->
<script setup lang="ts">
import { useFeature } from '@kitsune/stage-ui/composables/use-feature'

const { data, isLoading, fetchData } = useFeature({ autoStart: true })
</script>

<template>
  <div :class="['p-4', 'max-w-4xl mx-auto']">
    <h1 :class="['text-2xl font-bold mb-4']">My Page</h1>

    <div v-if="isLoading" :class="['animate-pulse']">
      Loading...
    </div>

    <div v-else :class="['grid grid-cols-1 md:grid-cols-2 gap-4']">
      <div
        v-for="item in data"
        :key="item.id"
        :class="['p-4 rounded-lg', 'bg-white dark:bg-gray-800']"
      >
        {{ item.name }}
      </div>
    </div>
  </div>
</template>
```

## Key Imports

```typescript
// UI components
import { Button, Input, Select } from '@kitsune/ui'

// Stage UI components
import { ToasterRoot, MarkdownRenderer } from '@kitsune/stage-ui/components'

// Composables
import { useInferencePreload, useBreakpoints } from '@kitsune/stage-ui/composables'

// Stores
import { useSettings, useChatSessionStore } from '@kitsune/stage-ui/stores'
```

## Best Practices

1. **Use `<script setup lang="ts">`** for all components
2. **Use class arrays** for UnoCSS styling, not inline strings
3. **Define props with `withDefaults`** for default values
4. **Define emits with type-only syntax** `defineEmits<{ event: [payload] }>`
5. **Extract reusable logic** into composables (use* functions)
6. **Use Pinia stores** for shared state across components
7. **Co-locate tests** with components using `*.test.ts` naming
8. **Support dark mode** with `dark:` prefix classes

## Checklist

- [ ] Use `<script setup lang="ts">` syntax
- [ ] Define props and emits with TypeScript types
- [ ] Use UnoCSS class arrays for styling
- [ ] Support dark mode with `dark:` prefix
- [ ] Extract business logic to composables
- [ ] Use Pinia for shared state
- [ ] Write component tests with `@vue/test-utils`
- [ ] Follow existing naming conventions
