# Context Health Bar

A Claude Code mod that shows a battery-style context bar below the prompt, plus the five-hour and seven-day usage percentages with reset countdowns.

```
23% ↻2h14m · 41% ↻3d4h │ Sonnet 4.6 │ ▮▮▮▮▮▮▯▯▯ │ 60k/200k (30%) · $0.42
```

## Install

From a shell:

```bash
claude plugin marketplace add BitNik01000111/context-health-bar
claude plugin install context-health-bar@context-health-bar
```

Or inside Claude Code:

```
/plugin marketplace add BitNik01000111/context-health-bar
/plugin install context-health-bar@context-health-bar
```

Restart Claude Code to load it.

## Update

```bash
claude plugin update context-health-bar@context-health-bar
```

## Settings

```
/context-config                  show the current thresholds
/context-config yellow <n>       percent of the window for the yellow tip (default 30)
/context-config red <n>          percent of the window for the red tip (default 40)
/context-config reset            clear saved values
```

## License

MIT
