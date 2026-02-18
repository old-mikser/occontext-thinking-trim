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
  debug: boolean
}

const CONFIG_DIR = join(homedir(), ".config", "opencode")
const CONFIG_FILE = join(CONFIG_DIR, "OCTT.jsonc")
const DEBUG_LOG = join(CONFIG_DIR, "OCTT-debug.log")

const DEFAULT_CONFIG: ThinkingTrimConfig = {
  enabled: true,
  keepTurns: 0,
  debug: false,
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
      debug: parsed.debug ?? DEFAULT_CONFIG.debug,
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

async function createDefaultConfig(): Promise<void> {
  const defaultConfig = `{
  // Enable/disable thinking trim
  "enabled": true,
  // Keep reasoning for last N assistant turns (0 = trim all)
  "keepTurns": 0,
  // Enable debug logging to ~/.config/opencode/OCTT-debug.log
  "debug": false
}`
  await $`mkdir -p ${CONFIG_DIR}`.quiet()
  await Bun.write(CONFIG_FILE, defaultConfig)
}

async function debugLog(message: string, config: ThinkingTrimConfig): Promise<void> {
  if (!config.debug) return
  const timestamp = new Date().toISOString()
  const logLine = `[${timestamp}] ${message}\n`
  const file = Bun.file(DEBUG_LOG)
  const existing = (await file.exists()) ? await file.text() : ""
  await Bun.write(DEBUG_LOG, existing + logLine)
}

const plugin: Plugin = async () => {
  const config = await loadConfig()

  if (config.debug) {
    const log = Bun.file(DEBUG_LOG)
    if (await log.exists()) {
      await Bun.write(DEBUG_LOG, "")
    }
    await debugLog(`Plugin loaded. Config: ${JSON.stringify(config)}`, config)
  }

  return {
    "experimental.chat.messages.transform": async (_, output: TransformOutput) => {
      if (!config.enabled) return

      let trimmedCount = 0

      const assistantMessages = output.messages
        .map((msg, idx) => ({ msg, idx }))
        .filter(({ msg }) => msg.info.role === "assistant")
        .reverse()

      for (let ri = 0; ri < assistantMessages.length; ri++) {
        const { msg } = assistantMessages[ri]
        const shouldKeepReasoning = ri < config.keepTurns
        if (!shouldKeepReasoning) {
          const beforeLen = msg.parts.length
          msg.parts = msg.parts.filter((part) => part.type !== "reasoning")
          trimmedCount += beforeLen - msg.parts.length
        }
      }

      if (config.debug && trimmedCount > 0) {
        await debugLog(`Trimmed ${trimmedCount} reasoning parts from ${assistantMessages.length} assistant messages`, config)
      }
    },
  }
}

export default plugin
