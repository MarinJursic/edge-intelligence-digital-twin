"""Laptop-friendly deterministic city and edge-network simulation."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from threading import RLock

from .contracts import (
    AdapterIdentity,
    DeviceTelemetry,
    NodeTelemetry,
    ObjectiveWeights,
    PlacementPolicy,
    Position,
    ScenarioSummary,
    ServiceMetrics,
    SliceTelemetry,
    TaskRequest,
    TelemetryFrame,
    TwinEvent,
)
from .scheduler import schedule

SCENARIO = ScenarioSummary(
    scenario_id="metro-autonomy-01",
    name="Metro autonomy",
    description="Urban autonomous fleet with three gNodeBs, two MEC nodes, and one cloud region.",
    seed=42,
)


@dataclass
class DeterministicCityAdapter:
    name: str = "deterministic-city-v1"
    kind: str = "simulator"

    def sample_devices(self, tick: int, failed_cell: str | None = None) -> list[DeviceTelemetry]:
        devices: list[DeviceTelemetry] = []
        for index in range(8):
            phase = tick * 0.9 + index * 7.0
            preferred_cell = "gNB-CENTRAL" if index < 5 else "gNB-WEST"
            devices.append(
                DeviceTelemetry(
                    device_id=f"AV-{index + 1:02d}",
                    kind="vehicle",
                    position=Position(x_m=(phase % 64) - 32, z_m=1.7 if index % 2 else -1.7),
                    serving_cell="gNB-WEST" if preferred_cell == failed_cell else preferred_cell,
                    rsrp_dbm=round(-71 - abs(math.sin(phase / 17)) * 12, 2),
                    battery_pct=round(91 - index * 2.7, 1),
                    uplink_mbps=round(78 + math.sin(phase) * 7, 1),
                    velocity_mps=11.8 + index * 0.4,
                )
            )
        devices.append(
            DeviceTelemetry(
                device_id="DRONE-02",
                kind="drone",
                position=Position(
                    x_m=math.cos(tick * 0.2) * 13, y_m=6.2, z_m=math.sin(tick * 0.2) * 10
                ),
                serving_cell="gNB-WEST",
                rsrp_dbm=-79.4,
                battery_pct=73.2,
                uplink_mbps=44.7,
                velocity_mps=8.4,
            )
        )
        devices.extend(
            [
                DeviceTelemetry(
                    device_id="PHONE-12",
                    kind="phone",
                    position=Position(x_m=-4.2, y_m=1.3, z_m=8.6),
                    serving_cell="gNB-WEST" if failed_cell == "gNB-CENTRAL" else "gNB-CENTRAL",
                    rsrp_dbm=-76.8,
                    battery_pct=68.0,
                    uplink_mbps=52.4,
                    velocity_mps=1.4,
                ),
                DeviceTelemetry(
                    device_id="CAM-PORT-03",
                    kind="camera",
                    position=Position(x_m=18.0, y_m=3.8, z_m=-8.0),
                    serving_cell="gNB-NORTH",
                    rsrp_dbm=-72.1,
                    battery_pct=100,
                    uplink_mbps=112.6,
                    velocity_mps=0,
                ),
                DeviceTelemetry(
                    device_id="ROBOT-04",
                    kind="robot",
                    position=Position(x_m=-13.0 + (tick % 12) * 0.35, z_m=13.5),
                    serving_cell="gNB-WEST",
                    rsrp_dbm=-74.6,
                    battery_pct=84.3,
                    uplink_mbps=66.2,
                    velocity_mps=1.1,
                ),
                DeviceTelemetry(
                    device_id="SENSOR-118",
                    kind="sensor",
                    position=Position(x_m=8.2, y_m=0.4, z_m=17.0),
                    serving_cell="gNB-NORTH",
                    rsrp_dbm=-81.2,
                    battery_pct=94.7,
                    uplink_mbps=2.8,
                    velocity_mps=0,
                ),
                DeviceTelemetry(
                    device_id="SENSOR-119",
                    kind="sensor",
                    position=Position(x_m=-20.0, y_m=0.4, z_m=-10.0),
                    serving_cell="gNB-WEST",
                    rsrp_dbm=-83.0,
                    battery_pct=88.1,
                    uplink_mbps=2.4,
                    velocity_mps=0,
                ),
                DeviceTelemetry(
                    device_id="SENSOR-120",
                    kind="sensor",
                    position=Position(x_m=19.0, y_m=0.4, z_m=14.0),
                    serving_cell="gNB-NORTH",
                    rsrp_dbm=-80.4,
                    battery_pct=91.5,
                    uplink_mbps=3.1,
                    velocity_mps=0,
                ),
                DeviceTelemetry(
                    device_id="SENSOR-121",
                    kind="sensor",
                    position=Position(x_m=-6.0, y_m=0.4, z_m=-19.0),
                    serving_cell="gNB-WEST",
                    rsrp_dbm=-82.7,
                    battery_pct=86.9,
                    uplink_mbps=2.6,
                    velocity_mps=0,
                ),
            ]
        )
        return devices

    def sample_nodes(
        self,
        tick: int,
        failed_cell: str | None,
        failure_age: int | None = None,
    ) -> list[NodeTelemetry]:
        failed = failed_cell == "gNB-CENTRAL"
        recovery = min(1.0, max(0.0, ((failure_age or 0) - 2) / 7)) if failed else 1.0
        spike = 1 - recovery if failed else 0
        return [
            NodeTelemetry(
                node_id="AV-07",
                kind="device",
                healthy=True,
                queue_depth=2,
                compute_utilization_pct=54,
                one_way_network_ms=0,
            ),
            NodeTelemetry(
                node_id="MEC-CENTRAL-01",
                kind="edge",
                healthy=not failed,
                queue_depth=round(12 + 46 * spike),
                compute_utilization_pct=round(58 + 31 * spike, 1),
                one_way_network_ms=5.3,
            ),
            NodeTelemetry(
                node_id="MEC-WEST-02",
                kind="edge",
                healthy=True,
                queue_depth=round(8 + 13 * spike),
                compute_utilization_pct=round(42 + 26 * spike, 1),
                one_way_network_ms=7.1,
            ),
            NodeTelemetry(
                node_id="REGIONAL-EDGE-01",
                kind="regional_edge",
                healthy=True,
                queue_depth=5,
                compute_utilization_pct=37,
                one_way_network_ms=13.8,
            ),
            NodeTelemetry(
                node_id="EU-CLOUD-01",
                kind="cloud",
                healthy=True,
                queue_depth=3,
                compute_utilization_pct=28,
                one_way_network_ms=28.5,
            ),
            NodeTelemetry(
                node_id="gNB-CENTRAL",
                kind="base_station",
                healthy=not failed,
                queue_depth=round(5 + spike * 26),
                compute_utilization_pct=round(45 + spike * 50, 1),
                one_way_network_ms=1.2,
            ),
            NodeTelemetry(
                node_id="gNB-WEST",
                kind="base_station",
                healthy=True,
                queue_depth=round(4 + spike * 11),
                compute_utilization_pct=round(39 + spike * 24, 1),
                one_way_network_ms=1.5,
            ),
            NodeTelemetry(
                node_id="gNB-NORTH",
                kind="base_station",
                healthy=True,
                queue_depth=3,
                compute_utilization_pct=34,
                one_way_network_ms=1.4,
            ),
        ]


class TwinSimulator:
    def __init__(self, adapter: DeterministicCityAdapter | None = None) -> None:
        self.adapter = adapter or DeterministicCityAdapter()
        self.tick = 0
        self._active_failure: str | None = None
        self._failure_started_tick: int | None = None
        self._lock = RLock()

    def reset(self) -> None:
        with self._lock:
            self.tick = 0
            self._active_failure = None
            self._failure_started_tick = None

    def step(
        self,
        failure: str = "none",
        weights: ObjectiveWeights | None = None,
        privacy_class: str = "internal",
        placement_policy: PlacementPolicy = "adaptive",
    ) -> TelemetryFrame:
        with self._lock:
            return self._step_locked(failure, weights, privacy_class, placement_policy)

    def _step_locked(
        self,
        failure: str,
        weights: ObjectiveWeights | None,
        privacy_class: str,
        placement_policy: PlacementPolicy,
    ) -> TelemetryFrame:
        failed_cell = "gNB-CENTRAL" if failure == "gnb-central" else None
        transition = "steady"
        if failed_cell and not self._active_failure:
            self._failure_started_tick = self.tick
            transition = "failed"
        elif not failed_cell and self._active_failure:
            transition = "restored"
        self._active_failure = failed_cell
        if not failed_cell:
            self._failure_started_tick = None
        failure_age = (
            self.tick - self._failure_started_tick
            if failed_cell and self._failure_started_tick is not None
            else None
        )
        devices = self.adapter.sample_devices(self.tick, failed_cell)
        nodes = self.adapter.sample_nodes(self.tick, failed_cell, failure_age)
        task = TaskRequest(
            task_id=f"TASK-{7842 + self.tick:05d}",
            device_id="AV-07",
            workload="Road hazard segmentation",
            input_mb=2.8,
            compute_gflop=13.4,
            deadline_ms=80,
            minimum_accuracy_pct=90,
            privacy_class=privacy_class,
        )
        decision = schedule(task, nodes, weights or ObjectiveWeights(), placement_policy)
        recovery = min(1.0, max(0.0, ((failure_age or 0) - 2) / 7)) if failed_cell else 1.0
        spike = 1 - recovery if failed_cell else 0
        frame = TelemetryFrame(
            scenario_id=SCENARIO.scenario_id,
            tick=self.tick,
            seed=SCENARIO.seed,
            generated_at=datetime(2026, 7, 25, 14, 32, tzinfo=UTC)
            + timedelta(milliseconds=self.tick * 900),
            source=AdapterIdentity(name=self.adapter.name, kind="simulator"),
            devices=devices,
            nodes=nodes,
            metrics=ServiceMetrics(
                latency_ms=round(
                    decision.candidates[
                        [c.node_id for c in decision.candidates].index(decision.node_id)
                    ].latency_ms
                    + spike * 11,
                    1,
                ),
                throughput_mbps=round(842 - spike * 286 + math.sin(self.tick) * 18, 1),
                packet_loss_pct=round(0.18 + spike * 2.5, 2),
                jitter_ms=round(2.2 + spike * 7.8, 1),
                queue_depth=round(12 + spike * 43),
                energy_j=next(
                    c.energy_j for c in decision.candidates if c.node_id == decision.node_id
                ),
                accuracy_pct=next(
                    c.accuracy_pct for c in decision.candidates if c.node_id == decision.node_id
                ),
                privacy_risk="HIGH"
                if decision.target == "cloud" and privacy_class in {"sensitive", "restricted"}
                else "MEDIUM"
                if decision.target == "cloud"
                else "LOW",
                sla_pct=round(99.2 - spike * 12, 1),
            ),
            decision=decision,
            slices=[
                SliceTelemetry(
                    name="URLLC · Mobility",
                    utilization_pct=round(63 + spike * 17),
                    reserved_mbps=310,
                ),
                SliceTelemetry(
                    name="eMBB · Vision", utilization_pct=round(47 + spike * 8), reserved_mbps=470
                ),
                SliceTelemetry(name="mMTC · Sensors", utilization_pct=29, reserved_mbps=62),
            ],
            events=self._events(failed_cell, transition, decision.node_id),
            failed_base_station=failed_cell,
        )
        self.tick += 1
        return frame

    @staticmethod
    def _events(failed_cell: str | None, transition: str, target_node: str) -> list[TwinEvent]:
        if transition == "restored":
            return [
                TwinEvent(
                    at="14:32:16",
                    label="RESTORED",
                    detail="gNB-CENTRAL healthy; normal admission resumed",
                    severity="recovered",
                ),
                TwinEvent(
                    at="14:32:12", label="OFFLOAD", detail=f"AV-07 → {target_node}", severity="info"
                ),
            ]
        if failed_cell:
            return [
                TwinEvent(
                    at="14:32:12",
                    label="REROUTE",
                    detail=f"AV-07 → {target_node}",
                    severity="recovered",
                ),
                TwinEvent(
                    at="14:32:09",
                    label="FAILURE",
                    detail="gNB-CENTRAL unavailable",
                    severity="warning",
                ),
                TwinEvent(
                    at="14:32:10",
                    label="HANDOVER",
                    detail="5 UEs reassigned to gNB-WEST",
                    severity="info",
                ),
            ]
        return [
            TwinEvent(
                at="14:32:12", label="OFFLOAD", detail="AV-07 → MEC-CENTRAL-01", severity="info"
            ),
            TwinEvent(
                at="14:32:08", label="SLICE", detail="URLLC budget +12 Mbps", severity="recovered"
            ),
        ]
