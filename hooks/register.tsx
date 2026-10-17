import { Register } from "claude-code";

// ANSI codes for terminal
const ANSI = {
  GREEN: "\x1b[32m",
  YELLOW: "\x1b[33m",
  RED: "\x1b[31m",
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  DIM: "\x1b[2m",
  DIM_OFF: "\x1b[22m",
};

// Half-size bar: 3 segments per color zone, 9 total (was 6/18)
const BARS_PER_COLOR = 3;
const TOKENS_PER_BAR = 20000;
const TOTAL_TOKENS = BARS_PER_COLOR * 3 * TOKENS_PER_BAR; // 180k fallback until the real window is known
const DEFAULT_RED_THRESHOLD = 80000;
const TIP = " → /passagem e /clear";

// Zone order left-to-right: RED, YELLOW, GREEN (fixed by position; lit state drains from the right)
function zoneColorFor(index: number): string {
  if (index < BARS_PER_COLOR) return ANSI.RED;
  if (index < BARS_PER_COLOR * 2) return ANSI.YELLOW;
  return ANSI.GREEN;
}

// Session-scoped state
let sessionState = {
  currentTokens: 0,
  currentPercent: 0,
  windowTokens: 0, // real context window from $.session.usage(); 0 = not known yet
  fallbackMaxTokens: TOTAL_TOKENS,
  maxTokens: TOTAL_TOKENS,
  currentModel: "unknown",
  sessionStartTokens: 0,
};

function resolveMaxTokens(): void {
  sessionState.maxTokens =
    sessionState.windowTokens > 0
      ? sessionState.windowTokens
      : sessionState.fallbackMaxTokens;
}

// Draining battery: 0% consumed = all lit, 100% consumed = all empty.
// Lit segments are the first litCount positions (left), drained from the right.
function renderHealthBar(consumedRatio: number): string {
  const totalBars = BARS_PER_COLOR * 3;
  const remainingRatio = Math.min(Math.max(1 - consumedRatio, 0), 1);
  const litCount = Math.round(remainingRatio * totalBars);

  let bar = "";
  for (let i = 0; i < totalBars; i++) {
    if (i < litCount) {
      bar += zoneColorFor(i) + "▮" + ANSI.RESET;
    } else {
      bar += ANSI.DIM + "▯" + ANSI.DIM_OFF;
    }
  }

  return "|" + bar + "|";
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return (tokens / 1000000).toFixed(1) + "M";
  } else if (tokens >= 1000) {
    return (tokens / 1000).toFixed(0) + "k";
  }
  return tokens.toString();
}

// Pulls live numbers from the free native API. Keeps last known values on failure.
async function refreshUsage($: any): Promise<void> {
  try {
    const usage = await $.session.usage();
    const ctx = usage?.context;
    if (!ctx) return;

    if (typeof ctx.tokens === "number") {
      sessionState.currentTokens = ctx.tokens;
    }
    if (typeof ctx.window === "number" && ctx.window > 0) {
      sessionState.windowTokens = ctx.window;
    }
    resolveMaxTokens();

    if (typeof ctx.percent === "number") {
      sessionState.currentPercent = ctx.percent;
    } else {
      sessionState.currentPercent =
        (sessionState.currentTokens / sessionState.maxTokens) * 100;
    }
  } catch (err) {
    // Silently keep previous values
  }
}

function updateStatusBar($: any, redThreshold: number): void {
  const ratio = Math.min(Math.max(sessionState.currentPercent / 100, 0), 1);
  const bar = renderHealthBar(ratio);
  const consumed = formatTokens(sessionState.currentTokens);
  const max = formatTokens(sessionState.maxTokens);
  const percentage = Math.round(ratio * 100);

  const tip =
    sessionState.currentTokens >= redThreshold
      ? ANSI.RED + TIP + ANSI.RESET
      : "";

  const statusText = `${bar} ${ANSI.DIM}${consumed}/${max} (${percentage}%)${ANSI.DIM_OFF}${tip}`;
  $.ui.status(statusText);
}

export const register: Register = (on, options) => {
  const redThreshold = options.redThreshold ?? DEFAULT_RED_THRESHOLD;

  on("session.start", async ($) => {
    const currentModel = $.session.model();
    const fallback = options.maxTokens || TOTAL_TOKENS;

    sessionState = {
      currentTokens: 0,
      currentPercent: 0,
      windowTokens: 0,
      fallbackMaxTokens: fallback,
      maxTokens: fallback,
      currentModel: currentModel,
      sessionStartTokens: 0,
    };

    updateStatusBar($, redThreshold);

    // Register config command
    $.command.register({
      name: "context-config",
      description:
        "Configure context health bar thresholds and max tokens per model",
    });

    // Notify about bar loading
    if (options.autoDetectModel) {
      $.ui.toast(`Context Health Bar: ${currentModel} (${formatTokens(sessionState.maxTokens)} max)`);
    }
  });

  on("turn.step", async function* ($, e, next) {
    // Stream the model output, refreshing the bar live while it streams
    for await (const chunk of next(e)) {
      yield chunk;

      await refreshUsage($);
      updateStatusBar($, redThreshold);
    }
  });

  on("session.append", async ($, e, next) => {
    await next(e);

    // Safety net: refresh after each message is appended
    await refreshUsage($);
    updateStatusBar($, redThreshold);
  });

  on("command.run", async ($, e, next) => {
    if (e.name === "context-config") {
      $.ui.toast(
        `Config for ${sessionState.currentModel}: ${formatTokens(sessionState.maxTokens)} max tokens`
      );

      // Parse potential arguments for manual/auto mode
      // For now, toggle between auto and manual detection
      return { text: "Context config updated" };
    }

    return next(e);
  });

  // Reset on clear
  on("session.end", async ($, e, next) => {
    if (e.reason === "clear") {
      sessionState.currentTokens = 0;
      sessionState.currentPercent = 0;
      sessionState.windowTokens = 0;
      resolveMaxTokens();
    }
    return next(e);
  });
};
