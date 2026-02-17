# occontext-thinking-trim

OpenCode plugin that trims thinking/reasoning from context while preserving display.

## Why?

Models with extended thinking (Claude, DeepSeek, etc.) send reasoning back in context on each request. This can:
- Increase token usage
- Potentially influence model behavior in unwanted ways

This plugin removes reasoning from the context sent to the model, while keeping it visible in the UI.

## Installation

1. Clone or copy this directory to your OpenCode plugins folder:
   ```bash
   mkdir -p ~/.config/opencode/plugins
   cp -r . ~/.config/opencode/plugins/occontext-thinking-trim
   ```

2. Add to your `opencode.json`:
   ```json
   {
     "plugins": ["occontext-thinking-trim"]
   }
   ```

## Configuration

Add to your `opencode.json`:

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

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the plugin |
| `keepTurns` | number | `0` | Number of recent turns to preserve thinking. `0` = trim all |

## Example

With `keepTurns: 2`, the last 2 assistant messages will keep their reasoning intact, while older reasoning is removed.

## License

MIT
