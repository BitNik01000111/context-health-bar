import { Register } from "claude-code";

// ANSI color codes for terminal
const ANSI = {
  GREEN: "\x1b[32m",
  YELLOW: "\x1b[33m",
  RED: "\x1b[31m",
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
};

// Half-size bar: 3 segments per color zone, 9 total (was 6/18)
const BARS_PER_COLOR = 3;
const TOKENS_PER_BAR = 20000;
const TOTAL_TOKENS = BARS_PER_COLOR * 3 * TOKENS_PER_BAR; // 180k, same default range

// Zone order left-to-right: RED, YELLOW, GREEN (fills left-to-right as tokens are consumed)
function zoneColorFor(index: number): string {
  if (index < BARS_PER_COLOR) return ANSI.RED;
  if (index < BARS_PER_COLOR * 2) return ANSI.YELLOW;
  return ANSI.GREEN;
}

// Session-scoped state
let sessionState = {
  currentTokens: 0,
  maxTokens: TOTAL_TOKENS,
  currentModel: "unknown",
  sessionStartTokens: 0,
};

function renderHealthBar(consumed: number, max: number): string {
  const totalBars = BARS_PER_COLOR * 3;
  const ratio = Math.min(consumed / max, 1);
  const filledBars = Math.round(ratio * totalBars);

  let bar = "";
  for (let i = 0; i < totalBars; i++) {
    if (i < filledBars) {
      bar += zoneColorFor(i) + "▮" + ANSI.RESET;
    } else {
      bar += "▯";
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

function updateStatusBar($: any): void {
  const bar = renderHealthBar(sessionState.currentTokens, sessionState.maxTokens);
  const consumed = formatTokens(sessionState.currentTokens);
  const max = formatTokens(sessionState.maxTokens);
  const percentage = Math.round(
    (sessionState.currentTokens / sessionState.maxTokens) * 100
  );

  const statusText = `${bar} ${consumed}/${max} (${percentage}%)`;
  $.ui.status(statusText);
}

export const register: Register = (on, options) => {
  on("session.start", async ($) => {
    const currentModel = $.session.model();

    sessionState = {
      currentTokens: 0,
      maxTokens: options.maxTokens || TOTAL_TOKENS,
      currentModel: currentModel,
      sessionStartTokens: 0,
    };

    updateStatusBar($);

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
    // Stream the model output
    for await (const chunk of next(e)) {
      yield chunk;

      // Try to count tokens from the step
      if (e.messages && e.messages.length > 0) {
        try {
          const counted = await $.model.countTokens({
            model: sessionState.currentModel,
            messages: e.messages,
          });

          sessionState.currentTokens = counted.tokens;
          updateStatusBar($);
        } catch (err) {
          // Silently fail if counting doesn't work
        }
      }
    }
  });

  on("session.append", async ($, e, next) => {
    await next(e);

    // After each message is appended, update token count
    try {
      const messages = $.session.messages();

      const counted = await $.model.countTokens({
        model: sessionState.currentModel,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.text || "",
        })),
      });

      sessionState.currentTokens = counted.tokens;
      updateStatusBar($);
    } catch (err) {
      // Silently fail
    }
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
    }
    return next(e);
  });
};
