"""FastAPI entrypoint for NEXUS-5G."""

from __future__ import annotations

import asyncio

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .contracts import (
    ObjectiveWeights,
    ScenarioSummary,
    ScheduleDecision,
    StepRequest,
    TaskRequest,
    TelemetryFrame,
)
from .scheduler import schedule
from .simulator import SCENARIO, TwinSimulator

app = FastAPI(
    title="Edge Orchestration API",
    version="0.1.0",
    description="Deterministic telemetry and transparent multi-objective scheduling.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_origin_regex=r"^http://(?:localhost|127\.0\.0\.1)(?::\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)
simulators = {SCENARIO.scenario_id: TwinSimulator()}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "contract_version": "1.0"}


@app.get("/v1/scenarios", response_model=list[ScenarioSummary])
def list_scenarios() -> list[ScenarioSummary]:
    return [SCENARIO]


@app.post("/v1/scenarios/{scenario_id}/step", response_model=TelemetryFrame)
def step_scenario(scenario_id: str, request: StepRequest) -> TelemetryFrame:
    simulator = simulators.get(scenario_id)
    if simulator is None:
        raise HTTPException(status_code=404, detail="Unknown scenario")
    try:
        return simulator.step(
            request.failure,
            request.objective_weights,
            request.privacy_class,
            request.placement_policy,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/v1/scenarios/{scenario_id}/reset", status_code=204)
def reset_scenario(scenario_id: str) -> None:
    simulator = simulators.get(scenario_id)
    if simulator is None:
        raise HTTPException(status_code=404, detail="Unknown scenario")
    simulator.reset()


@app.post("/v1/schedule", response_model=ScheduleDecision)
def create_schedule(task: TaskRequest) -> ScheduleDecision:
    nodes = simulators[SCENARIO.scenario_id].adapter.sample_nodes(0, None)
    try:
        return schedule(task, nodes, ObjectiveWeights())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.websocket("/v1/scenarios/{scenario_id}/stream")
async def stream_scenario(websocket: WebSocket, scenario_id: str) -> None:
    if scenario_id not in simulators:
        await websocket.close(code=4404)
        return
    await websocket.accept()
    # Each client gets an isolated deterministic replay. Streaming must not
    # advance the state used by HTTP controls or by another operator.
    simulator = TwinSimulator()
    try:
        while True:
            frame = simulator.step()
            await websocket.send_json(frame.model_dump(mode="json"))
            await asyncio.sleep(0.9)
    except WebSocketDisconnect:
        return
