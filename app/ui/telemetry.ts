export type ExecutionTarget = "device" | "edge" | "regional_edge" | "cloud";
export type PrivacyClass = "public" | "internal" | "sensitive" | "restricted";
export type PlacementPolicy = "adaptive" | "device_only" | "edge_only" | "cloud_only";
export type SchedulerMode =
  | "adaptive"
  | "latency"
  | "energy"
  | "privacy"
  | "device"
  | "edge"
  | "cloud"
  | "custom";

export interface ObjectiveWeights {
  latency: number;
  energy: number;
  monetary_cost: number;
  privacy_risk: number;
  accuracy_loss: number;
}

export interface PolicyPreset {
  weights: ObjectiveWeights;
  placementPolicy: PlacementPolicy;
}

export const POLICY_PRESETS: Record<Exclude<SchedulerMode, "custom">, PolicyPreset> = {
  adaptive: {
    weights: { latency: 0.42, energy: 0.2, monetary_cost: 0.1, privacy_risk: 0.18, accuracy_loss: 0.1 },
    placementPolicy: "adaptive",
  },
  latency: {
    weights: { latency: 0.8, energy: 0.05, monetary_cost: 0.05, privacy_risk: 0.05, accuracy_loss: 0.05 },
    placementPolicy: "adaptive",
  },
  energy: {
    weights: { latency: 0.05, energy: 0.8, monetary_cost: 0.05, privacy_risk: 0.05, accuracy_loss: 0.05 },
    placementPolicy: "adaptive",
  },
  privacy: {
    weights: { latency: 0.05, energy: 0.05, monetary_cost: 0.05, privacy_risk: 0.8, accuracy_loss: 0.05 },
    placementPolicy: "adaptive",
  },
  device: {
    weights: { latency: 0.2, energy: 0.2, monetary_cost: 0.1, privacy_risk: 0.4, accuracy_loss: 0.1 },
    placementPolicy: "device_only",
  },
  edge: {
    weights: { latency: 0.5, energy: 0.2, monetary_cost: 0.1, privacy_risk: 0.1, accuracy_loss: 0.1 },
    placementPolicy: "edge_only",
  },
  cloud: {
    weights: { latency: 0.2, energy: 0.3, monetary_cost: 0.1, privacy_risk: 0.1, accuracy_loss: 0.3 },
    placementPolicy: "cloud_only",
  },
};

export interface MetricSnapshot {
  latencyMs: number;
  throughputMbps: number;
  packetLossPct: number;
  jitterMs: number;
  queueDepth: number;
  energyJ: number;
  accuracyPct: number;
  privacyRisk: "LOW" | "MEDIUM" | "HIGH";
  slaPct: number;
}

export interface Decision {
  taskId: string;
  workload: string;
  deviceId: string;
  target: ExecutionTarget;
  nodeId: string;
  score: number;
  rationale: string;
  monetaryCostUsd: number;
  accuracyLossPct: number;
  privacyRiskScore: number;
}

export interface TelemetryFrame {
  schemaVersion: "1.0";
  scenarioId: string;
  tick: number;
  seed: number;
  source: { adapter: string; kind: "simulator" | "hardware"; contractVersion: "1.0" };
  metrics: MetricSnapshot;
  decision: Decision;
  slices: { name: string; utilizationPct: number; reservedMbps: number; color: string }[];
  events: { at: string; label: string; detail: string; severity: "info" | "warning" | "recovered" }[];
  failedBaseStation: string | null;
}

const TARGET_PROFILE: Record<
  ExecutionTarget,
  { nodeId: string; latency: number; energy: number; cost: number; risk: number; accuracy: number }
> = {
  device: { nodeId: "AV-07", latency: 22.2, energy: 8.2, cost: 0, risk: 0.02, accuracy: 91.7 },
  edge: { nodeId: "MEC-CENTRAL-01", latency: 19, energy: 3.8, cost: 0.0014, risk: 0.1, accuracy: 95.4 },
  regional_edge: { nodeId: "REGIONAL-EDGE-01", latency: 33.6, energy: 3.1, cost: 0.0021, risk: 0.2, accuracy: 96 },
  cloud: { nodeId: "EU-CLOUD-01", latency: 62, energy: 2.7, cost: 0.0048, risk: 0.55, accuracy: 96.8 },
};

function selectLocalTarget(
  failed: boolean,
  mode: SchedulerMode,
  privacyClass: PrivacyClass,
  weights: ObjectiveWeights,
) {
  const placementPolicy =
    mode === "custom" ? "adaptive" : POLICY_PRESETS[mode].placementPolicy;
  const weightSum = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const candidates = (Object.entries(TARGET_PROFILE) as [
    ExecutionTarget,
    (typeof TARGET_PROFILE)[ExecutionTarget],
  ][]).map(([target, profile]) => {
    const placementAllowed =
      placementPolicy === "adaptive" ||
      (placementPolicy === "device_only" && target === "device") ||
      (placementPolicy === "edge_only" && ["edge", "regional_edge"].includes(target)) ||
      (placementPolicy === "cloud_only" && target === "cloud");
    const privacyAllowed =
      privacyClass === "restricted"
        ? target === "device"
        : privacyClass === "sensitive"
          ? ["device", "edge"].includes(target)
          : true;
    const healthy = !(failed && target === "edge" && profile.nodeId === "MEC-CENTRAL-01");
    const latency =
      target === "edge" && failed
        ? 24.1
        : profile.latency;
    const terms: ObjectiveWeights = {
      latency: Math.min(latency / 80, 2),
      energy: profile.energy / 10,
      monetary_cost: profile.cost / 0.01,
      privacy_risk: profile.risk,
      accuracy_loss: (100 - profile.accuracy) / 10,
    };
    const score =
      weightSum > 0
        ? Object.entries(weights).reduce(
            (sum, [key, value]) => sum + terms[key as keyof ObjectiveWeights] * value,
            0,
          ) / weightSum
        : Number.POSITIVE_INFINITY;
    return {
      target,
      profile,
      nodeId: target === "edge" && failed ? "MEC-WEST-02" : profile.nodeId,
      latency,
      feasible: placementAllowed && privacyAllowed && (healthy || (target === "edge" && failed)),
      score,
      privacyAllowed,
    };
  });
  const feasible = candidates
    .filter((candidate) => candidate.feasible)
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.latency - right.latency ||
        left.nodeId.localeCompare(right.nodeId),
    );
  return {
    winner: feasible[0] ?? candidates.find((candidate) => candidate.target === "device")!,
    privacyBlocked: candidates.some(
      (candidate) =>
        !candidate.privacyAllowed &&
        ((placementPolicy === "cloud_only" && candidate.target === "cloud") ||
          (placementPolicy === "edge_only" && ["edge", "regional_edge"].includes(candidate.target))),
    ),
  };
}

export function deterministicFrame(
  tick: number,
  failed: boolean,
  mode: SchedulerMode,
  privacyClass: PrivacyClass = "internal",
  restored = false,
  weights: ObjectiveWeights =
    mode === "custom" ? POLICY_PRESETS.adaptive.weights : POLICY_PRESETS[mode].weights,
): TelemetryFrame {
  const failureRecovery = failed ? Math.min(1, Math.max(0, (tick - 2) / 7)) : 1;
  const spike = failed ? 1 - failureRecovery : 0;
  const { winner, privacyBlocked } = selectLocalTarget(
    failed,
    mode,
    privacyClass,
    weights,
  );
  const { target, profile, nodeId } = winner;
  const latency = winner.latency + (failed ? spike * 11 : 0);
  const privacyRisk = target === "cloud" ? "MEDIUM" : "LOW";
  const rationale = privacyBlocked
    ? `${privacyClass} data blocks the selected remote tier; the safe local adapter keeps execution on-device.`
    : failed && target === "edge"
      ? "The nearest healthy MEC minimizes the weighted objective while gNB-CENTRAL is unavailable."
      : `${target.replace("_", " ")} execution minimizes the active weighted objective and satisfies hard constraints.`;

  return {
    schemaVersion: "1.0",
    scenarioId: "metro-autonomy-01",
    tick,
    seed: 42,
    source: { adapter: "deterministic-browser-v1", kind: "simulator", contractVersion: "1.0" },
    metrics: {
      latencyMs: Number(latency.toFixed(1)),
      throughputMbps: Number((842 - spike * 286 + Math.sin(tick) * 18).toFixed(0)),
      packetLossPct: Number((0.18 + spike * 2.5).toFixed(2)),
      jitterMs: Number((2.2 + spike * 7.8).toFixed(1)),
      queueDepth: Math.round(12 + spike * 43),
      energyJ: profile.energy,
      accuracyPct: profile.accuracy,
      privacyRisk,
      slaPct: Number((99.2 - spike * 12).toFixed(1)),
    },
    decision: {
      taskId: `TASK-${String(7842 + tick).padStart(5, "0")}`,
      workload: "Road hazard segmentation",
      deviceId: "AV-07",
      target,
      nodeId,
      score: Number(winner.score.toFixed(4)),
      rationale,
      monetaryCostUsd: profile.cost,
      accuracyLossPct: Number((100 - profile.accuracy).toFixed(1)),
      privacyRiskScore: profile.risk,
    },
    slices: [
      { name: "URLLC · Mobility", utilizationPct: Math.round(63 + spike * 17), reservedMbps: 310, color: "#56e8ff" },
      { name: "eMBB · Vision", utilizationPct: Math.round(47 + spike * 8), reservedMbps: 470, color: "#5794ff" },
      { name: "mMTC · Sensors", utilizationPct: 29, reservedMbps: 62, color: "#a9ed66" },
    ],
    events: restored
      ? [
          { at: "14:32:16", label: "RESTORED", detail: "gNB-CENTRAL healthy; normal admission resumed", severity: "recovered" },
          { at: "14:32:12", label: "OFFLOAD", detail: `AV-07 → ${nodeId}`, severity: "info" },
        ]
      : failed
        ? [
            { at: "14:32:12", label: "REROUTE", detail: `AV-07 → ${nodeId}`, severity: "recovered" },
            { at: "14:32:09", label: "FAILURE", detail: "gNB-CENTRAL unavailable", severity: "warning" },
            { at: "14:32:10", label: "HANDOVER", detail: "5 UEs reassigned to gNB-WEST", severity: "info" },
          ]
        : [
            { at: "14:32:12", label: "OFFLOAD", detail: `AV-07 → ${nodeId}`, severity: "info" },
            { at: "14:32:08", label: "SLICE", detail: "URLLC budget +12 Mbps", severity: "recovered" },
            { at: "14:32:05", label: "HANDOVER", detail: "DRONE-02 sector B → A", severity: "info" },
          ],
    failedBaseStation: failed ? "gNB-CENTRAL" : null,
  };
}
