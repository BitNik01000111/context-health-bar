import { test, expect } from "claude-code/testing";

// Mirrors the draining-battery logic in register.tsx:
// litCount = round((1 - consumedRatio) * 9), lit segments are the first litCount positions.
const TOTAL_BARS = 9;

function renderPlain(consumedRatio: number): string {
  const remaining = Math.min(Math.max(1 - consumedRatio, 0), 1);
  const litCount = Math.round(remaining * TOTAL_BARS);
  let bar = "";
  for (let i = 0; i < TOTAL_BARS; i++) {
    bar += i < litCount ? "▮" : "▯";
  }
  return bar;
}

test("health bar drains from the right as tokens are consumed", async ($, on) => {
  // 0% consumed: fully lit
  expect(renderPlain(0)).toBe("▮▮▮▮▮▮▮▮▮");

  // 50% consumed: round(0.5 * 9) = 5 lit, starting from the left
  const half = renderPlain(0.5);
  expect(half).toBe("▮▮▮▮▮▯▯▯▯");
  expect(half).toHaveLength(TOTAL_BARS);

  // 100% consumed: fully empty
  expect(renderPlain(1)).toBe("▯▯▯▯▯▯▯▯▯");
});

test("token formatting works", async ($, on) => {
  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000000) {
      return (tokens / 1000000).toFixed(1) + "M";
    } else if (tokens >= 1000) {
      return (tokens / 1000).toFixed(0) + "k";
    }
    return tokens.toString();
  };

  expect(formatTokens(50000)).toBe("50k");
  expect(formatTokens(150000)).toBe("150k");
  expect(formatTokens(1500000)).toBe("1.5M");
  expect(formatTokens(500)).toBe("500");
});
