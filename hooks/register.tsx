import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";
import type { Limit, Meter, Thresholds } from "../types";

const BARS = 9; // 3 segments per zone: red | yellow | green
const DEFAULT_WINDOW = 180000; // fallback window until the real one is known
const DEFAULT_YELLOW_PERCENT = 30;
const DEFAULT_RED_PERCENT = 40;
const YELLOW_TIP = "→ considere /passagem";
const RED_TIP = "→ /passagem e /clear";
const YELLOW_KEY = "yellowPercent";
const RED_KEY = "redPercent";
// The bar has the terminal's last line to itself; the engine keeps 2 columns free at each edge.
const EDGE_WIDTH = 4;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const REFRESH_MS = MINUTE; // countdowns are re-drawn this often
const USAGE = "Uso: /context-config [yellow <n> | red <n> | reset]";

export type Source = "salvo" | "config do plugin" | "padrão";
export type Zone = "red" | "yellow" | "green";

// Shown above the prompt. Everything is dim except the lit battery segments.
export type Display = {
  label: string;
  zones: Zone[]; // one per segment, left to right
  known: boolean; // false draws the unlit segments as "·" instead of "▯"
  litCount: number; // 0 when the fill is unknown
  tokensText: string; // "60k/200k", or "–/1.0M" when unknown
  percentText: string; // "(30%)", or "" when unknown
  costText: string; // "$0.42", or "" when unknown or zero
  tip: "" | "yellow" | "red";
  tipText: string;
  fiveText: string; // "23% ↻2h14m", or "" when there is no five-hour reading
  sevenText: string; // "41% ↻3d4h", or ""
};

// Module cache: what the store and the plugin settings resolve to.
let fallbackWindow = DEFAULT_WINDOW;
let fallbackSource: Source = "padrão";
let configured: { yellowPercent?: number; redPercent?: number } = {};
let thresholds: Thresholds = {
  yellowPercent: DEFAULT_YELLOW_PERCENT,
  redPercent: DEFAULT_RED_PERCENT,
};
let sources: { yellowPercent: Source; redPercent: Source } = {
  yellowPercent: "padrão",
  redPercent: "padrão",
};

const meter = atom({ plugin: "context-health-bar", key: "meter" } as const, null);

// Zone order left-to-right: RED, YELLOW, GREEN (fixed by position; lit state drains from the right)
export function zoneFor(index: number): Zone {
  if (index < 3) return "red";
  if (index < 6) return "yellow";
  return "green";
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return (tokens / 1000000).toFixed(1) + "M";
  } else if (tokens >= 1000) {
    return (tokens / 1000).toFixed(0) + "k";
  }
  return tokens.toString();
}

// "claude-sonnet-5-5" -> "Sonnet 5.5"; "claude-haiku-4-5-20251001" -> "Haiku 4.5";
// "claude-opus-5-5[1m]" -> "Opus 5.5"; "claude-foo-5" -> "Foo 5". Other ids: as before.
export function modelLabel(id: string): string {
  const raw = (id || "").replace(/\[.*\]$/, "");
  const m = /^claude-([a-z]+)((?:-\d{1,3}){0,2})/i.exec(raw);
  if (m) {
    const name = m[1] ?? "";
    const version = (m[2] ?? "").split("-").filter(Boolean).join(".");
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() + (version ? ` ${version}` : "");
  }
  const known = /(fable|opus|sonnet|haiku)/i.exec(id || "");
  const name = known?.[1] ?? (id || "?");
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

// Context fill as a whole percentage of the window (0-100), or undefined when unknown.
// The engine's own percent wins; otherwise tokens over the window (the fallback
// window until the real one is known).
export function contextPercent(m: Meter, fallback: number): number | undefined {
  const clamp = (n: number) => Math.min(Math.max(n, 0), 100);
  if (typeof m.percent === "number") return Math.round(clamp(m.percent));
  if (m.tokens === undefined) return undefined;
  const window = m.window > 0 ? m.window : fallback;
  return clamp(Math.round((m.tokens / window) * 100));
}

// Plain tip text for the fill percentage, or "" below the yellow threshold.
export function tipFor(percent: number, t: Thresholds): string {
  if (percent >= t.redPercent) return RED_TIP;
  if (percent >= t.yellowPercent) return YELLOW_TIP;
  return "";
}

// "$0.42" when the cost is known and above zero, "" otherwise.
export function formatCost(usd?: number): string {
  return typeof usd === "number" && Number.isFinite(usd) && usd > 0
    ? `$${usd.toFixed(2)}`
    : "";
}

// "3d4h" from one day up, "2h14m" from one hour up, "14m" below. Empty when past.
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "";
  if (ms >= DAY) return `${Math.floor(ms / DAY)}d${Math.floor((ms % DAY) / HOUR)}h`;
  if (ms >= HOUR) return `${Math.floor(ms / HOUR)}h${Math.floor((ms % HOUR) / MINUTE)}m`;
  return `${Math.max(1, Math.floor(ms / MINUTE))}m`;
}

function windowText(l: Limit, nowMs: number): string {
  let text = `${Math.round(l.percentUsed)}%`;
  if (l.resetsAt !== undefined) {
    const left = Date.parse(l.resetsAt) - nowMs;
    if (!Number.isNaN(left) && left > 0) text += ` ↻${formatCountdown(left)}`;
  }
  return text;
}

// Only five_hour and seven_day are shown; other kinds are ignored. No readings: empty strings.
export function buildLimitsText(
  limits: readonly Limit[],
  nowMs: number
): { five: string; seven: string } {
  const five = limits.find((l) => l.kind === "five_hour");
  const seven = limits.find((l) => l.kind === "seven_day");
  return {
    five: five ? windowText(five, nowMs) : "",
    seven: seven ? windowText(seven, nowMs) : "",
  };
}

// Plain data for the band: no ANSI, no colors except the zone of each segment.
export function buildDisplay(m: Meter, fallback: number, nowMs = 0): Display {
  const percent = contextPercent(m, fallback);
  const window = m.window > 0 ? m.window : fallback;
  const tip = percent === undefined ? "" : tipFor(percent, m.thresholds);
  const tipLevel: Display["tip"] =
    tip === "" ? "" : percent! >= m.thresholds.redPercent ? "red" : "yellow";
  const used = m.tokens === undefined ? "–" : formatTokens(m.tokens);
  const limits = buildLimitsText(m.rateLimits ?? [], nowMs);

  return {
    fiveText: limits.five,
    sevenText: limits.seven,
    label: modelLabel(m.model),
    zones: Array.from({ length: BARS }, (_, i) => zoneFor(i)),
    known: percent !== undefined,
    litCount: percent === undefined ? 0 : Math.round((1 - percent / 100) * BARS),
    tokensText: `${used}/${formatTokens(window)}`,
    percentText: percent === undefined ? "" : `(${percent}%)`,
    costText: formatCost(m.costUsd),
    tip: tipLevel,
    tipText: tip,
  };
}

// The usage-limit part of the row: "23% ↻2h14m · 41% ↻3d4h", or "".
export function limitsLabel(d: Display): string {
  return [d.fiveText, d.sevenText].filter(Boolean).join(" · ");
}

// Width of the row as drawn: limits, label, 9 segments, tokens, percent, cost, tip.
export function rowWidth(d: Display): number {
  const limits = limitsLabel(d);
  return (
    (limits ? limits.length + 3 : 0) +
    d.label.length + 3 + BARS +
    3 + d.tokensText.length +
    (d.percentText ? d.percentText.length + 1 : 0) +
    (d.costText ? d.costText.length + 3 : 0) +
    (d.tipText ? d.tipText.length + 2 : 0)
  );
}

// Narrow rows drop, in order: tip, cost, seven_day, five_hour. The bare bar is the caller's check.
export function fitDisplay(d: Display, columns: number): Display {
  const drops: Partial<Display>[] = [
    {},
    { tip: "", tipText: "" },
    { costText: "" },
    { sevenText: "" },
    { fiveText: "" },
  ];
  let out = d;
  for (const drop of drops) {
    out = { ...out, ...drop };
    if (rowWidth(out) <= columns) return out;
  }
  return out;
}

export type ConfigCommand =
  | { kind: "show" }
  | { kind: "reset" }
  | { kind: "set"; key: typeof YELLOW_KEY | typeof RED_KEY; value: number }
  | { kind: "error"; message: string };

// "red 40%", "RED 50" and "red 40" are the same. Anything that is not a plain
// 1-3 digit integer in 1..100 is an error (no "1e1", "0x20", "5.0").
export function parseConfigArgs(args: string): ConfigCommand {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { kind: "show" };

  const [head = "", arg] = parts;
  const cmd = head.toLowerCase();
  if (cmd === "reset" && parts.length === 1) return { kind: "reset" };

  const key =
    cmd === "yellow" ? YELLOW_KEY : cmd === "red" ? RED_KEY : undefined;
  if (!key || parts.length !== 2 || arg === undefined) {
    return { kind: "error", message: USAGE };
  }

  const raw = arg.replace(/%$/, "");
  const value = /^\d{1,3}$/.test(raw) ? Number(raw) : NaN;
  if (!(value >= 1 && value <= 100)) {
    return {
      kind: "error",
      message: `Valor inválido "${arg}": use um inteiro de 1 a 100. ${USAGE}`,
    };
  }
  return { kind: "set", key, value };
}

// Accepts a stored or configured percentage; anything else is ignored.
function asPercent(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 100
    ? v
    : undefined;
}

// Effective threshold = store value ?? userConfig option ?? default.
// Sets the module cache; callers read `thresholds` afterwards.
let thresholdsLoaded = false;
async function loadThresholds($: EngineInterface): Promise<void> {
  const pick = async (key: string, option: number | undefined, dflt: number) => {
    let stored: unknown;
    try {
      stored = await $.store.get(key);
    } catch {
      stored = undefined;
    }
    const fromStore = asPercent(stored);
    if (fromStore !== undefined) return { value: fromStore, source: "salvo" as Source };
    if (option !== undefined) return { value: option, source: "config do plugin" as Source };
    return { value: dflt, source: "padrão" as Source };
  };

  const y = await pick(YELLOW_KEY, configured.yellowPercent, DEFAULT_YELLOW_PERCENT);
  const r = await pick(RED_KEY, configured.redPercent, DEFAULT_RED_PERCENT);
  thresholds = { yellowPercent: y.value, redPercent: r.value };
  sources = { yellowPercent: y.source, redPercent: r.source };
  thresholdsLoaded = true;
}

// Writes the band's data. The band re-renders from the atom.
async function setMeter($: EngineInterface, change: (m: Meter) => Meter): Promise<void> {
  await update($, meter, (prev) =>
    change(prev ?? { model: "unknown", window: 0, thresholds })
  );
}

function describeConfig(): string {
  return [
    "Context health bar",
    `Amarelo: ${thresholds.yellowPercent}% (${sources.yellowPercent})`,
    `Vermelho: ${thresholds.redPercent}% (${sources.redPercent})`,
    `Janela de fallback: ${formatTokens(fallbackWindow)} tokens (${fallbackSource})`,
    USAGE,
  ].join("\n");
}

async function runConfig($: EngineInterface, args: string): Promise<string> {
  const cmd = parseConfigArgs(args);
  if (cmd.kind === "error") return cmd.message;
  if (!thresholdsLoaded) await loadThresholds($); // hot reload: no session.start ran

  if (cmd.kind === "show") {
    await loadThresholds($);
    await setMeter($, (m) => ({ ...m, thresholds }));
    return describeConfig();
  }

  if (cmd.kind === "reset") {
    await $.store.delete(YELLOW_KEY);
    await $.store.delete(RED_KEY);
  } else {
    const next = { ...thresholds, [cmd.key]: cmd.value };
    if (next.yellowPercent >= next.redPercent) {
      return `Inválido: amarelo (${next.yellowPercent}%) precisa ser menor que vermelho (${next.redPercent}%).`;
    }
    await $.store.set(cmd.key, cmd.value);
  }

  await loadThresholds($);
  await setMeter($, (m) => ({ ...m, thresholds }));
  if (cmd.kind === "reset") {
    return "Limites salvos removidos; valores do plugin e padrões voltam a valer.";
  }
  const label = cmd.key === YELLOW_KEY ? "Amarelo" : "Vermelho";
  return `${label} definido em ${cmd.value}% (salvo).`;
}

// Re-registering replaces the command, so this is safe to call again after /clear.
async function registerCommand($: EngineInterface): Promise<void> {
  try {
    await $.command.register({
      name: "context-config",
      description: "Configura os limites amarelo/vermelho da context health bar",
      argumentHint: "[yellow <n> | red <n> | reset]",
    });
  } catch {
    // the command stays unregistered; the band still works
  }
}

const ZONE_COLOR = { red: "error", yellow: "warning", green: "success" } as const;

// Countdowns go stale between turns: bump the atom every minute so the band redraws.
// Timers do not survive a reload, so this runs again from the next start or measure.
let refreshStarted = false;
function startRefresh($: EngineInterface): void {
  if (refreshStarted) return;
  refreshStarted = true;
  $.clock.every(REFRESH_MS, () => {
    stampNow($).catch(() => {});
  });
}

// The render never calls the host: it draws from the time stored here.
async function stampNow($: EngineInterface): Promise<void> {
  const nowMs = await $.clock.now();
  await update($, meter, (m) => (m ? { ...m, nowMs } : m));
}

export const register: Register = (on, options) => {
  configured = {
    yellowPercent: asPercent(options.yellowPercent),
    redPercent: asPercent(options.redPercent),
  };
  fallbackWindow =
    typeof options.maxTokens === "number" && options.maxTokens > 0
      ? options.maxTokens
      : DEFAULT_WINDOW;
  fallbackSource = typeof options.maxTokens === "number" ? "config do plugin" : "padrão";

  on("session.start", async ($, e, next) => {
    try {
      $.ui.status(undefined); // clears the line older versions drew
    } catch {
      // nothing to clear
    }

    let model = "unknown";
    try {
      model = await $.session.model();
    } catch {
      // keep "unknown"
    }
    try {
      await loadThresholds($);
    } catch {
      // keep the defaults
    }
    let tokens: number | undefined;
    let window = 0;
    let percent: number | undefined;
    let costUsd: number | undefined;
    let rateLimits: Limit[] | undefined;
    try {
      const usage = await $.session.usage();
      tokens = usage?.context?.tokens;
      window = usage?.context?.window ?? 0;
      percent = usage?.context?.percent;
      costUsd = usage?.cost?.usd;
      rateLimits = usage?.rateLimits;
    } catch {
      // no reading yet: the band shows unknown until session.measure
    }

    try {
      await update($, meter, () => ({ model, tokens, window, percent, costUsd, thresholds, rateLimits }));
      await stampNow($).catch(() => {});
      startRefresh($);
    } catch {
      // the band stays hidden until the next update
    }
    await registerCommand($);
    return next(e);
  });

  // Observe-only: the engine measures the context and cost; we only store them.
  on("session.measure", async ($, e, next) => {
    try {
      if (
        e.changed.includes("context") ||
        e.changed.includes("cost") ||
        e.changed.includes("rateLimits")
      ) {
        if (!thresholdsLoaded) {
          // hot reload: the session.start that loads thresholds did not run here
          await loadThresholds($);
          try {
            $.ui.status(undefined); // clears a yellow line from the older version
          } catch {
            // nothing to clear
          }
        }
        let model: string | undefined;
        if (e.changed.includes("context")) {
          try {
            model = await $.session.model();
          } catch {
            // keep the last known label
          }
        }
        await setMeter($, (m) => ({
          ...m,
          model: model ?? m.model,
          tokens: typeof e.context.tokens === "number" ? e.context.tokens : undefined,
          window: e.context.window > 0 ? e.context.window : m.window,
          percent:
            typeof e.context.percent === "number" ? Math.round(e.context.percent) : undefined,
          costUsd: e.cost?.usd ?? m.costUsd,
          rateLimits: e.rateLimits,
        }));
        await stampNow($).catch(() => {});
        startRefresh($);
      }
    } catch {
      // a failed write keeps the last drawn band; the chain must still continue
    }
    return next(e);
  });

  on("command.run", { command: "context-config" }, async ($, e) => {
    try {
      return { text: await runConfig($, e.args ?? "") };
    } catch (err) {
      return { text: `context-config falhou: ${String(err)}` };
    }
  });

  // /clear starts a new session: counters go back to unknown; the command is re-registered.
  on("session.end", async ($, e, next) => {
    try {
      if (e.reason === "clear") {
        await setMeter($, (m) => ({
          model: m.model,
          window: m.window, // the model's window does not change on /clear
          thresholds: m.thresholds,
        }));
        await registerCommand($);
      }
    } catch {
      // keep the state as it was; the chain must still continue
    }
    return next(e);
  });

  // The prompt footer: the engine's own hint line (its live pills stay), then the bar
  // in the bottom-right corner, on the terminal's last line.
  on("ui.render", { component: "PromptHint" }, async ($, e, next) => {
    const m = await read($, meter);
    if (m === null) return next(e);

    const engine = await next(e);
    try {
      // no stored time yet: countdowns are left out rather than guessed
      const full = buildDisplay(m, fallbackWindow, m.nowMs ?? Infinity);
      const available = e.viewport ? e.viewport.columns - EDGE_WIDTH : Infinity;
      const bare = { ...full, tip: "" as const, tipText: "", costText: "", fiveText: "", sevenText: "" };
      if (rowWidth(bare) > available) return engine;

      const { Box, Text } = $.ui.resolve(e);
      const d = fitDisplay(full, available);
      const unlit = d.known ? "▯" : "·";
      const segments = d.zones.map((zone, i) =>
        i < d.litCount ? (
          <Text key={`seg${i}`} color={ZONE_COLOR[zone]}>▮</Text>
        ) : (
          <Text key={`seg${i}`} dimColor>{unlit}</Text>
        )
      );

      return (
        // Two lines: the engine's own hint line, then the bar flush right on the last line.
        // The engine refuses its own node under a Box with a size, so no width anywhere here:
        // the flexGrow spacer takes the free room and pushes the bar right.
        <Box key="row" flexDirection="column">
          {engine}
          <Box key="bar" flexDirection="row">
            <Box key="spacer" flexGrow={1} />
            {limitsLabel(d) ? <Text key="limits" dimColor>{`${limitsLabel(d)} │ `}</Text> : null}
            <Text key="label" dimColor>{d.label} │ </Text>
            {segments}
            <Text key="tokens" dimColor>
              {` │ ${d.tokensText}${d.percentText ? ` ${d.percentText}` : ""}`}
            </Text>
            {d.costText ? <Text key="cost" dimColor>{` · ${d.costText}`}</Text> : null}
            {d.tip ? <Text key="tip" dimColor>{`  ${d.tipText}`}</Text> : null}
          </Box>
        </Box>
      );
    } catch {
      return engine; // a broken bar never hides the engine's own line
    }
  });
};
