# Adapter integration guide

NEXUS—5G isolates external data sources behind `TelemetryAdapter`. Both the built-in deterministic source and future physical sources emit `DeviceTelemetry` and `NodeTelemetry`; the scheduler and API only consume those validated types.

`ValidatedSnapshotAdapter` is the working transport boundary for hardware agents
and external simulators. It accepts decoded JSON-compatible mappings, rejects
unknown or invalid fields through the same Pydantic models used by the API, and
returns defensive copies so a downstream consumer cannot mutate the source
snapshot. The ns-3 and srsRAN classes remain explicit integration seams because
their source-specific trace readers depend on the chosen simulator/runtime
version.

## Contract rules

1. Convert units at the adapter boundary: metres, seconds, milliseconds, Mbps, dBm, joules, and percentages.
2. Use a stable source ID. Never identify a device by a mutable IP address alone.
3. Attach a monotonic simulator tick or source sequence number before API ingestion.
4. Mark a node unhealthy when samples expire; do not silently reuse stale radio or queue measurements.
5. Reject rather than guess malformed privacy class, position, or utilization values.
6. Preserve raw source timestamps outside the normalized frame when time-alignment research requires them.

## ns-3 / 5G-LENA

Create an `Ns3Adapter` implementation that consumes trace sinks or exported files.

Suggested mapping:

| Source | NEXUS field |
| --- | --- |
| UE mobility model | `DeviceTelemetry.position`, `velocity_mps` |
| NR PHY Rx trace | `rsrp_dbm`, packet-loss inputs |
| FlowMonitor | latency, jitter, throughput, packet loss |
| gNB scheduler traces | slice utilization and radio queue |
| application trace | task arrival, payload size, deadline |

Run ns-3 as a separate process. A newline-delimited JSON or ZeroMQ bridge is easier to reproduce than embedding the FastAPI process in the simulator. Pin a 5G-LENA/ns-3 version pair because the project publishes compatibility guidance per release.

## SUMO / TraCI

SUMO owns road geometry and mobility; NEXUS owns workload generation and placement.

At each simulation step:

1. request vehicle IDs and position/speed subscriptions through TraCI;
2. map SUMO coordinates into the twin's local metric frame;
3. update `DeviceTelemetry`;
4. let the network simulator or analytical link model derive serving cell and RF measurements;
5. synchronize all clients before advancing the next step.

TraCI uses a TCP client/server model. For high-volume, single-process experiments, libsumo exposes a similar API without socket overhead.

## srsRAN + Open5GS

srsRAN supports JSON metrics over WebSocket. A production `SrsRanAdapter` can map UE, MAC, RLC, and gNB measurements to the same telemetry types used by the deterministic simulator. Open5GS supplies core-network state; the adapter should derive UPF path health and regional/cloud one-way delay without exposing core-specific schema to the scheduler.

Time alignment matters: normalize metric timestamps, tolerate out-of-order delivery within a bounded window, and expose an explicit stale/healthy decision. Keep subscriber identifiers pseudonymous in the twin.

## Physical device

A minimal hardware agent can publish:

```json
{
  "device_id": "JETSON-07",
  "kind": "camera",
  "position": {"x_m": 3.2, "y_m": 1.8, "z_m": -9.4},
  "serving_cell": "gNB-CENTRAL",
  "rsrp_dbm": -78.4,
  "battery_pct": 81.0,
  "uplink_mbps": 62.2,
  "velocity_mps": 0.0
}
```

Transport may be HTTP, MQTT, NATS, or a WebSocket gateway. That choice belongs outside the adapter contract. Authenticate devices, rotate credentials, encrypt transport, rate-limit ingestion, and separate device identity from operator-facing labels before a real deployment.

After transport decoding:

```python
from edge_twin.adapters import ValidatedSnapshotAdapter

adapter = ValidatedSnapshotAdapter(
    name="jetson-agent-07",
    kind="hardware",
    devices=device_payloads,
    nodes=compute_and_radio_node_payloads,
)
simulator = TwinSimulator(adapter=adapter)
```

The test suite proves that unknown hardware fields are rejected and that a
failed base station is represented through the same `healthy` flag used by the
deterministic simulator.

## Safe rollout

- Start in shadow mode: calculate decisions without actuating routing.
- Compare proposed targets with the existing controller and log disagreement.
- Enforce privacy, health, and deadline constraints outside any learned policy.
- Add bounded rollback and dwell time to avoid offload oscillation.
- Graduate one workload and one slice at a time.
