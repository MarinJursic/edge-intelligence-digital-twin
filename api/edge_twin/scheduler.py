"""Transparent, deterministic multi-objective edge scheduler."""

from __future__ import annotations

from .contracts import (
    CandidateScore,
    NodeTelemetry,
    ObjectiveWeights,
    PlacementPolicy,
    ScheduleDecision,
    TaskRequest,
)

PROFILE = {
    "device": {"energy": 8.2, "cost": 0.0, "risk": 0.02, "accuracy": 91.7, "compute": 22.0},
    "edge": {"energy": 3.8, "cost": 0.0014, "risk": 0.10, "accuracy": 95.4, "compute": 6.5},
    "regional_edge": {
        "energy": 3.1,
        "cost": 0.0021,
        "risk": 0.20,
        "accuracy": 96.0,
        "compute": 5.2,
    },
    "cloud": {"energy": 2.7, "cost": 0.0048, "risk": 0.55, "accuracy": 96.8, "compute": 3.5},
}


def _privacy_feasible(task: TaskRequest, target: str) -> bool:
    if task.privacy_class == "restricted":
        return target == "device"
    if task.privacy_class == "sensitive":
        return target in {"device", "edge"}
    return True


def schedule(
    task: TaskRequest,
    nodes: list[NodeTelemetry],
    weights: ObjectiveWeights,
    placement_policy: PlacementPolicy = "adaptive",
) -> ScheduleDecision:
    """Score all execution targets and choose the lowest feasible objective."""
    weight_sum = sum(weights.model_dump().values())
    candidates: list[CandidateScore] = []
    for node in nodes:
        if node.kind == "base_station":
            continue
        profile = PROFILE[node.kind]
        # The deterministic analytical model is calibrated to the demo's
        # 2.8 MB / 13.4 GFLOP vision task. Payload and compute demand still
        # affect every decision, so the API does not accept inert task fields.
        transfer_ms = node.one_way_network_ms * 2 * max(0.25, task.input_mb / 2.8)
        queue_ms = node.queue_depth * (0.16 if node.kind != "device" else 0.08)
        compute_ms = profile["compute"] * task.compute_gflop / 13.4
        latency_ms = compute_ms + transfer_ms + queue_ms
        accuracy = profile["accuracy"]
        violations: list[str] = []
        if not node.healthy:
            violations.append("node_unhealthy")
        if latency_ms > task.deadline_ms * 1.5:
            violations.append("deadline")
        if accuracy < task.minimum_accuracy_pct:
            violations.append("accuracy_floor")
        if not _privacy_feasible(task, node.kind):
            violations.append("privacy_policy")
        if placement_policy == "device_only" and node.kind != "device":
            violations.append("placement_policy")
        if placement_policy == "edge_only" and node.kind not in {"edge", "regional_edge"}:
            violations.append("placement_policy")
        if placement_policy == "cloud_only" and node.kind != "cloud":
            violations.append("placement_policy")
        feasible = not violations
        terms = {
            "latency": min(latency_ms / task.deadline_ms, 2.0),
            "energy": profile["energy"] / 10,
            "monetary_cost": profile["cost"] / 0.01,
            "privacy_risk": profile["risk"],
            "accuracy_loss": (100 - accuracy) / 10,
        }
        score = (
            sum(terms[name] * value for name, value in weights.model_dump().items()) / weight_sum
        )
        candidates.append(
            CandidateScore(
                target=node.kind,
                node_id=task.device_id if node.kind == "device" else node.node_id,
                feasible=feasible,
                constraint_violations=violations,
                score=round(score, 4),
                latency_ms=round(latency_ms, 2),
                energy_j=profile["energy"],
                monetary_cost_usd=profile["cost"],
                privacy_risk=profile["risk"],
                accuracy_pct=accuracy,
            )
        )
    feasible = [candidate for candidate in candidates if candidate.feasible]
    if not feasible:
        raise ValueError(
            "No execution target satisfies deadline, accuracy, privacy, and health constraints"
        )
    winner = min(
        feasible, key=lambda candidate: (candidate.score, candidate.latency_ms, candidate.node_id)
    )
    rationale = (
        f"{winner.target.replace('_', ' ').title()} minimizes the {placement_policy.replace('_', ' ')} objective "
        f"at {winner.latency_ms:.1f} ms while satisfying accuracy and privacy constraints."
    )
    return ScheduleDecision(
        task_id=task.task_id,
        target=winner.target,
        node_id=winner.node_id,
        score=winner.score,
        rationale=rationale,
        candidates=candidates,
    )
