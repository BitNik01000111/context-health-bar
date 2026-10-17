export type Thresholds = { yellowPercent: number; redPercent: number };

// What the band above the prompt draws. `null` until the first session.start.
// One usage-limit window as session.measure reports it (kind: five_hour, seven_day, ...).
export type Limit = { kind: string; percentUsed: number; resetsAt?: string };

export type Meter = {
  model: string;
  tokens?: number; // undefined = unknown (no reading yet, or cleared by /clear)
  window: number; // 0 = real window not known yet
  percent?: number; // the engine's own fill percentage, when it sent one
  costUsd?: number;
  rateLimits?: Limit[]; // empty or absent without a subscription
  nowMs?: number; // the time the countdowns are drawn from, written every minute
  thresholds: Thresholds;
};

declare module 'claude-code' {
  interface PluginState {
    'context-health-bar': { meter: Meter | null };
  }
}
