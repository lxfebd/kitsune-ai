---
name: monorepo-manager
description: >-
  Monorepo management with pnpm workspaces and Turborepo. Use when configuring
  workspaces, managing dependencies, optimizing builds, or working with
  pnpm-workspace.yaml and turbo.json.
---

# Monorepo Management Guide

Guide for managing the Kitsune monorepo with pnpm and Turborepo.

## When to Use

- Adding new packages or apps
- Configuring workspace dependencies
- Optimizing build pipelines
- Managing shared dependencies (catalogs)
- Version management and releases

## Core Configuration Files

```
pnpm-workspace.yaml       # Workspace definitions
pnpm-lock.yaml            # Lock file
turbo.json                # Turborepo task config
package.json              # Root package.json
```

## Workspace Structure

```yaml
# pnpm-workspace.yaml
packages:
  - packages/**      # Shared packages
  - apps/**          # Applications
  - plugins/**       # Plugins
  - services/**      # Standalone services
  - docs/**          # Documentation
  - engines/**       # Game engines
  - examples/**      # Example projects
```

## Package Naming Convention

```
@kitsune/<package-name>

Examples:
@kitsune/stage-ui        # UI components
@kitsune/server-runtime  # Server runtime
@kitsune/i18n            # Internationalization
```

## Common Commands

### Install Dependencies

```bash
# Install all dependencies
pnpm install

# Add dependency to specific package
pnpm -F @kitsune/stage-ui add vue-router

# Add dev dependency
pnpm -F @kitsune/server add -D @types/node

# Add workspace dependency
pnpm -F @kitsune/stage-tamagotchi add @kitsune/stage-ui
```

### Run Scripts

```bash
# Run script in specific package
pnpm -F @kitsune/server run dev

# Run script in multiple packages
pnpm -r -F @kitsune/stage-web -F @kitsune/stage-ui run build

# Run in all packages
pnpm -r run typecheck
```

### Build

```bash
# Build all packages
pnpm build

# Build specific package
pnpm -F @kitsune/stage-ui build

# Build packages only (not apps)
pnpm build:packages

# Build apps only
pnpm build:apps
```

### Typecheck

```bash
# Typecheck all
pnpm typecheck

# Typecheck specific package
pnpm -F @kitsune/stage-tamagotchi typecheck
```

### Lint

```bash
# Lint all
pnpm lint

# Lint and fix
pnpm lint:fix
```

### Test

```bash
# Run all tests
pnpm test:run

# Run tests for specific package
pnpm -F @kitsune/server exec vitest run

# Run specific test file
pnpm exec vitest run apps/server/src/services/my-service.test.ts
```

## Turborepo Configuration

### Task Definitions

```json
// turbo.json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"],
      "cache": true
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "cache": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"],
      "cache": true
    },
    "lint": {
      "cache": true
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

### Task Dependencies

- `^build` - Run build in dependencies first
- `[]` - No dependencies, run immediately
- No `dependsOn` - Default behavior

## Catalog Dependencies (Shared Versions)

```yaml
# pnpm-workspace.yaml
catalog:
  vue: ^3.5.32
  vite: ^8.0.8
  typescript: ^5.9.3
  hono: 4.11.3
```

```json
// package.json (in workspace package)
{
  "dependencies": {
    "vue": "catalog:",
    "vite": "catalog:"
  }
}
```

## Adding a New Package

1. Create directory:
```bash
mkdir packages/my-new-package
cd packages/my-new-package
```

2. Create `package.json`:
```json
{
  "name": "@kitsune/my-new-package",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "vue": "catalog:"
  }
}
```

3. Add to `tsconfig.json` references (if needed)

4. Install dependencies:
```bash
pnpm install
```

## Workspace Dependencies

```json
// apps/stage-web/package.json
{
  "dependencies": {
    "@kitsune/stage-ui": "workspace:^",
    "@kitsune/server-sdk": "workspace:^",
    "@kitsune/i18n": "workspace:*"
  }
}
```

- `workspace:^` - Caret version range
- `workspace:*` - Any version
- `workspace:~` - Tilde version range

## Patched Dependencies

```yaml
# pnpm-workspace.yaml
patchedDependencies:
  '@xsai/generate-text@0.5.0-beta.2': patches/@xsai__generate-text@0.5.0-beta.2.patch
  'pixi-live2d-display': patches/pixi-live2d-display.patch
```

## Overrides

```yaml
# pnpm-workspace.yaml
overrides:
  axios: npm:feaxios@^0.0.23
  is-core-module: npm:@nolyfill/is-core-module@^1.0.39
```

## Version Management

```bash
# Bump version
pnpm bumpp

# Or use bump.config.ts
npx bumpp --config bump.config.ts
```

## Best Practices

1. **Use catalogs** for shared dependency versions
2. **Use `workspace:^`** for internal dependencies
3. **Keep `turbo.json` tasks cached** when possible
4. **Run `pnpm install`** after changing workspace config
5. **Use filters** to scope commands to specific packages
6. **Keep packages focused** - single responsibility

## Checklist

- [ ] Add package to `pnpm-workspace.yaml` if needed
- [ ] Use `@kitsune/` namespace for packages
- [ ] Use catalog versions for shared dependencies
- [ ] Add build/typecheck/test scripts
- [ ] Run `pnpm install` after changes
- [ ] Test build with `pnpm -F <package> build`
