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

export interface SchedulerCandidate {
  target: ExecutionTarget;
  label: string;
  nodeId: string;
  latencyMs: number;
  monetaryCostUsd: number;
  score: number;
  feasible: boolean;
  violations: ("PLACEMENT" | "PRIVACY")[];
}

export interface FrameScenario {
  id: string;
  title: string;
  workload: string;
  ueId: string;
  telemetry: {
    latencyBiasMs: number;
    throughputBaseMbps: number;
    queueBase: number;
    taskNumberBase: number;
    sliceUtilization: [urlcc: number, embb: number, mmtc: number];
  };
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
  candidates: SchedulerCandidate[];
}

const TARGET_PROFILE: Record<
  ExecutionTarget,
  { label: string; nodeId: string; latency: number; energy: number; cost: number; risk: number; accuracy: number }
> = {
  device: { label: "Device", nodeId: "", latency: 22.2, energy: 8.2, cost: 0, risk: 0.02, accuracy: 91.7 },
  edge: { label: "MEC", nodeId: "MEC-CENTRAL-01", latency: 19, energy: 3.8, cost: 0.0014, risk: 0.1, accuracy: 95.4 },
  regional_edge: { label: "Regional", nodeId: "REGIONAL-EDGE-01", latency: 33.6, energy: 3.1, cost: 0.0021, risk: 0.2, accuracy: 96 },
  cloud: { label: "Cloud", nodeId: "EU-CLOUD-01", latency: 62, energy: 2.7, cost: 0.0048, risk: 0.55, accuracy: 96.8 },
};

function selectLocalTarget(
  scenario: FrameScenario,
  failed: boolean,
  mode: SchedulerMode,
  privacyClass: PrivacyClass,
  weights: ObjectiveWeights,
) {
  const placementPolicy =
    mode === "custom" ? "adaptive" : POLICY_PRESETS[mode].placementPolicy;
  const weightSum = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const policyTargets: ExecutionTarget[] =
    placementPolicy === "device_only"
      ? ["device"]
      : placementPolicy === "edge_only"
        ? ["edge", "regional_edge"]
        : placementPolicy === "cloud_only"
          ? ["cloud"]
          : ["device", "edge", "regional_edge", "cloud"];
  const privacyAllows = (target: ExecutionTarget) =>
    privacyClass === "restricted"
      ? target === "device"
      : privacyClass === "sensitive"
        ? ["device", "edge"].includes(target)
        : true;
  const privacyOverride =
    placementPolicy !== "adaptive" && !policyTargets.some((target) => privacyAllows(target));
  const candidates = (Object.entries(TARGET_PROFILE) as [
    ExecutionTarget,
    (typeof TARGET_PROFILE)[ExecutionTarget],
  ][]).map(([target, profile]) => {
    const placementAllowed =
      privacyOverride
        ? target === "device"
        : placementPolicy === "adaptive" || policyTargets.includes(target);
    const privacyAllowed = privacyAllows(target);
    const latency =
      target === "edge" && failed
        ? 24.1 + scenario.telemetry.latencyBiasMs
        : profile.latency + scenario.telemetry.latencyBiasMs;
    const nodeId =
      target === "device"
        ? scenario.ueId
        : target === "edge" && failed
          ? "MEC-WEST-02"
          : profile.nodeId;
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
    const violations: SchedulerCandidate["violations"] = [];
    if (!placementAllowed) violations.push("PLACEMENT");
    if (!privacyAllowed) violations.push("PRIVACY");
    return {
      target,
      profile,
      label: profile.label,
      nodeId,
      latency,
      feasible: violations.length === 0,
      score,
      violations,
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
    candidates,
    privacyBlocked: privacyOverride,
  };
}

export function failureRecoveryPercent(tick: number) {
  return Math.min(100, Math.round((Math.max(0, tick) / 11) * 100));
}

export function deterministicFrame(
  scenario: FrameScenario,
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
  const { winner, candidates, privacyBlocked } = selectLocalTarget(
    scenario,
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
    scenarioId: scenario.id,
    tick,
    seed: 42,
    source: { adapter: "deterministic-browser-v1", kind: "simulator", contractVersion: "1.0" },
    metrics: {
      latencyMs: Number(latency.toFixed(1)),
      throughputMbps: Number((scenario.telemetry.throughputBaseMbps - spike * 286 + Math.sin(tick) * 18).toFixed(0)),
      packetLossPct: Number((0.18 + spike * 2.5).toFixed(2)),
      jitterMs: Number((2.2 + spike * 7.8).toFixed(1)),
      queueDepth: Math.round(scenario.telemetry.queueBase + spike * 43),
      energyJ: profile.energy,
      accuracyPct: profile.accuracy,
      privacyRisk,
      slaPct: Number((99.2 - spike * 12).toFixed(1)),
    },
    decision: {
      taskId: `TASK-${String(scenario.telemetry.taskNumberBase + tick).padStart(5, "0")}`,
      workload: scenario.workload,
      deviceId: scenario.ueId,
      target,
      nodeId,
      score: Number(winner.score.toFixed(4)),
      rationale,
      monetaryCostUsd: profile.cost,
      accuracyLossPct: Number((100 - profile.accuracy).toFixed(1)),
      privacyRiskScore: profile.risk,
    },
    slices: [
      { name: "URLLC · Mobility", utilizationPct: Math.round(scenario.telemetry.sliceUtilization[0] + spike * 17), reservedMbps: 310, color: "#56e8ff" },
      { name: "eMBB · Vision", utilizationPct: Math.round(scenario.telemetry.sliceUtilization[1] + spike * 8), reservedMbps: 470, color: "#5794ff" },
      { name: "mMTC · Sensors", utilizationPct: scenario.telemetry.sliceUtilization[2], reservedMbps: 62, color: "#a9ed66" },
    ],
    events: restored
      ? [
          { at: "14:32:16", label: "RESTORED", detail: "gNB-CENTRAL healthy; normal admission resumed", severity: "recovered" },
          { at: "14:32:12", label: "OFFLOAD", detail: `${scenario.ueId} → ${nodeId}`, severity: "info" },
        ]
      : failed
        ? [
            { at: "14:32:12", label: "REROUTE", detail: `${scenario.ueId} → ${nodeId}`, severity: "recovered" },
            { at: "14:32:09", label: "FAILURE", detail: "gNB-CENTRAL unavailable", severity: "warning" },
            { at: "14:32:10", label: "HANDOVER", detail: "5 UEs reassigned to gNB-WEST", severity: "info" },
          ]
        : [
            { at: "14:32:12", label: "OFFLOAD", detail: `${scenario.ueId} → ${nodeId}`, severity: "info" },
            { at: "14:32:08", label: "SLICE", detail: "URLLC budget +12 Mbps", severity: "recovered" },
            { at: "14:32:05", label: "HANDOVER", detail: `${scenario.ueId} sector B → A`, severity: "info" },
          ],
    failedBaseStation: failed ? "gNB-CENTRAL" : null,
    candidates: candidates.map((candidate) => ({
      target: candidate.target,
      label: candidate.label,
      nodeId: candidate.nodeId,
      latencyMs: Number(candidate.latency.toFixed(1)),
      monetaryCostUsd: candidate.profile.cost,
      score: Number(candidate.score.toFixed(4)),
      feasible: candidate.feasible,
      violations: candidate.violations,
    })),
  };
}
