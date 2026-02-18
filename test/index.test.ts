import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { homedir } from "os"
import { join } from "path"
import { $ } from "bun"

type Part = { type: string; [key: string]: unknown }
type TransformOutput = { messages: { info: { role: string }; parts: Part[] }[] }

const CONFIG_DIR = join(homedir(), ".config", "opencode")
const CONFIG_FILE = join(CONFIG_DIR, "OCTT.jsonc")
const TEST_CONFIG_FILE = join(CONFIG_DIR, "OCTT.jsonc.test")

const createMessage = (role: "user" | "assistant", content: string, hasReasoning = false) => {
  const parts: Part[] = [{ type: "text", text: content }]
  if (hasReasoning && role === "assistant") {
    parts.unshift({ type: "reasoning", text: "thinking..." })
  }
  return { info: { role }, parts }
}

const writeConfig = async (config: { enabled?: boolean; keepTurns?: number }) => {
  const content = JSON.stringify(config)
  await Bun.write(CONFIG_FILE, content)
}

const clearConfigCache = () => {
  delete require.cache[require.resolve("../src/index")]
}

describe("occontext-thinking-trim", () => {
  beforeEach(async () => {
    try {
      await $`rm -f ${CONFIG_FILE}`.quiet()
    } catch {}
    clearConfigCache()
  })

  afterEach(async () => {
    try {
      await $`rm -f ${CONFIG_FILE}`.quiet()
    } catch {}
  })

  describe("config loading", () => {
    test("creates default config when file doesn't exist", async () => {
      const { default: plugin } = await import("../src/index")
      await plugin({} as any)
      
      const file = Bun.file(CONFIG_FILE)
      expect(await file.exists()).toBe(true)
      
      const content = await file.text()
      expect(content).toContain('"enabled"')
      expect(content).toContain('"keepTurns"')
    })

    test("reads enabled: false from config file", async () => {
      await writeConfig({ enabled: false, keepTurns: 0 })
      
      const { default: plugin } = await import("../src/index")
      const hooks = await plugin({} as any)
      
      const output: TransformOutput = { messages: [createMessage("assistant", "hi", true)] }
      await hooks["experimental.chat.messages.transform"]?.({}, output as any)
      
      expect(output.messages[0].parts).toHaveLength(2)
      expect(output.messages[0].parts[0].type).toBe("reasoning")
    })

    test("reads keepTurns from config file", async () => {
      await writeConfig({ enabled: true, keepTurns: 1 })
      
      const { default: plugin } = await import("../src/index")
      const hooks = await plugin({} as any)
      
      const output: TransformOutput = {
        messages: [
          createMessage("assistant", "a1", true),
          createMessage("assistant", "a2", true),
          createMessage("assistant", "a3", true),
        ]
      }
      await hooks["experimental.chat.messages.transform"]?.({}, output as any)
      
      expect(output.messages[0].parts).toHaveLength(1)
      expect(output.messages[1].parts).toHaveLength(1)
      expect(output.messages[2].parts).toHaveLength(2)
    })

    test("parses JSONC with comments", async () => {
      const jsonc = `{
  // This is a comment
  "enabled": true,
  /* multi-line
     comment */
  "keepTurns": 1
}`
      await Bun.write(CONFIG_FILE, jsonc)
      
      const { default: plugin } = await import("../src/index")
      const hooks = await plugin({} as any)
      
      const output: TransformOutput = {
        messages: [
          createMessage("assistant", "a1", true),
          createMessage("assistant", "a2", true),
        ]
      }
      await hooks["experimental.chat.messages.transform"]?.({}, output as any)
      
      expect(output.messages[0].parts).toHaveLength(1)
      expect(output.messages[1].parts).toHaveLength(2)
    })
  })

  describe("reasoning trimming", () => {
    test("removes all reasoning when keepTurns is 0", async () => {
      await writeConfig({ enabled: true, keepTurns: 0 })
      
      const { default: plugin } = await import("../src/index")
      const hooks = await plugin({} as any)
      
      const output: TransformOutput = {
        messages: [
          createMessage("user", "q1"),
          createMessage("assistant", "a1", true),
          createMessage("user", "q2"),
          createMessage("assistant", "a2", true),
        ]
      }
      await hooks["experimental.chat.messages.transform"]?.({}, output as any)
      
      expect(output.messages[1].parts).toHaveLength(1)
      expect(output.messages[3].parts).toHaveLength(1)
    })

    test("keeps N recent turns when keepTurns > 0", async () => {
      await writeConfig({ enabled: true, keepTurns: 1 })
      
      const { default: plugin } = await import("../src/index")
      const hooks = await plugin({} as any)
      
      const output: TransformOutput = {
        messages: [
          createMessage("user", "q1"),
          createMessage("assistant", "a1", true),
          createMessage("user", "q2"),
          createMessage("assistant", "a2", true),
        ]
      }
      await hooks["experimental.chat.messages.transform"]?.({}, output as any)
      
      expect(output.messages[1].parts).toHaveLength(1)
      expect(output.messages[3].parts).toHaveLength(2)
      expect(output.messages[3].parts[0].type).toBe("reasoning")
    })

    test("keeps all reasoning when keepTurns >= total turns", async () => {
      await writeConfig({ enabled: true, keepTurns: 10 })
      
      const { default: plugin } = await import("../src/index")
      const hooks = await plugin({} as any)
      
      const output: TransformOutput = {
        messages: [createMessage("assistant", "a1", true)]
      }
      await hooks["experimental.chat.messages.transform"]?.({}, output as any)
      
      expect(output.messages[0].parts).toHaveLength(2)
    })
  })

  describe("edge cases", () => {
    test("handles empty messages array", async () => {
      await writeConfig({ enabled: true, keepTurns: 0 })
      
      const { default: plugin } = await import("../src/index")
      const hooks = await plugin({} as any)
      
      const output: TransformOutput = { messages: [] }
      await hooks["experimental.chat.messages.transform"]?.({}, output as any)
      
      expect(output.messages).toHaveLength(0)
    })

    test("preserves non-reasoning parts", async () => {
      await writeConfig({ enabled: true, keepTurns: 0 })
      
      const { default: plugin } = await import("../src/index")
      const hooks = await plugin({} as any)
      
      const output: TransformOutput = {
        messages: [{
          info: { role: "assistant" },
          parts: [
            { type: "reasoning", text: "think" },
            { type: "text", text: "hello" },
            { type: "text", text: "world" },
          ]
        }]
      }
      await hooks["experimental.chat.messages.transform"]?.({}, output as any)
      
      expect(output.messages[0].parts).toHaveLength(2)
      expect(output.messages[0].parts.map(p => p.type)).toEqual(["text", "text"])
    })

    test("does not trim reasoning from user messages", async () => {
      await writeConfig({ enabled: true, keepTurns: 0 })
      
      const { default: plugin } = await import("../src/index")
      const hooks = await plugin({} as any)
      
      const output: TransformOutput = {
        messages: [{
          info: { role: "user" },
          parts: [
            { type: "reasoning", text: "user thinking" },
            { type: "text", text: "question" },
          ]
        }]
      }
      await hooks["experimental.chat.messages.transform"]?.({}, output as any)
      
      expect(output.messages[0].parts).toHaveLength(2)
    })
  })
})
