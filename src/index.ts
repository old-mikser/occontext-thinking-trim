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

const CONFIG_DIR = join(homedir(), ".config", "opencode")
const CONFIG_FILE = join(CONFIG_DIR, "OCTT.jsonc")
const DEBUG_LOG = join(CONFIG_DIR, "OCTT-debug.log")

const DEFAULT_CONFIG: ThinkingTrimConfig = {
  enabled: true,
  keepTurns: 0,
}

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

async function debugLog(message: string): Promise<void> {
  const timestamp = new Date().toISOString()
  const logLine = `[${timestamp}] ${message}\n`
  const file = Bun.file(DEBUG_LOG)
  const existing = (await file.exists()) ? await file.text() : ""
  await Bun.write(DEBUG_LOG, existing + logLine)
}

const plugin: Plugin = async () => {
  let config: ThinkingTrimConfig = await loadConfig()

  const log = Bun.file(DEBUG_LOG)
  if (await log.exists()) {
    await Bun.write(DEBUG_LOG, "")
  }

  await debugLog(`Plugin loaded. Config: ${JSON.stringify(config)}`)

  return {
    "experimental.chat.messages.transform": async (_, output: TransformOutput) => {
      await debugLog(`Hook called. Messages count: ${output.messages.length}`)

      if (!config.enabled) {
        await debugLog("Plugin disabled, skipping")
        return
      }

      let totalReasoningParts = 0
      let trimmedReasoningParts = 0

      for (let idx = 0; idx < output.messages.length; idx++) {
        const msg = output.messages[idx]
        const reasoningCount = msg.parts.filter((p) => p.type === "reasoning").length
        totalReasoningParts += reasoningCount
        if (reasoningCount > 0) {
          await debugLog(`Message ${idx} (${msg.info.role}): ${reasoningCount} reasoning parts`)
        }
      }

      const assistantMessages = output.messages
        .map((msg, idx) => ({ msg, idx }))
        .filter(({ msg }) => msg.info.role === "assistant")
        .reverse()

      await debugLog(`Found ${assistantMessages.length} assistant messages`)

      for (let ri = 0; ri < assistantMessages.length; ri++) {
        const { msg, idx } = assistantMessages[ri]
        const shouldKeepReasoning = ri < config.keepTurns
        const beforeCount = msg.parts.filter((p) => p.type === "reasoning").length
        if (!shouldKeepReasoning) {
          msg.parts = msg.parts.filter((part) => part.type !== "reasoning")
        }
        const afterCount = msg.parts.filter((p) => p.type === "reasoning").length
        trimmedReasoningParts += beforeCount - afterCount
        if (beforeCount > 0) {
          await debugLog(`Assistant msg ${idx}: ${beforeCount} -> ${afterCount} reasoning (reverseIdx=${ri}, keepTurns=${config.keepTurns})`)
        }
      }

      await debugLog(`Trimmed ${trimmedReasoningParts}/${totalReasoningParts} reasoning parts`)
    },
  }
}

export default plugin
