import type { Plugin } from "@opencode-ai/plugin"
import type { Config } from "@opencode-ai/sdk"

type Part = { type: string; [key: string]: unknown }
type TransformedMessage = { info: { role: string }; parts: Part[] }
type TransformOutput = { messages: TransformedMessage[] }

interface ThinkingTrimConfig {
  enabled: boolean
  keepTurns: number
}

const DEFAULT_CONFIG: ThinkingTrimConfig = {
  enabled: true,
  keepTurns: 0,
}

const plugin: Plugin = async () => {
  let config: ThinkingTrimConfig = { ...DEFAULT_CONFIG }

  return {
    config: async (cfg: Config) => {
      const tc = (cfg.experimental as Record<string, unknown>)?.thinkingTrim as ThinkingTrimConfig | undefined
      config = {
        enabled: tc?.enabled ?? DEFAULT_CONFIG.enabled,
        keepTurns: tc?.keepTurns ?? DEFAULT_CONFIG.keepTurns,
      }
    },

    "experimental.chat.messages.transform": async (_, output: TransformOutput) => {
      if (!config.enabled) return

      const assistantMessages = output.messages
        .map((msg, idx) => ({ msg, idx }))
        .filter(({ msg }) => msg.info.role === "assistant")
        .reverse()

      assistantMessages.forEach(({ msg, idx }, reverseIdx) => {
        const shouldKeepReasoning = reverseIdx < config.keepTurns
        if (!shouldKeepReasoning) {
          msg.parts = msg.parts.filter((part) => part.type !== "reasoning")
        }
      })
    },
  }
}

export default plugin
