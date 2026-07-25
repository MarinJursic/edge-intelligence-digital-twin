from fastapi.testclient import TestClient
from pydantic import ValidationError
from starlette.websockets import WebSocketDisconnect

from edge_twin.adapters import ValidatedSnapshotAdapter
from edge_twin.contracts import ObjectiveWeights
from edge_twin.main import app, simulators
from edge_twin.simulator import SCENARIO, TwinSimulator

client = TestClient(app)
SCENARIO_PATH = "/v1/scenarios/metro-autonomy-01"


def setup_function() -> None:
    simulators[SCENARIO.scenario_id].reset()


def step(payload: dict | None = None) -> dict:
    response = client.post(f"{SCENARIO_PATH}/step", json=payload or {})
    assert response.status_code == 200, response.text
    return response.json()


def test_health_and_scenario_catalog() -> None:
    assert client.get("/health").json() == {"status": "ok", "contract_version": "1.0"}
    response = client.get("/v1/scenarios")
    assert response.status_code == 200
    assert response.json()[0]["scenario_id"] == "metro-autonomy-01"
    assert response.json()[0]["deterministic"] is True


def test_local_development_origins_can_reach_the_api() -> None:
    response = client.options(
        "/health",
        headers={
            "origin": "http://localhost:3014",
            "access-control-request-method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3014"


def test_step_contract_covers_every_device_kind_and_tick_advances() -> None:
    first = step()
    second = step()
    assert first["schema_version"] == "1.0"
    assert first["source"] == {
        "name": "deterministic-city-v1",
        "kind": "simulator",
        "contract_version": "1.0",
    }
    assert first["tick"] == 0
    assert second["tick"] == 1
    assert len(first["devices"]) == 16
    assert len([device for device in first["devices"] if device["kind"] == "sensor"]) == 4
    assert {device["kind"] for device in first["devices"]} == {
        "vehicle",
        "drone",
        "phone",
        "camera",
        "robot",
        "sensor",
    }
    assert {node["node_id"] for node in first["nodes"]} >= {
        "MEC-CENTRAL-01",
        "MEC-WEST-02",
        "REGIONAL-EDGE-01",
        "EU-CLOUD-01",
        "gNB-CENTRAL",
        "gNB-WEST",
        "gNB-NORTH",
    }
    assert set(first["metrics"]) == {
        "latency_ms",
        "throughput_mbps",
        "packet_loss_pct",
        "jitter_ms",
        "queue_depth",
        "energy_j",
        "accuracy_pct",
        "privacy_risk",
        "sla_pct",
    }


def test_replay_is_byte_for_byte_deterministic_after_reset() -> None:
    first = step()
    client.post(f"{SCENARIO_PATH}/reset")
    replay = step()
    assert replay == first
    assert first["generated_at"] == "2026-07-25T14:32:00Z"


def test_late_failure_has_full_spike_then_recovers_and_restores() -> None:
    for _ in range(12):
        step()
    failed = step({"failure": "gnb-central"})
    assert failed["tick"] == 12
    assert failed["failed_base_station"] == "gNB-CENTRAL"
    central = next(node for node in failed["nodes"] if node["node_id"] == "gNB-CENTRAL")
    assert central["healthy"] is False
    assert failed["decision"]["node_id"] == "MEC-WEST-02"
    assert failed["metrics"]["queue_depth"] == 55
    assert failed["metrics"]["packet_loss_pct"] == 2.68
    assert any(event["label"] == "HANDOVER" for event in failed["events"])
    reassigned = [device for device in failed["devices"] if device["device_id"].startswith("AV-")][
        :5
    ]
    assert all(device["serving_cell"] == "gNB-WEST" for device in reassigned)

    recovered = failed
    for _ in range(10):
        recovered = step({"failure": "gnb-central"})
    assert recovered["metrics"]["queue_depth"] == 12
    assert recovered["metrics"]["packet_loss_pct"] == 0.18
    assert recovered["decision"]["node_id"] == "MEC-WEST-02"

    restored = step({"failure": "none"})
    central = next(node for node in restored["nodes"] if node["node_id"] == "gNB-CENTRAL")
    assert central["healthy"] is True
    assert any(event["label"] == "RESTORED" for event in restored["events"])


def test_weighted_and_forced_policies_reach_every_execution_tier() -> None:
    assert step({"placement_policy": "device_only"})["decision"]["target"] == "device"
    assert step({"placement_policy": "edge_only"})["decision"]["target"] == "edge"
    assert step({"placement_policy": "cloud_only"})["decision"]["target"] == "cloud"
    energy = step(
        {
            "objective_weights": {
                "latency": 0.05,
                "energy": 0.8,
                "monetary_cost": 0.05,
                "privacy_risk": 0.05,
                "accuracy_loss": 0.05,
            }
        }
    )
    assert energy["decision"]["target"] == "regional_edge"


def test_privacy_policy_is_a_hard_constraint_with_explainable_candidates() -> None:
    task = {
        "task_id": "PRIVATE-1",
        "device_id": "AV-07",
        "workload": "Cabin voice processing",
        "input_mb": 1.0,
        "compute_gflop": 3.0,
        "deadline_ms": 80,
        "minimum_accuracy_pct": 90,
        "privacy_class": "restricted",
    }
    response = client.post("/v1/schedule", json=task)
    assert response.status_code == 200
    assert response.json()["target"] == "device"
    remote = next(
        candidate for candidate in response.json()["candidates"] if candidate["target"] == "cloud"
    )
    assert "privacy_policy" in remote["constraint_violations"]

    conflict = client.post(
        f"{SCENARIO_PATH}/step",
        json={"privacy_class": "restricted", "placement_policy": "cloud_only"},
    )
    assert conflict.status_code == 422
    assert "No execution target" in conflict.json()["detail"]


def test_generic_schedule_uses_the_requesting_device_and_task_size() -> None:
    base = {
        "task_id": "JETSON-TASK-1",
        "device_id": "JETSON-07",
        "workload": "Object detection",
        "input_mb": 1.0,
        "compute_gflop": 3.0,
        "deadline_ms": 250,
        "minimum_accuracy_pct": 90,
        "privacy_class": "restricted",
    }
    small = client.post("/v1/schedule", json=base)
    large = client.post(
        "/v1/schedule",
        json={**base, "task_id": "JETSON-TASK-2", "compute_gflop": 30.0},
    )
    assert small.status_code == 200
    assert large.status_code == 200
    assert small.json()["node_id"] == "JETSON-07"
    assert large.json()["node_id"] == "JETSON-07"
    assert large.json()["candidates"][0]["latency_ms"] > small.json()["candidates"][0]["latency_ms"]


def test_request_validation_rejects_unknown_fields_and_zero_weights() -> None:
    assert client.post(f"{SCENARIO_PATH}/step", json={"surprise": True}).status_code == 422
    response = client.post(
        f"{SCENARIO_PATH}/step",
        json={
            "objective_weights": {
                "latency": 0,
                "energy": 0,
                "monetary_cost": 0,
                "privacy_risk": 0,
                "accuracy_loss": 0,
            }
        },
    )
    assert response.status_code == 422
    assert "at least one objective weight" in response.text
    assert (
        client.post(
            f"{SCENARIO_PATH}/step", content="{bad", headers={"content-type": "application/json"}
        ).status_code
        == 422
    )


def test_unknown_scenario_and_reset_error_paths() -> None:
    assert client.post("/v1/scenarios/nope/step", json={}).status_code == 404
    assert client.post("/v1/scenarios/nope/reset").status_code == 404


def test_websocket_contract_is_isolated_from_http_and_unknown_closes_4404() -> None:
    with client.websocket_connect(f"{SCENARIO_PATH}/stream") as socket:
        first = socket.receive_json()
        second = socket.receive_json()
    assert first["tick"] == 0
    assert second["tick"] == 1
    assert step()["tick"] == 0

    try:
        with client.websocket_connect("/v1/scenarios/nope/stream"):
            raise AssertionError("unknown stream unexpectedly connected")
    except WebSocketDisconnect as exc:
        assert exc.code == 4404


def test_validated_snapshot_adapter_gives_hardware_the_same_strict_contract() -> None:
    device = {
        "device_id": "JETSON-07",
        "kind": "camera",
        "position": {"x_m": 3.2, "y_m": 1.8, "z_m": -9.4},
        "serving_cell": "gNB-CENTRAL",
        "rsrp_dbm": -78.4,
        "battery_pct": 81.0,
        "uplink_mbps": 62.2,
        "velocity_mps": 0.0,
    }
    node = {
        "node_id": "gNB-CENTRAL",
        "kind": "base_station",
        "healthy": True,
        "queue_depth": 2,
        "compute_utilization_pct": 34,
        "one_way_network_ms": 1.2,
    }
    adapter = ValidatedSnapshotAdapter("jetson-agent", "hardware", [device], [node])
    assert adapter.sample_devices(0)[0].device_id == "JETSON-07"
    assert adapter.sample_nodes(0, "gNB-CENTRAL")[0].healthy is False
    invalid = {**device, "uncontracted_secret": "must-not-pass"}
    try:
        ValidatedSnapshotAdapter("bad-agent", "hardware", [invalid], [node])
        raise AssertionError("unknown hardware fields unexpectedly passed validation")
    except ValidationError:
        pass


def test_objective_weight_model_bounds_values() -> None:
    assert ObjectiveWeights().latency == 0.42
    for invalid in (-0.01, 1.01):
        try:
            ObjectiveWeights(latency=invalid)
            raise AssertionError(f"invalid weight {invalid} unexpectedly validated")
        except ValidationError:
            pass


def test_simulator_reset_clears_failure_state() -> None:
    simulator = TwinSimulator()
    simulator.step("gnb-central")
    simulator.reset()
    frame = simulator.step()
    assert frame.tick == 0
    assert frame.failed_base_station is None
    assert all(node.healthy for node in frame.nodes)
