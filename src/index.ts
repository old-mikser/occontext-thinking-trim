import type { Plugin } from "@opencode-ai/plugin"
import { homedir } from "os"
import { join } from "path"
import { $ } from "bun"

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

const CONFIG_DIR = join(homedir(), ".config", "opencode")
const CONFIG_FILE = join(CONFIG_DIR, "OCTT.jsonc")

function stripJsonComments(jsonc: string): string {
  return jsonc
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/,\s*([}\]])/g, "$1")
}

async function loadConfig(): Promise<ThinkingTrimConfig> {
  try {
    const file = Bun.file(CONFIG_FILE)
    if (!(await file.exists())) {
      await createDefaultConfig()
      return { ...DEFAULT_CONFIG }
    }
    const jsonc = await file.text()
    const parsed = JSON.parse(stripJsonComments(jsonc))
    return {
      enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
      keepTurns: parsed.keepTurns ?? DEFAULT_CONFIG.keepTurns,
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

async function createDefaultConfig(): Promise<void> {
  const defaultContent = `{
  // Enable or disable the thinking trim plugin
  // When enabled, reasoning/thinking will be trimmed from context sent to the model
  // Default: true
  "enabled": true,

  // Number of recent assistant turns to preserve thinking/reasoning for
  // 0 = trim all thinking from all messages
  // 1 = keep thinking in the most recent assistant message
  // 2 = keep thinking in the last 2 assistant messages, etc.
  // Default: 0
  "keepTurns": 0
}
`
  await $`mkdir -p ${CONFIG_DIR}`.quiet()
  await Bun.write(CONFIG_FILE, defaultContent)
}

const plugin: Plugin = async () => {
  let config: ThinkingTrimConfig = await loadConfig()

  return {
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
