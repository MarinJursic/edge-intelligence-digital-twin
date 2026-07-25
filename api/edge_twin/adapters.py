"""Telemetry adapter seam.

Every source—deterministic demo, ns-3, SUMO, srsRAN, or physical device—emits
the exact same Pydantic types. The application layer never special-cases source
payloads.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Literal, Protocol

from .contracts import DeviceTelemetry, NodeTelemetry


class TelemetryAdapter(Protocol):
    """Boundary implemented by simulated and hardware-backed data sources."""

    name: str
    kind: Literal["simulator", "hardware"]

    def sample_devices(
        self, tick: int, failed_cell: str | None = None
    ) -> list[DeviceTelemetry]: ...

    def sample_nodes(
        self,
        tick: int,
        failed_cell: str | None = None,
        failure_age: int | None = None,
    ) -> list[NodeTelemetry]: ...


class ValidatedSnapshotAdapter:
    """Usable adapter for JSON snapshots from hardware or external simulators.

    Transport-specific code (MQTT, WebSocket, files, or a device agent) updates
    the raw snapshot. Validation happens before the scheduler sees a sample.
    """

    def __init__(
        self,
        name: str,
        kind: Literal["simulator", "hardware"],
        devices: Sequence[Mapping[str, Any]],
        nodes: Sequence[Mapping[str, Any]],
    ) -> None:
        self.name = name
        self.kind = kind
        self._devices = [DeviceTelemetry.model_validate(item) for item in devices]
        self._nodes = [NodeTelemetry.model_validate(item) for item in nodes]

    def sample_devices(self, tick: int, failed_cell: str | None = None) -> list[DeviceTelemetry]:
        del tick, failed_cell
        return [device.model_copy(deep=True) for device in self._devices]

    def sample_nodes(
        self,
        tick: int,
        failed_cell: str | None = None,
        failure_age: int | None = None,
    ) -> list[NodeTelemetry]:
        del tick, failure_age
        return [
            node.model_copy(update={"healthy": False})
            if failed_cell and node.node_id == failed_cell
            else node.model_copy(deep=True)
            for node in self._nodes
        ]


class Ns3Adapter:
    """Documented extension seam for ns-3/5G-LENA trace output."""

    name = "ns3-5g-lena"
    kind = "simulator"

    def sample_devices(self, tick: int, failed_cell: str | None = None) -> list[DeviceTelemetry]:
        raise NotImplementedError("Map FlowMonitor/NR traces to DeviceTelemetry")

    def sample_nodes(
        self,
        tick: int,
        failed_cell: str | None = None,
        failure_age: int | None = None,
    ) -> list[NodeTelemetry]:
        raise NotImplementedError("Map gNB/MEC trace sinks to NodeTelemetry")


class SrsRanAdapter:
    """Extension seam for srsRAN JSON/WebSocket metrics."""

    name = "srsran-json-metrics"
    kind = "hardware"

    def sample_devices(self, tick: int, failed_cell: str | None = None) -> list[DeviceTelemetry]:
        raise NotImplementedError("Map UE metrics to DeviceTelemetry")

    def sample_nodes(
        self,
        tick: int,
        failed_cell: str | None = None,
        failure_age: int | None = None,
    ) -> list[NodeTelemetry]:
        raise NotImplementedError("Map gNB metrics to NodeTelemetry")
