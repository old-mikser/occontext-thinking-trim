# occontext-thinking-trim Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create an OpenCode plugin that trims thinking/reasoning from context while keeping it displayed, with configurable keepTurns option.

**Architecture:** Plugin uses `experimental.chat.messages.transform` hook to filter reasoning parts from messages before they're sent to the LLM. Configuration is read via `config` hook from `experimental.thinkingTrim` field in opencode.json.

**Tech Stack:** TypeScript, Bun, @opencode-ai/plugin

---

### Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

**Step 1: Create package.json**

```json
{
  "name": "occontext-thinking-trim",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@opencode-ai/plugin": "^1.2.6"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*", "test/**/*"]
}
```

**Step 3: Create .gitignore**

```
node_modules/
*.log
bun.lockb
```

**Step 4: Install dependencies**

Run: `bun install`
Expected: Dependencies installed successfully

**Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore
git commit -m "chore: initialize project structure"
```

---

### Task 2: Write Plugin Implementation Tests

**Files:**
- Create: `test/index.test.ts`

**Step 1: Write the failing tests**

```typescript
import { test, expect, describe, mock } from "bun:test"
import type { Config, Message } from "@opencode-ai/plugin"

type Part = { type: string; text?: string; [key: string]: unknown }
type TransformedMessage = { info: Message; parts: Part[] }
type TransformOutput = { messages: TransformedMessage[] }

describe("occontext-thinking-trim", () => {
  const createMockConfig = (thinkingTrim?: { enabled?: boolean; keepTurns?: number }): Config =>
    ({ experimental: thinkingTrim ? { thinkingTrim } : {} }) as Config

  const createMessage = (role: "user" | "assistant", content: string, hasReasoning = false): TransformedMessage => {
    const parts: Part[] = [{ type: "text", text: content }]
    if (hasReasoning && role === "assistant") {
      parts.unshift({ type: "reasoning", text: "thinking..." })
    }
    return { info: { role } as Message, parts }
  }

  describe("config parsing", () => {
    test("uses defaults when config missing", async () => {
      const { default: plugin } = await import("../src/index")
      const config = createMockConfig()
      const hooks = await plugin({} as any)
      await hooks.config?.(config)
      
      const output: TransformOutput = { messages: [createMessage("assistant", "hi", true)] }
      await hooks["experimental.chat.messages.transform"]?.({}, output)
      
      expect(output.messages[0].parts).toHaveLength(1)
      expect(output.messages[0].parts[0].type).toBe("text")
    })

    test("respects enabled: false", async () => {
      const { default: plugin } = await import("../src/index")
      const config = createMockConfig({ enabled: false, keepTurns: 0 })
      const hooks = await plugin({} as any)
      await hooks.config?.(config)
      
      const output: TransformOutput = { messages: [createMessage("assistant", "hi", true)] }
      await hooks["experimental.chat.messages.transform"]?.({}, output)
      
      expect(output.messages[0].parts).toHaveLength(2)
      expect(output.messages[0].parts[0].type).toBe("reasoning")
    })
  })

  describe("reasoning trimming", () => {
    test("removes all reasoning when keepTurns is 0", async () => {
      const { default: plugin } = await import("../src/index")
      const config = createMockConfig({ enabled: true, keepTurns: 0 })
      const hooks = await plugin({} as any)
      await hooks.config?.(config)
      
      const output: TransformOutput = {
        messages: [
          createMessage("user", "q1"),
          createMessage("assistant", "a1", true),
          createMessage("user", "q2"),
          createMessage("assistant", "a2", true),
        ]
      }
      await hooks["experimental.chat.messages.transform"]?.({}, output)
      
      expect(output.messages[1].parts).toHaveLength(1)
      expect(output.messages[3].parts).toHaveLength(1)
    })

    test("keeps N recent turns when keepTurns > 0", async () => {
      const { default: plugin } = await import("../src/index")
      const config = createMockConfig({ enabled: true, keepTurns: 1 })
      const hooks = await plugin({} as any)
      await hooks.config?.(config)
      
      const output: TransformOutput = {
        messages: [
          createMessage("user", "q1"),
          createMessage("assistant", "a1", true),
          createMessage("user", "q2"),
          createMessage("assistant", "a2", true),
        ]
      }
      await hooks["experimental.chat.messages.transform"]?.({}, output)
      
      expect(output.messages[1].parts).toHaveLength(1)
      expect(output.messages[3].parts).toHaveLength(2)
      expect(output.messages[3].parts[0].type).toBe("reasoning")
    })

    test("keeps all reasoning when keepTurns >= total turns", async () => {
      const { default: plugin } = await import("../src/index")
      const config = createMockConfig({ enabled: true, keepTurns: 10 })
      const hooks = await plugin({} as any)
      await hooks.config?.(config)
      
      const output: TransformOutput = {
        messages: [
          createMessage("assistant", "a1", true),
        ]
      }
      await hooks["experimental.chat.messages.transform"]?.({}, output)
      
      expect(output.messages[0].parts).toHaveLength(2)
    })
  })

  describe("edge cases", () => {
    test("handles empty messages array", async () => {
      const { default: plugin } = await import("../src/index")
      const config = createMockConfig({ enabled: true, keepTurns: 0 })
      const hooks = await plugin({} as any)
      await hooks.config?.(config)
      
      const output: TransformOutput = { messages: [] }
      await hooks["experimental.chat.messages.transform"]?.({}, output)
      
      expect(output.messages).toHaveLength(0)
    })

    test("preserves non-reasoning parts", async () => {
      const { default: plugin } = await import("../src/index")
      const config = createMockConfig({ enabled: true, keepTurns: 0 })
      const hooks = await plugin({} as any)
      await hooks.config?.(config)
      
      const output: TransformOutput = {
        messages: [{
          info: { role: "assistant" } as Message,
          parts: [
            { type: "reasoning", text: "think" },
            { type: "text", text: "hello" },
            { type: "tool-use", name: "test" },
          ]
        }]
      }
      await hooks["experimental.chat.messages.transform"]?.({}, output)
      
      expect(output.messages[0].parts).toHaveLength(2)
      expect(output.messages[0].parts.map(p => p.type)).toEqual(["text", "tool-use"])
    })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `bun test`
Expected: FAIL - Cannot find module "../src/index"

**Step 3: Commit**

```bash
git add test/index.test.ts
git commit -m "test: add plugin test coverage"
```

---

### Task 3: Implement Plugin

**Files:**
- Create: `src/index.ts`

**Step 1: Write the implementation**

```typescript
import type { Plugin, Hooks, Config } from "@opencode-ai/plugin"

type Part = { type: string; [key: string]: unknown }
type TransformedMessage = { info: { role: string }; parts: Part[] }
type TransformOutput = { messages: TransformedMessage[] }

interface ThinkingTrimConfig {
  enabled?: boolean
  keepTurns?: number
}

const defaults: Required<ThinkingTrimConfig> = {
  enabled: true,
  keepTurns: 0,
}

let settings: Required<ThinkingTrimConfig> = { ...defaults }

const plugin: Plugin = async () => {
  const hooks: Hooks = {
    config: async (config: Config) => {
      const trimConfig = (config.experimental as Record<string, unknown>)?.thinkingTrim as ThinkingTrimConfig | undefined
      settings = {
        enabled: trimConfig?.enabled ?? defaults.enabled,
        keepTurns: trimConfig?.keepTurns ?? defaults.keepTurns,
      }
    },

    "experimental.chat.messages.transform": async (_, output: TransformOutput) => {
      if (!settings.enabled) return

      const messages = output.messages
      const assistantIndices = messages
        .map((m, i) => (m.info.role === "assistant" ? i : -1))
        .filter((i) => i !== -1)

      const keepFromIndex = assistantIndices.length - settings.keepTurns

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i]
        if (msg.info.role !== "assistant") continue

        const assistantTurnNumber = assistantIndices.indexOf(i)
        if (assistantTurnNumber < keepFromIndex) {
          msg.parts = msg.parts.filter((p) => p.type !== "reasoning")
        }
      }
    },
  }

  return hooks
}

export default plugin
```

**Step 2: Run tests to verify they pass**

Run: `bun test`
Expected: All tests pass

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: implement thinking trim plugin"
```

---

### Task 4: Documentation

**Files:**
- Create: `README.md`
- Create: `AGENTS.md`

**Step 1: Write README.md**

```markdown
# occontext-thinking-trim

OpenCode plugin that trims thinking/reasoning from context while keeping it displayed.

## Installation

1. Clone or copy this directory to your OpenCode plugins folder:
   ```bash
   cp -r . ~/.config/opencode/plugins/occontext-thinking-trim
   ```

2. Add to your `opencode.json`:
   ```json
   {
     "plugin": ["occontext-thinking-trim"]
   }
   ```

## Configuration

Add to your `opencode.json` under `experimental`:

```json
{
  "experimental": {
    "thinkingTrim": {
      "enabled": true,
      "keepTurns": 0
    }
  }
}
```

### Options

- `enabled` (boolean, default: `true`) - Enable/disable the plugin
- `keepTurns` (number, default: `0`) - Number of recent assistant turns to keep reasoning for. Set to `0` to trim all reasoning.

## How It Works

The plugin uses the `experimental.chat.messages.transform` hook to filter `reasoning` parts from assistant messages before they're sent to the LLM. This reduces context size while keeping thinking visible in the UI.

## Development

```bash
bun install
bun test
bun run typecheck
```
```

**Step 2: Write AGENTS.md**

```markdown
# AGENTS.md

OpenCode instructions for this project.

## Commands

- `bun test` - Run tests
- `bun run typecheck` - Run TypeScript type checking

## Architecture

This is an OpenCode plugin that hooks into `experimental.chat.messages.transform` to filter reasoning parts from context.

Key files:
- `src/index.ts` - Plugin implementation
- `test/index.test.ts` - Test coverage

## Conventions

- TypeScript with strict mode
- Bun as runtime and test framework
- TDD: write tests first
```

**Step 3: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: add README and AGENTS.md"
```

---

### Task 5: Final Verification

**Step 1: Run all tests**

Run: `bun test`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final verification"
```

---

## Summary

- **5 tasks** covering setup, tests, implementation, docs, verification
- **TDD approach**: tests written before implementation
- **Frequent commits**: after each logical unit
