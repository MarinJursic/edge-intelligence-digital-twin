"""Versioned contracts shared by simulation and future physical adapters."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ExecutionTarget = Literal["device", "edge", "regional_edge", "cloud"]
PrivacyClass = Literal["public", "internal", "sensitive", "restricted"]
PlacementPolicy = Literal["adaptive", "device_only", "edge_only", "cloud_only"]


class Position(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x_m: float
    y_m: float = 0
    z_m: float


class DeviceTelemetry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    device_id: str
    kind: Literal["vehicle", "drone", "phone", "camera", "robot", "sensor"]
    position: Position
    serving_cell: str
    rsrp_dbm: float
    battery_pct: float = Field(ge=0, le=100)
    uplink_mbps: float = Field(ge=0)
    velocity_mps: float = Field(ge=0)


class NodeTelemetry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    node_id: str
    kind: Literal["device", "edge", "regional_edge", "cloud", "base_station"]
    healthy: bool
    queue_depth: int = Field(ge=0)
    compute_utilization_pct: float = Field(ge=0, le=100)
    one_way_network_ms: float = Field(ge=0)


class TaskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task_id: str
    device_id: str
    workload: str
    input_mb: float = Field(gt=0)
    compute_gflop: float = Field(gt=0)
    deadline_ms: float = Field(gt=0)
    minimum_accuracy_pct: float = Field(ge=0, le=100)
    privacy_class: PrivacyClass


class ObjectiveWeights(BaseModel):
    """Non-negative objective weights; at least one dimension must be active."""

    model_config = ConfigDict(extra="forbid")
    latency: float = Field(default=0.42, ge=0, le=1)
    energy: float = Field(default=0.20, ge=0, le=1)
    monetary_cost: float = Field(default=0.10, ge=0, le=1)
    privacy_risk: float = Field(default=0.18, ge=0, le=1)
    accuracy_loss: float = Field(default=0.10, ge=0, le=1)

    @model_validator(mode="after")
    def at_least_one_weight(self) -> ObjectiveWeights:
        if sum(self.model_dump().values()) <= 0:
            raise ValueError("at least one objective weight must be greater than zero")
        return self


class CandidateScore(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target: ExecutionTarget
    node_id: str
    feasible: bool
    constraint_violations: list[str] = Field(default_factory=list)
    score: float
    latency_ms: float
    energy_j: float
    monetary_cost_usd: float
    privacy_risk: float
    accuracy_pct: float


class ScheduleDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task_id: str
    target: ExecutionTarget
    node_id: str
    score: float
    rationale: str
    candidates: list[CandidateScore]


class ServiceMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")
    latency_ms: float
    throughput_mbps: float
    packet_loss_pct: float
    jitter_ms: float
    queue_depth: int
    energy_j: float
    accuracy_pct: float
    privacy_risk: Literal["LOW", "MEDIUM", "HIGH"]
    sla_pct: float


class SliceTelemetry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    utilization_pct: float
    reserved_mbps: float


class TwinEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    at: str
    label: str
    detail: str
    severity: Literal["info", "warning", "recovered"]


class AdapterIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    kind: Literal["simulator", "hardware"]
    contract_version: Literal["1.0"] = "1.0"


class TelemetryFrame(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal["1.0"] = "1.0"
    scenario_id: str
    tick: int
    seed: int
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    source: AdapterIdentity
    devices: list[DeviceTelemetry]
    nodes: list[NodeTelemetry]
    metrics: ServiceMetrics
    decision: ScheduleDecision
    slices: list[SliceTelemetry]
    events: list[TwinEvent]
    failed_base_station: str | None = None


class StepRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    failure: Literal["none", "gnb-central"] = "none"
    privacy_class: PrivacyClass = "internal"
    placement_policy: PlacementPolicy = "adaptive"
    objective_weights: ObjectiveWeights = Field(default_factory=ObjectiveWeights)


class ScenarioSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario_id: str
    name: str
    description: str
    seed: int
    deterministic: bool = True
