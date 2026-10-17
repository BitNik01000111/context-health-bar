# Context Health Bar

A Claude Code mod that displays a visual battery-style health bar showing context token consumption in real-time.

## Features

- **Real-time token tracking**: Uses `turn.step` and `session.append` events to monitor context usage via `$.model.countTokens()`
- **Color-coded visualization**: 
  - 🟢 Green: Light context usage (0-60k tokens)
  - 🟡 Yellow: Medium usage (60k-120k tokens)
  - 🔴 Red: Heavy usage (120k-180k tokens)
- **Status line display**: Shows in the bottom right corner, left of the model indicator
- **18 progress bars**: 6 bars per color zone, each representing 10k tokens (180k total by default)
- **Auto-detection**: Automatically detects current model and suggests configuration
- **Configurable limits**: Set different token limits per model via `/context-config` command

## Installation

### From this folder (development)

```bash
claude --plugin-dir /Users/gabrielkuhn/.claude/dev-mods/8e52836e-d7bf-4d34-b344-942a0aec915e/context-health-bar
```

Or enable hot-reloading in Claude Code when prompted.

### From GitHub

```bash
/plugin install context-health-bar --marketplace gabrielkuhn/context-health-bar
```

## Configuration

### Via Plugin Settings

In Claude Code settings, configure:
- **Max Tokens**: Maximum tokens to display (default: 180,000)
- **Auto-Detect Model**: Enable/disable automatic model detection (default: true)

### Via Command

```
/context-config
```

Shows current configuration and allows toggling between auto and manual detection modes.

## How It Works

### Token Counting

The mod uses the Anthropic API's `countTokens()` method (Option A) for precise token counting:

1. **On turn.step**: Counts tokens as the model generates responses
2. **On session.append**: Updates after each message is added to the conversation
3. **On session.end**: Resets when session is cleared

### Visual Representation

```
████████████████░░ 145k/180k (80%)
```

- Filled bars (█) = tokens consumed
- Empty bars (░) = tokens remaining
- Drains from right to left (green → yellow → red)

## Status Bar Example

Bottom-right corner:
```
████████████████░░ 145k/180k (80%) | Model: claude-opus-4-20250805
```

## Technical Details

- **Event Hooks**: `session.start`, `turn.step`, `session.append`, `command.run`, `session.end`
- **API Calls**: `$.model.countTokens()`, `$.session.messages()`, `$.session.model()`
- **UI**: `$.ui.status()` for status line display, `$.ui.toast()` for notifications
- **Command**: `$.command.register()` for `/context-config` command

## Author

Gabriel Kuhn

## License

MIT
