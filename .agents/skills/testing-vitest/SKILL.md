---
name: testing-vitest
description: >-
  Vitest testing framework for Kitsune project. Use when writing unit tests,
  component tests, or working with test files (*.test.ts) across the monorepo.
---

# Vitest Testing Guide

Guide for writing and running tests in the Kitsune project.

## When to Use

- Writing unit tests for services, utilities, composables
- Testing Vue components with `@vue/test-utils`
- Creating browser tests with Playwright
- Mocking dependencies and modules
- Configuring test coverage

## Core Architecture

```
vitest.config.ts              # Root config with projects
apps/server/vitest.config.ts  # Server-specific config
packages/stage-ui/vitest.config.ts  # UI package config
apps/stage-tamagotchi/vitest.config.ts  # Electron config
```

## Test File Organization

```
src/
├── services/
│   ├── my-service.ts
│   └── my-service.test.ts      # Co-located test
├── composables/
│   ├── use-feature.ts
│   └── use-feature.test.ts     # Co-located test
└── components/
    ├── MyComponent.vue
    └── MyComponent.test.ts     # Co-located test
```

## Basic Test Pattern

```typescript
// my-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMyService } from './my-service'

describe('MyService', () => {
  let service: ReturnType<typeof createMyService>

  beforeEach(() => {
    service = createMyService()
  })

  it('should initialize correctly', () => {
    expect(service).toBeDefined()
  })

  it('should perform action', async () => {
    const result = await service.doSomething()
    expect(result).toBe('expected')
  })

  it('should throw on invalid input', () => {
    expect(() => service.validate('')).toThrow('Invalid input')
  })
})
```

## Mocking

### Mock Functions

```typescript
import { vi } from 'vitest'

// Create mock function
const mockFn = vi.fn()

// Mock return value
mockFn.mockReturnValue('result')

// Mock async return
mockFn.mockResolvedValue({ data: 'test' })

// Mock implementation
mockFn.mockImplementation((arg) => `processed: ${arg}`)

// Assert calls
expect(mockFn).toHaveBeenCalledWith('input')
expect(mockFn).toHaveBeenCalledTimes(1)
```

### Mock Modules

```typescript
import { vi } from 'vitest'

// Mock entire module
vi.mock('./my-module', () => ({
  myFunction: vi.fn().mockReturnValue('mocked'),
  myConstant: 42,
}))

// Mock with hoisting
vi.hoisted(() => {
  return {
    mockMyFunction: vi.fn(),
  }
})

vi.mock('./my-module', () => ({
  myFunction: mockMyFunction,
}))
```

### Mock Dependencies

```typescript
// my-service.test.ts
import { vi } from 'vitest'

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue([]),
}

vi.mock('../db', () => ({
  db: mockDb,
}))

describe('MyService', () => {
  it('should query database', async () => {
    const service = createMyService()
    await service.list()
    expect(mockDb.select).toHaveBeenCalled()
  })
})
```

## Vue Component Testing

```typescript
// MyComponent.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MyComponent from './MyComponent.vue'

describe('MyComponent', () => {
  it('renders props', () => {
    const wrapper = mount(MyComponent, {
      props: { title: 'Test' },
    })
    expect(wrapper.text()).toContain('Test')
  })

  it('emits events', async () => {
    const wrapper = mount(MyComponent)
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('handles slots', () => {
    const wrapper = mount(MyComponent, {
      slots: { default: 'Slot content' },
    })
    expect(wrapper.text()).toContain('Slot content')
  })
})
```

## Testing Composables

```typescript
// use-feature.test.ts
import { describe, it, expect } from 'vitest'
import { useFeature } from './use-feature'
import { mount } from '@vue/test-utils'

describe('useFeature', () => {
  it('should return reactive state', () => {
    const wrapper = mount({
      setup() {
        const { state, loading } = useFeature()
        return { state, loading }
      },
      template: '<div />',
    })

    expect(wrapper.vm.loading).toBe(false)
  })
})
```

## Testing Hono Routes

```typescript
// route.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createMyRoutes } from './index'

describe('My Routes', () => {
  const mockService = {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
  }

  const app = createMyRoutes(mockService)

  it('should list items', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toEqual([])
  })

  it('should return 404', async () => {
    const res = await app.request('/nonexistent')
    expect(res.status).toBe(404)
  })
})
```

## Browser Tests

```typescript
// component.browser.test.ts
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/vue'
import MyComponent from './MyComponent.vue'

describe('MyComponent Browser', () => {
  it('renders in browser environment', () => {
    render(MyComponent, { props: { title: 'Test' } })
    expect(screen.getByText('Test')).toBeDefined()
  })
})
```

## Vitest Configuration

### Root Config

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'apps/server',
      'packages/stage-ui',
      'apps/stage-tamagotchi',
    ],
  },
})
```

### Project Config

```typescript
// apps/server/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
})
```

## Running Tests

```bash
# Run all tests
pnpm test:run

# Run specific project
pnpm -F @kitsune/server exec vitest run

# Run specific file
pnpm exec vitest run apps/server/src/services/my-service.test.ts

# Run with coverage
pnpm test:run --coverage

# Run in watch mode
pnpm test
```

## Best Practices

1. **Co-locate tests** with source files using `*.test.ts`
2. **Use `vi.fn()`** for function mocks
3. **Use `vi.mock()`** for module mocks
4. **Test behavior, not implementation**
5. **Use descriptive test names**
6. **Clean up mocks** in `beforeEach` or `afterEach`
7. **Mock external dependencies** (DB, API, file system)

## Checklist

- [ ] Create test file next to source
- [ ] Use `describe` / `it` structure
- [ ] Mock external dependencies
- [ ] Test happy path and error cases
- [ ] Run tests before committing
- [ ] Check coverage thresholds
