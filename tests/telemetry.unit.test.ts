import { describe, expect, it } from "vitest";

import { scenarios } from "../app/ui/operationsData";
import { deterministicFrame, failureRecoveryPercent, POLICY_PRESETS } from "../app/ui/telemetry";

describe("deterministic browser adapter", () => {
  const granVia = scenarios[0];

  it("replays identical frames for identical inputs", () => {
    expect(deterministicFrame(granVia, 8, true, "adaptive")).toEqual(
      deterministicFrame(granVia, 8, true, "adaptive"),
    );
  });

  it("models an outage spike and deterministic stabilization", () => {
    const failure = deterministicFrame(granVia, 0, true, "adaptive");
    const stabilized = deterministicFrame(granVia, 12, true, "adaptive");
    expect(failure.metrics.queueDepth).toBe(55);
    expect(failure.metrics.packetLossPct).toBe(2.68);
    expect(stabilized.metrics.queueDepth).toBe(12);
    expect(stabilized.metrics.packetLossPct).toBe(0.18);
    expect(failure.decision.nodeId).toBe("MEC-WEST-02");
  });

  it("exercises device, MEC, regional edge, and cloud task paths", () => {
    expect(deterministicFrame(granVia, 0, false, "device").decision.target).toBe("device");
    expect(deterministicFrame(granVia, 0, false, "edge").decision.target).toBe("edge");
    expect(deterministicFrame(granVia, 0, false, "energy").decision.target).toBe("regional_edge");
    expect(deterministicFrame(granVia, 0, false, "cloud").decision.target).toBe("cloud");
  });

  it("enforces privacy locally when the API is unavailable", () => {
    const frame = deterministicFrame(granVia, 0, false, "cloud", "restricted");
    expect(frame.decision.target).toBe("device");
    expect(frame.decision.rationale).toMatch(/blocks the selected remote tier/i);
    expect(frame.candidates.find((candidate) => candidate.target === "device")?.feasible).toBe(true);
    expect(frame.candidates.find((candidate) => candidate.target === "cloud")?.violations).toContain(
      "PRIVACY",
    );
  });

  it("emits an explicit restoration event", () => {
    expect(deterministicFrame(granVia, 0, false, "adaptive", "internal", true).events[0].label).toBe(
      "RESTORED",
    );
  });

  it("derives identity, workload, metrics, events, and candidates from the selected scenario", () => {
    const placa = deterministicFrame(scenarios[1], 4, false, "latency", "public");
    expect(placa.scenarioId).toBe("placa-vision");
    expect(placa.decision.workload).toBe(scenarios[1].workload);
    expect(placa.decision.deviceId).toBe("CAM-PLACA-03");
    expect(placa.decision.taskId).toBe("TASK-09104");
    expect(placa.events.some((event) => event.detail.includes("CAM-PLACA-03"))).toBe(true);
    expect(placa.metrics.queueDepth).toBe(20);
    expect(placa.candidates).toHaveLength(4);
  });

  it("stabilizes once without wrapping from 100 percent to zero", () => {
    expect(failureRecoveryPercent(0)).toBe(0);
    expect(failureRecoveryPercent(11)).toBe(100);
    expect(failureRecoveryPercent(99)).toBe(100);
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
      deterministicFrame(granVia, 0, false, "custom", "internal", false, weights).decision.target,
    ).toBe("regional_edge");
  });
});
