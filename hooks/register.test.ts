import { test, expect, mock, type Engine } from "claude-code/testing";
import type { On } from "claude-code";
import {
  buildDisplay,
  contextPercent,
  tipFor,
  formatTokens,
  modelLabel,
  parseConfigArgs,
  zoneFor,
  fitDisplay,
  rowWidth,
  formatCountdown,
  buildLimitsText,
  limitsLabel,
} from "./register";

const T = { yellowPercent: 30, redPercent: 40 };
const YELLOW = "→ considere /passagem";
const RED = "→ /passagem e /clear";
const FALLBACK = 180000;

// ---- a) pure helpers: the band's data, no ANSI ----

test("buildDisplay: known fill lights the segments and shows tokens, percent and tip", () => {
  const d = buildDisplay({ model: "claude-haiku-5-5", tokens: 60000, window: 200000, thresholds: T }, FALLBACK);
  expect(d.label).toBe("Haiku 5.5");
  expect(d.litCount).toBe(6); // 70% remaining of 9 segments
  expect(d.tokensText).toBe("60k/200k");
  expect(d.percentText).toBe("(30%)");
  expect(d.costText).toBe("");
  expect(d.tip).toBe("yellow");
  expect(d.tipText).toBe(YELLOW);
});

test("buildDisplay: unknown fill shows a dash, no percent, no tip, no lit segments", () => {
  const d = buildDisplay({ model: "claude-sonnet-4-6", window: 0, thresholds: T }, 1000000);
  expect(d.known).toBe(false);
  expect(d.litCount).toBe(0);
  expect(d.tokensText).toBe("–/1.0M");
  expect(d.percentText).toBe("");
  expect(d.tip).toBe("");
  expect(d.tipText).toBe("");
});

test("buildDisplay: full and empty bars at 0% and 100%", () => {
  const base = { model: "m", window: 200000, thresholds: T };
  expect(buildDisplay({ ...base, tokens: 0 }, FALLBACK).litCount).toBe(9);
  expect(buildDisplay({ ...base, tokens: 200000 }, FALLBACK).litCount).toBe(0);
});

test("buildDisplay: zones are red, yellow, green left to right", () => {
  const zones = buildDisplay({ model: "m", window: 1, thresholds: T }, FALLBACK).zones;
  expect(zones).toEqual(["red", "red", "red", "yellow", "yellow", "yellow", "green", "green", "green"]);
  expect(zoneFor(4)).toBe("yellow");
});

test("buildDisplay: red tip at the red threshold, cost shown when above zero", () => {
  const d = buildDisplay({ model: "m", tokens: 90000, window: 200000, costUsd: 0.4215, thresholds: T }, FALLBACK);
  expect(d.tip).toBe("red");
  expect(d.tipText).toBe(RED);
  expect(d.costText).toBe("$0.42");
  expect(buildDisplay({ model: "m", tokens: 1, window: 200000, costUsd: 0, thresholds: T }, FALLBACK).costText).toBe("");
});

test("percent: rounded from tokens, engine percent wins, unknown stays unknown", () => {
  expect(contextPercent({ model: "m", tokens: 66667, window: 200000, thresholds: T }, FALLBACK)).toBe(33);
  expect(contextPercent({ model: "m", tokens: 90000, window: 0, thresholds: T }, 180000)).toBe(50);
  expect(contextPercent({ model: "m", tokens: 1, window: 200000, percent: 70, thresholds: T }, FALLBACK)).toBe(70);
  expect(contextPercent({ model: "m", window: 200000, thresholds: T }, FALLBACK)).toBeUndefined();
});

test("fitDisplay drops the tip first, then the cost, on narrow bodies", () => {
  const d = buildDisplay({ model: "claude-sonnet-4-6", tokens: 90000, window: 200000, costUsd: 0.42, thresholds: T }, FALLBACK);
  expect(fitDisplay(d, 500)).toEqual(d);
  const noTip = fitDisplay(d, rowWidth(d) - 1);
  expect(noTip.tipText).toBe("");
  expect(noTip.costText).toBe("$0.42");
  const noCost = fitDisplay(d, rowWidth(d) - d.tipText.length - 2 - 1);
  expect(noCost.tipText).toBe("");
  expect(noCost.costText).toBe("");
});

test("percent from the engine is rounded", () => {
  expect(contextPercent({ model: "m", tokens: 1, window: 1, percent: 33.6, thresholds: T }, FALLBACK)).toBe(34);
});

test("tips at the yellow and red thresholds", () => {
  expect(tipFor(29, T)).toBe("");
  expect(tipFor(30, T)).toBe(YELLOW);
  expect(tipFor(39, T)).toBe(YELLOW);
  expect(tipFor(40, T)).toBe(RED);
});

test("token and model formatting", () => {
  expect(formatTokens(50000)).toBe("50k");
  expect(formatTokens(1500000)).toBe("1.5M");
  expect(formatTokens(500)).toBe("500");
  expect(modelLabel("claude-sonnet-5-5")).toBe("Sonnet 5.5");
  expect(modelLabel("claude-opus-5-5")).toBe("Opus 5.5");
  expect(modelLabel("claude-fable-5-1")).toBe("Fable 5.1");
  expect(modelLabel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
  expect(modelLabel("claude-opus-5-5[1m]")).toBe("Opus 5.5");
  expect(modelLabel("claude-foo-5")).toBe("Foo 5");
  expect(modelLabel("gpt-4")).toBe("Gpt-4");
  expect(modelLabel("")).toBe("?");
});

test("config args parse", () => {
  expect(parseConfigArgs("")).toEqual({ kind: "show" });
  expect(parseConfigArgs("  reset  ")).toEqual({ kind: "reset" });
  expect(parseConfigArgs("red 50")).toEqual({ kind: "set", key: "redPercent", value: 50 });
  expect(parseConfigArgs("red 40%")).toEqual({ kind: "set", key: "redPercent", value: 40 });
  expect(parseConfigArgs("RED 50")).toEqual({ kind: "set", key: "redPercent", value: 50 });
  expect(parseConfigArgs("yellow 25")).toEqual({ kind: "set", key: "yellowPercent", value: 25 });
  for (const bad of ["red 0", "red 101", "red abc", "red 1e1", "red 0x20", "red 5.0", "red 40%%", "red %", "green 5"]) {
    expect(parseConfigArgs(bad).kind).toBe("error");
  }
});

const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;
const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);
const iso = (ms: number) => new Date(NOW + ms).toISOString();

test("countdown: days and hours, hours and minutes, minutes, nothing when past", () => {
  expect(formatCountdown(3 * D + 4 * H)).toBe("3d4h");
  expect(formatCountdown(2 * H + 14 * MIN + 30_000)).toBe("2h14m");
  expect(formatCountdown(14 * MIN)).toBe("14m");
  expect(formatCountdown(10_000)).toBe("1m");
  expect(formatCountdown(0)).toBe("");
  expect(formatCountdown(-5)).toBe("");
});

test("limits text: five_hour and seven_day only, countdown omitted when past or missing", () => {
  const limits = [
    { kind: "five_hour", percentUsed: 23.4, resetsAt: iso(2 * H + 14 * MIN) },
    { kind: "seven_day", percentUsed: 41, resetsAt: iso(3 * D + 4 * H) },
    { kind: "spend_limit", percentUsed: 99 },
  ];
  expect(buildLimitsText(limits, NOW)).toEqual({ five: "5h 23% ↻2h14m", seven: "7d 41% ↻3d4h" });
  expect(buildLimitsText([{ kind: "five_hour", percentUsed: 7 }], NOW)).toEqual({ five: "5h 7%", seven: "" });
  expect(buildLimitsText([{ kind: "five_hour", percentUsed: 7, resetsAt: iso(-MIN) }], NOW).five).toBe("5h 7%");
  expect(buildLimitsText([], NOW)).toEqual({ five: "", seven: "" });
});

test("limits sit before the label; the drop order is tip, cost, seven, five", () => {
  const d = buildDisplay(
    {
      model: "claude-sonnet-5-5",
      tokens: 90000,
      window: 200000,
      costUsd: 0.42,
      thresholds: T,
      rateLimits: [
        { kind: "five_hour", percentUsed: 23, resetsAt: iso(2 * H + 14 * MIN) },
        { kind: "seven_day", percentUsed: 41, resetsAt: iso(3 * D + 4 * H) },
      ],
    },
    FALLBACK,
    NOW
  );
  expect(limitsLabel(d)).toBe("5h 23% ↻2h14m · 7d 41% ↻3d4h");
  const full = rowWidth(d);
  expect(fitDisplay(d, full).tipText).not.toBe("");
  expect(fitDisplay(d, full - 1).tipText).toBe("");
  expect(fitDisplay(d, full - 1).costText).toBe("$0.42");
  const noCost = fitDisplay(d, rowWidth({ ...d, tipText: "", tip: "", costText: "" }) + 1);
  expect(noCost.costText).toBe("");
  expect(noCost.sevenText).toBe("7d 41% ↻3d4h");
  const noSeven = fitDisplay(d, rowWidth({ ...d, tipText: "", tip: "", costText: "", sevenText: "" }));
  expect(noSeven.sevenText).toBe("");
  expect(noSeven.fiveText).toBe("5h 23% ↻2h14m");
  const noFive = fitDisplay(d, rowWidth({ ...d, tipText: "", tip: "", costText: "", sevenText: "", fiveText: "" }));
  expect(noFive.fiveText).toBe("");
});

// ---- b) engine: mount the band on each surface and read what it draws ----

const ORIGIN = { kind: "composer" as const };
const PRESENTATION = { isFullscreen: false, columns: 80 };
const SURFACES = ["terminal", "desktop"] as const;

const cfg = ($: Engine, args?: string) =>
  $.command.run({ command: "context-config", args: args ?? "", origin: ORIGIN, presentation: PRESENTATION });

// Bottom hooks under the plugin: the model, and the store in memory.
function beneath(on: On) {
  mock.store(on);
  const clock = mock.clock(on, { now: NOW });
  on("session.model", async () => ({ value: "claude-sonnet-4-6" }) as never);
  on("session.measure", (_$, e) => ({ changed: e.changed }));
  on("session.end", (_$, e) => ({ sessionId: "test" }) as never);
  // the engine's own hint line, drawn below the bar
  on("ui.render", () => ({ type: "Text", props: { dimColor: true }, children: [HINT] }) as never);
  return clock;
}

const HINT = "⏵⏵ auto mode on (shift+tab to cycle)";

const measure = ($: Engine, tokens: number | undefined, cost?: number) =>
  $.session.measure({
    context: tokens === undefined ? { window: 200000 } : { tokens, window: 200000 },
    rateLimits: [],
    ...(cost === undefined ? {} : { cost: { usd: cost } }),
    changed: cost === undefined ? ["context"] : ["context", "cost"],
  });

// The bar row (keyed "bar") and the whole PromptHint tree, as the surface draws them.
async function band(
  $: Engine,
  surface: (typeof SURFACES)[number],
  columns = 240
) {
  const m = await $.ui.mount({
    plugin: "context-health-bar",
    surface,
    component: "PromptHint",
    props: { isDraft: false, isWorking: false, hint: HINT } as never,
    viewport: { columns, rows: 24 } as never,
  });
  const row = (await m.findAll({ type: "Box" })).find((b) => b.key === "row")?.text ?? "";
  const root = (await m.find({ type: "Box" }))?.text ?? (await m.find({ type: "Text" }))?.text ?? "";
  const texts = await m.findAll({ type: "Text" });
  return { bar: row.replace(HINT, "").trim(), root, texts };
}

for (const surface of SURFACES) {
  test(`band on ${surface}: values, unknown, /context-config, clear`, async ($, on) => {
    beneath(on);

    await measure($, 60000);
    expect((await band($, surface)).bar).toBe("Sonnet 4.6 │ ▮▮▮▮▮▮▯▯▯ │ 60k/200k (30%)  → considere /passagem");

    await measure($, undefined);
    const unknown = (await band($, surface)).bar;
    expect(unknown).toContain("–/200k");
    expect(unknown).toContain("·········");
    expect(unknown).not.toContain("▯");
    expect(unknown).not.toContain("%");
    expect(unknown).not.toContain("→");

    await measure($, 90000); // 45%: red tip
    expect((await band($, surface)).bar.endsWith(RED)).toBe(true);

    const r = await cfg($, "red 50");
    expect(r.text).toContain("50%");
    expect((await band($, surface)).bar.endsWith(YELLOW)).toBe(true);

    await measure($, 90000, 0.42);
    expect((await band($, surface)).bar).toContain("· $0.42");

    await $.session.end({ reason: "clear" } as never);
    const cleared = (await band($, surface)).bar;
    expect(cleared).toContain("–/200k");
    expect(cleared).not.toContain("$");
    expect(cleared).not.toContain("→");
  });

  test(`band on ${surface}: bar row sits above the engine's hint line`, async ($, on) => {
    beneath(on);
    await measure($, 60000);
    const { root } = await band($, surface);
    expect(root.startsWith(HINT)).toBe(true);
    expect(root).toContain("Sonnet 4.6 │ ▮");

  });

  test(`band on ${surface}: only the lit segments are colored; the rest is dim`, async ($, on) => {
    beneath(on);
    await measure($, 60000); // 30%: six lit, three unlit
    const { texts } = await band($, surface);
    const segments = texts.filter((t) => t.text === "▮" || t.text === "▯");
    const lit = segments.filter((t) => t.text === "▮");
    expect(lit).toHaveLength(6);
    expect(segments).toHaveLength(9);
    for (const t of lit) {
      expect(["error", "warning", "success"]).toContain(t.props.color as string);
      expect(t.props.dimColor).toBeUndefined();
    }
    for (const t of segments.filter((t) => t.text === "▯")) {
      expect(t.props.dimColor).toBe(true);
      expect(t.props.color).toBeUndefined();
    }
    // every other Text is dim with no color: labels, tips, and the engine's hint line
    for (const t of texts.filter((t) => t.text !== "▮" && t.text !== "▯")) {
      expect(t.props.color).toBeUndefined();
      expect(t.props.dimColor).toBe(true);
    }
  });

  test(`band on ${surface}: narrow width drops the tip, then the cost, then the bar`, async ($, on) => {
    beneath(on);
    await measure($, 90000, 0.42); // 45%: red tip and cost
    // the bar has the last line to itself: columns = its room + 2 free columns at each edge
    const at = (room: number) => room + 4;
    const wide = (await band($, surface, at(200))).bar;
    expect(wide).toContain("$0.42");
    expect(wide).toContain("→");

    const medium = (await band($, surface, at(60))).bar;
    expect(medium).toContain("$0.42");
    expect(medium).not.toContain("→");

    const narrow = (await band($, surface, at(45))).bar;
    expect(narrow).not.toContain("$");
    expect(narrow).not.toContain("→");

    const none = await band($, surface, at(10));
    expect(none.root).toBe(HINT);
    expect(none.root).not.toContain("│");
  });
}

test("usage windows read from session.measure, redrawn each minute", async ($, on) => {
  const clock = beneath(on);
  await $.session.measure({
    context: { tokens: 60000, window: 200000 },
    rateLimits: [
      { kind: "five_hour", percentUsed: 23.4, resetsAt: iso(2 * H + 14 * MIN) },
      { kind: "seven_day", percentUsed: 41, resetsAt: iso(3 * D + 4 * H) },
    ],
    changed: ["context", "rateLimits"],
  });
  const first = (await band($, "terminal")).bar;
  expect(first).toContain("5h 23% ↻2h14m · 7d 41% ↻3d4h │ Sonnet 4.6 │");

  await clock.advance(H);
  const later = (await band($, "terminal")).bar;
  expect(later).toContain("5h 23% ↻1h14m · 7d 41% ↻3d3h");
});

test("empty rateLimits draw no windows", async ($, on) => {
  beneath(on);
  await $.session.measure({
    context: { tokens: 60000, window: 200000 },
    rateLimits: [],
    changed: ["context", "rateLimits"],
  });
  const bar = (await band($, "desktop")).bar;
  expect(bar.startsWith("Sonnet 4.6 │ ▮")).toBe(true);
  expect(bar).not.toContain("5h");
  expect(bar).not.toContain("7d");
});

