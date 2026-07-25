import { describe, expect, it } from "vitest";

import { deterministicFrame, POLICY_PRESETS } from "../app/ui/telemetry";

describe("deterministic browser adapter", () => {
  it("replays identical frames for identical inputs", () => {
    expect(deterministicFrame(8, true, "adaptive")).toEqual(
      deterministicFrame(8, true, "adaptive"),
    );
  });

  it("models an outage spike and deterministic stabilization", () => {
    const failure = deterministicFrame(0, true, "adaptive");
    const stabilized = deterministicFrame(12, true, "adaptive");
    expect(failure.metrics.queueDepth).toBe(55);
    expect(failure.metrics.packetLossPct).toBe(2.68);
    expect(stabilized.metrics.queueDepth).toBe(12);
    expect(stabilized.metrics.packetLossPct).toBe(0.18);
    expect(failure.decision.nodeId).toBe("MEC-WEST-02");
  });

  it("exercises device, MEC, regional edge, and cloud task paths", () => {
    expect(deterministicFrame(0, false, "device").decision.target).toBe("device");
    expect(deterministicFrame(0, false, "edge").decision.target).toBe("edge");
    expect(deterministicFrame(0, false, "energy").decision.target).toBe("regional_edge");
    expect(deterministicFrame(0, false, "cloud").decision.target).toBe("cloud");
  });

  it("enforces privacy locally when the API is unavailable", () => {
    const frame = deterministicFrame(0, false, "cloud", "restricted");
    expect(frame.decision.target).toBe("device");
    expect(frame.decision.rationale).toMatch(/blocks the selected remote tier/i);
  });

  it("emits an explicit restoration event", () => {
    expect(deterministicFrame(0, false, "adaptive", "internal", true).events[0].label).toBe(
      "RESTORED",
    );
  });

  it("defines valid non-zero presets for every objective and forced policy", () => {
    for (const preset of Object.values(POLICY_PRESETS)) {
      expect(Object.keys(preset.weights)).toEqual([
        "latency",
        "energy",
        "monetary_cost",
        "privacy_risk",
        "accuracy_loss",
      ]);
      expect(Object.values(preset.weights).reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
      expect(Object.values(preset.weights).every((value) => value >= 0 && value <= 1)).toBe(true);
    }
  });

  it("uses custom objective weights in the offline scheduler", () => {
    const weights = {
      latency: 0.05,
      energy: 0.8,
      monetary_cost: 0.05,
      privacy_risk: 0.05,
      accuracy_loss: 0.05,
    };
    expect(
      deterministicFrame(0, false, "custom", "internal", false, weights).decision.target,
    ).toBe("regional_edge");
  });
});
