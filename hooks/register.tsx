import { Register } from "claude-code";

// Colors for the 3 zones: red (heavy), yellow (medium), green (light)
const COLORS = {
  red: "#ef4444",
  yellow: "#eab308",
  green: "#22c55e",
};

const BARS_PER_COLOR = 6;
const TOKENS_PER_BAR = 10000;
const TOTAL_TOKENS = BARS_PER_COLOR * 3 * TOKENS_PER_BAR; // 180k

// Session-scoped state
let sessionState = {
  currentTokens: 0,
  maxTokens: TOTAL_TOKENS,
  currentModel: "unknown",
  sessionStartTokens: 0,
};

function renderHealthBar(consumed: number, max: number): string {
  const ratio = Math.min(consumed / max, 1);
  const filledBars = Math.round(ratio * (BARS_PER_COLOR * 3));

  let bar = "";
  for (let i = 0; i < BARS_PER_COLOR * 3; i++) {
    if (i < filledBars) {
      // Filled bars: red → yellow → green (left to right)
      if (i < BARS_PER_COLOR) {
        bar += "█";
      } else if (i < BARS_PER_COLOR * 2) {
        bar += "█";
      } else {
        bar += "█";
      }
    } else {
      bar += "░";
    }
  }

  return bar;
}

function getBarColor(consumed: number, max: number): string {
  const ratio = Math.min(consumed / max, 1);
  const percentIntoBar = (ratio * (BARS_PER_COLOR * 3)) % 1;

  // Determine which color zone we're in
  const barIndex = Math.floor(ratio * (BARS_PER_COLOR * 3));

  if (barIndex < BARS_PER_COLOR) {
    return COLORS.green;
  } else if (barIndex < BARS_PER_COLOR * 2) {
    return COLORS.yellow;
  } else {
    return COLORS.red;
  }
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
