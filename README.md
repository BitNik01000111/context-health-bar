# Context Health Bar

A Claude Code mod that displays a visual battery-style health bar showing context token consumption in real-time.

## Features

- **Live measurement**: the engine's `session.measure` event feeds the context tokens, window and cost; the bar below the prompt input updates on every measurement, and on `/clear` it resets.
- **9-segment battery**: 3 segments per zone (red, yellow, green); the lit part drains from the right as the context fills.
- **Thresholds as % of the window**: yellow tip at 30%, red tip at 40% by default. Red replaces yellow.
- **Cost**: the session cost is shown as `· $0.42` when above zero.
- **Usage windows**: the five-hour and seven-day limits, with a countdown to each reset (`23% ↻2h14m · 41% ↻3d4h`). Shown only when the engine reports them (a subscription); the countdown is redrawn every minute.
- **Unknown state**: before a reading arrives, the bar is neutral and shows `–/200k` instead of zero.
- **Configurable**: plugin settings plus the `/context-config` command, saved across sessions.

## Installation

### From a local clone (development)

```bash
claude --plugin-dir /path/to/context-health-bar
```

Or enable hot-reloading in Claude Code when prompted.

### From GitHub

At the prompt of a terminal session:

```bash
/plugin install context-health-bar --marketplace BitNik01000111/context-health-bar
```

From a shell:

```bash
claude plugin install context-health-bar --marketplace BitNik01000111/context-health-bar
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `BitNik01000111/context-health-bar`, then Add plugin.

## Configuration

The tips (`→ considere /passagem`, `→ /passagem e /clear`) point at a `/passagem` handoff skill the author uses; they are plain text, so they work as a nudge to clear the context even without that skill.

### Plugin settings (userConfig)

- **Fallback Window** (`maxTokens`, default 180,000): context window used until the model's real window is known.
- **Yellow Percent** (`yellowPercent`, default 30): fill percentage at which the bar shows the tip `→ considere /passagem` (gray).
- **Red Percent** (`redPercent`, default 40): fill percentage at which the tip `→ /passagem e /clear` (gray) replaces the yellow one.

### Command

```
/context-config                  show effective thresholds and where each comes from
/context-config yellow <n>       set the yellow percent (1-100, must stay below red)
/context-config red <n>          set the red percent (1-100, must stay above yellow)
/context-config reset            clear saved values
```

Values set with the command are saved across sessions and take precedence over the plugin settings. Effective value = saved ?? plugin setting ?? default.

## How It Works

- **session.start**: clears the old status line, reads the model, the thresholds and the current usage (`$.session.usage()`), fills the state atom, registers `/context-config`.
- **session.measure** (observe-only): writes tokens, window, cost and usage windows into the plugin's state atom, re-reads the model when the context changes (so `/model` is followed), passes the event on.
- **ui.render** (PromptHint): two footer lines: the engine's own hint line (`await next(e)`), then the bar alone on the terminal's last line, pushed to the bottom-right corner by a `flexGrow` spacer. No Box around the engine's node may take a `width` (the engine refuses that tree and draws only its own line). The bar fits the full width minus 2 columns at each edge; if even the bare bar does not fit, only the engine line is drawn. Nothing is drawn until the first session.start.
- **command.run** for `/context-config`: answers the command, saves to `$.store`, reloads the thresholds and redraws.
- **session.end** with reason `clear`: clears the counters, redraws and re-registers the command (no `session.start` fires after `/clear`).

Effective thresholds are loaded once and cached: saved value, else the plugin setting, else the default.

### Bar below the prompt

```
23% ↻2h14m · 41% ↻3d4h │ Sonnet 4.6 │ ▮▮▮▮▮▮▯▯▯ │ 60k/200k (30%) · $0.42  → considere /passagem
```

Unknown fill: `Sonnet 4.6 │ ········· │ –/200k`. Only the lit battery segments are colored; everything else is dim. When the row is narrow the tip is dropped first, then the cost, then the seven-day window, then the five-hour window, then the bar.

## Technical Details

- **Event Hooks**: `session.start`, `session.measure` (observe-only), `command.run` (matcher `context-config`), `session.end`, `ui.render` (matcher `PromptHint`)
- **API Calls**: `$.session.model()`, `$.session.usage()`, `$.store` (saved thresholds)
- **State**: `$.state` atom `context-health-bar.meter`, declared in `types/index.d.ts`
- **UI**: `ui.render` on `PromptHint` with `Box`/`Text` only; the bar is a second footer line below the engine's own hint line, pushed right by a `flexGrow` spacer, sized from `e.viewport.columns` (no `width` on any Box holding the engine's node); `$.ui.status(undefined)` once at session.start to clear old lines
- **Command**: `$.command.register()` for `/context-config [yellow <n> | red <n> | reset]`

## Author

Gabriel Kuhn

## License

MIT. See [LICENSE](LICENSE).
