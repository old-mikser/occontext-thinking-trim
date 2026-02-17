import { test, expect, describe } from "bun:test"
import type { Config, Message, Part } from "@opencode-ai/sdk"

type TransformedMessage = { info: Message; parts: Part[] }
type TransformOutput = { messages: TransformedMessage[] }

describe("occontext-thinking-trim", () => {
  const createMockConfig = (thinkingTrim?: { enabled?: boolean; keepTurns?: number }): Config =>
    ({ experimental: thinkingTrim ? { thinkingTrim } : {} }) as Config

  const createMessage = (role: "user" | "assistant", content: string, hasReasoning = false): TransformedMessage => {
    const parts: Part[] = [{ type: "text", text: content, id: "text-1", sessionID: "s1", messageID: "m1" } as Part]
    if (hasReasoning && role === "assistant") {
      parts.unshift({ type: "reasoning", text: "thinking...", id: "reasoning-1", sessionID: "s1", messageID: "m1" } as Part)
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
            { type: "reasoning", text: "think", id: "r1", sessionID: "s1", messageID: "m1" } as Part,
            { type: "text", text: "hello", id: "t1", sessionID: "s1", messageID: "m1" } as Part,
            { type: "text", text: "world", id: "t2", sessionID: "s1", messageID: "m1" } as Part,
          ]
        }]
      }
      await hooks["experimental.chat.messages.transform"]?.({}, output)
      
      expect(output.messages[0].parts).toHaveLength(2)
      expect(output.messages[0].parts.map(p => p.type)).toEqual(["text", "text"])
    })
  })
})
