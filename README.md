# NEXUS—5G Edge Intelligence Digital Twin

[![Live preview](https://img.shields.io/badge/live-preview-2ea44f?logo=github)](https://marinjursic.github.io/edge-intelligence-digital-twin/)
[![Preview status](https://github.com/MarinJursic/edge-intelligence-digital-twin/actions/workflows/pages.yml/badge.svg)](https://github.com/MarinJursic/edge-intelligence-digital-twin/actions/workflows/pages.yml)

An interactive geographic operations workbench for inspecting edge-AI placement,
radio incidents, privacy constraints, and deterministic recovery on a real Barcelona
street plan.

The base geography is a checked-in OpenStreetMap extract for Barcelona's Eixample.
Every overlay states what it is: **observed** roads and buildings, **scenario-fixture**
traffic context, **simulated** radio/compute assets, and **derived** placement
decisions. The distinction is part of the product, not fine print.

## Continuous app walkthrough

[![Continuous NEXUS Edge Operations Twin walkthrough showing the Barcelona map, scheduler, scenario changes, and both themes](docs/walkthrough/app-walkthrough.gif)](docs/walkthrough/app-walkthrough.mp4)

[Watch or download the full-resolution MP4](docs/walkthrough/app-walkthrough.mp4)
· [Open the walkthrough poster](docs/walkthrough/app-walkthrough-poster.jpg)

The walkthrough is a single continuous pass through the real application. It changes
between three Barcelona scenarios, rotates and zooms the map, inspects cells and MEC
sites, opens the scheduler, tests its privacy objective, steps the deterministic
replay, opens the restricted-camera scenario, and verifies both themes.

The displayed values are deterministic simulator telemetry, not packet-level RF
measurements. The continuous capture demonstrates the real interaction and rendering
path without claiming measured 5G performance.

## Why this project exists

Edge-AI scheduling is a systems problem, not just a model-selection problem. Sending a workload farther away may improve inference accuracy while increasing radio delay, privacy exposure, and cost. Keeping it on-device may protect data while draining battery and missing a latency target. NEXUS—5G makes those trade-offs observable and gives every decision an inspectable score.

The implemented workbench includes:

- a real, attributed OSM street/building extract rather than a synthetic low-poly city;
- three place-specific examples: a Gran Via road hazard, a Plaça Universitat vision burst, and a restricted Balmes camera workload;
- mouse, touch, wheel, keyboard, and explicit button camera controls;
- selectable UE, gNodeB, and MEC assets with a visible observed/simulated/derived legend;
- independently selectable device, MEC, regional-edge, and cloud baselines;
- normalized latency, energy, cost, privacy-risk, and accuracy-loss weights;
- a one-click `gNB-CENTRAL` outage, handover trace, stabilization progress, task reroute, and explicit restoration;
- a deterministic replay with play, pause, step, seek, and speed controls;
- persistent dark and light themes and a downloadable JSON evidence frame;
- a separate deterministic Python simulator, strict telemetry contract, FastAPI
  control plane, and WebSocket stream for programmatic experiments.

No external map service, API key, GPU, SDR, mobile core, or traffic simulator is
required at runtime. The OSM extract ships with the repository.

## Quick start

Prerequisites: Node.js 22.13+ and Python 3.11+.

```bash
# Frontend (lockfile-reproducible)
npm ci
npm run dev
```

In a second terminal:

```bash
python3 -m venv .venv
.venv/bin/pip install -e 'api[test]'
npm run api:dev
```

Open [http://localhost:3000](http://localhost:3000). The static web product runs its
deterministic demonstration kernel locally and does not claim to display live radio
measurements. The optional Python service is an independently testable control plane;
its OpenAPI docs are available at [http://localhost:8000/docs](http://localhost:8000/docs).

## Demo walkthrough

1. Choose one of the three scenarios from the command bar.
2. Drag the map to change bearing, use the wheel or `+`/`−` to zoom, use arrow
   keys to change bearing and pitch, or use the visible camera toolbar.
3. Toggle buildings, scenario traffic, radio, compute, and task-path layers.
4. Select the active UE, a gNodeB, or a MEC node from either the map or asset rail.
5. Open **Inspect scheduler** and compare adaptive, latency, energy, privacy, device,
   MEC, and cloud policies. Change a weight to create a normalized custom policy.
6. Change privacy to **Restricted** and confirm that remote candidates are visibly
   blocked while device placement remains feasible.
7. Select `gNB-CENTRAL`, simulate its outage, inspect the handover and stabilization
   trace, then restore it.
8. Pause, step, seek, and change replay speed; export the current evidence frame.
9. Switch between complete light and dark themes.

The browser trace is deterministic for a given action sequence. Geographic features
come from the local OSM extract; UE routes, traffic states, radio values, cells, MEC
sites, and decisions are scenario data or simulator output.

## Architecture

```mermaid
flowchart LR
    OSM["Pinned OSM extract<br/>ODbL 1.0"] --> UI["Next.js + TypeScript<br/>geographic operations UI"]
    FIX["Deterministic scenario fixtures"] --> UI
    UI --> KERNEL["Browser replay +<br/>placement baseline"]
    API --> SIM["Deterministic scenario<br/>mobility + network state"]
    API --> SCH["Multi-objective scheduler"]
    SCH --> DEC["Device / MEC / regional edge / cloud"]
    SIM --> CONTRACT["Versioned adapter contract"]
    EXT["ns-3 / 5G-LENA<br/>SUMO / TraCI<br/>srsRAN metrics<br/>physical devices"] -. "future adapters" .-> CONTRACT
    CONTRACT --> API
```

| Layer | Responsibility |
| --- | --- |
| `public/data/barcelona-eixample.geojson` | Deterministic OSM extract with source URL, bbox, timestamp, and ODbL attribution |
| `scripts/import_osm_extract.mjs` | Reproducible OSM XML-to-GeoJSON import and geometry simplification |
| `app/ui/GeoOperationsMap.tsx` | Geographic projection, map layers, route rendering, assets, attribution, and camera controls |
| `app/ui/EdgeTwinDashboard.tsx` | Scenarios, selection, scheduler sheet, incident workflow, evidence export, and replay |
| `app/ui/operationsData.ts` | Three explicit scenario fixtures and simulated network-asset locations |
| `api/edge_twin/contracts.py` | Pydantic telemetry, task, objective, candidate, and scenario contracts |
| `api/edge_twin/scheduler.py` | Feasibility filters and normalized weighted scoring |
| `api/edge_twin/simulator.py` | Seeded mobility, node load, failure, recovery, and telemetry generation |
| `api/edge_twin/adapters.py` | Adapter protocol, validated JSON snapshot adapter, and ns-3/srsRAN seams |

See [Adapter integration guide](docs/ADAPTERS.md) for concrete ns-3, Open5GS, srsRAN, SUMO, and hardware seams.

## Data provenance

| Layer | Classification | Provenance |
| --- | --- | --- |
| streets + buildings | observed geography | OpenStreetMap API extract, bbox `2.1640,41.3862,2.1660,41.3877`, extracted `2026-07-26`, ODbL 1.0 |
| traffic state + route | scenario fixture | hand-authored deterministic examples aligned to named Eixample streets; not measured or current traffic |
| gNodeBs + MEC + UEs | simulated | fixed local scenario assets; not operator topology |
| RSRP/RSRQ/SINR + service KPIs | simulated | deterministic analytical telemetry; not RF measurements |
| placement + task path | derived | interpretable weighted baseline after feasibility constraints |

The web app never fetches third-party tiles. `scripts/import_osm_extract.mjs` turns a
bounded OSM XML response into the compact local GeoJSON file and embeds its endpoint,
bbox, extraction time, license, and attribution. The attribution remains visible
inside the map in every theme.

## Scheduler

For task \(t\) and candidate node \(n\), the scheduler minimizes:

```text
J(t, n) =
  w_latency  · normalized_latency
+ w_energy   · normalized_energy
+ w_cost     · normalized_monetary_cost
+ w_privacy  · privacy_risk
+ w_accuracy · normalized_accuracy_loss
```

Before scoring, hard constraints remove candidates that are unhealthy, violate the accuracy floor, substantially miss the deadline, conflict with the task's privacy class, or fall outside a forced placement baseline. Every candidate reports machine-readable constraint violations. Deterministic tie-breaking uses score, then latency, then node ID. Weight components are bounded to `[0, 1]`, at least one must be non-zero, and scoring normalizes their sum. The analytical latency baseline scales transfer delay with input size and compute delay with requested GFLOP; it is deliberately simple and calibrated only to the included deterministic trace.

This MVP intentionally uses an interpretable weighted objective. It is a research baseline for comparison with mixed-integer optimization, contextual bandits, reinforcement learning, and online adaptive control—not a claim of globally optimal production placement.

## Telemetry contract

Every adapter produces the same `TelemetryFrame 1.0`:

```json
{
  "schema_version": "1.0",
  "scenario_id": "gran-via-hazard",
  "tick": 4,
  "seed": 42,
  "generated_at": "2026-07-25T14:32:03.600000Z",
  "source": {
    "name": "deterministic-city-v1",
    "kind": "simulator",
    "contract_version": "1.0"
  },
  "devices": [],
  "nodes": [],
  "metrics": {
    "latency_ms": 58.0,
    "throughput_mbps": 556.0,
    "packet_loss_pct": 2.68,
    "jitter_ms": 10.0,
    "queue_depth": 55,
    "energy_j": 3.8,
    "accuracy_pct": 95.4,
    "privacy_risk": "LOW",
    "sla_pct": 87.2
  },
  "decision": {},
  "slices": [],
  "events": [],
  "failed_base_station": "gNB-CENTRAL"
}
```

Pydantic rejects unknown fields on source measurements and on control requests. `ValidatedSnapshotAdapter` is an executable ingestion boundary, not only an abstract interface: a physical vehicle, camera, Jetson, Raspberry Pi, Android handset, modem, sensor, SDR-backed RAN, or external simulator therefore enters the control plane through validation rather than a source-specific dashboard branch.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness and contract version |
| `GET` | `/v1/scenarios` | Deterministic scenario catalog |
| `POST` | `/v1/scenarios/{id}/step` | Advance one tick with objective weights and optional failure |
| `POST` | `/v1/scenarios/{id}/reset` | Reset the scenario tick |
| `POST` | `/v1/schedule` | Score a typed workload against the current node set |
| `WS` | `/v1/scenarios/{id}/stream` | Stream frames at the 0.9-second demo cadence |

Example failure step:

```bash
curl -s http://localhost:8000/v1/scenarios/metro-autonomy-01/step \
  -H 'content-type: application/json' \
  -d '{
    "failure": "gnb-central",
    "privacy_class": "internal",
    "placement_policy": "adaptive",
    "objective_weights": {
      "latency": 0.42,
      "energy": 0.20,
      "monetary_cost": 0.10,
      "privacy_risk": 0.18,
      "accuracy_loss": 0.10
    }
  }'
```

`placement_policy` accepts `adaptive`, `device_only`, `edge_only`, or
`cloud_only`. `privacy_class` accepts `public`, `internal`, `sensitive`, or
`restricted`. A forced policy that conflicts with privacy, health, accuracy, or
deadline constraints returns HTTP `422` with an executable reason instead of
silently violating the invariant. WebSocket clients receive isolated seeded
replays and do not advance HTTP-controlled state or another client’s stream.

## Verification

```bash
# Production frontend compilation
npm run build

# Server-rendered product smoke test
npm test

# TypeScript/React lint
npm run lint

# TypeScript contract check
npm run typecheck

# Frontend domain, interaction, and server-render tests
npm test

# Python lint/format plus FastAPI, strict schema, adapter, privacy, policy,
# HTTP, WebSocket, late-failure, restoration, and deterministic replay tests
.venv/bin/ruff check api scripts
.venv/bin/ruff format --check api scripts
cd api && ../.venv/bin/pytest

# All build and test checks
npm run test:all
```

The automated suite checks byte-for-byte reset determinism (including generated timestamps), every device and execution tier, complete telemetry dimensions, late-injected failure behavior, UE reassignment, stabilization and restoration, weighted and forced policies, strict privacy, task-size sensitivity, requesting-device identity, candidate explanations, malformed and unknown HTTP requests, zero/invalid weights, 404s, isolated WebSocket streams and close codes, hardware snapshot validation, custom-weight browser-fallback scheduling, operator controls, persistent theme selection, light-theme propagation into the geographic map, outage inventory, accessible recovery progress, and server-rendered product content.

## Research framing

The next research phase should compare policies under the same recorded traces:

1. device-only, edge-only, and cloud-only;
2. greedy minimum-latency placement;
3. rule-based privacy/deadline routing;
4. the weighted adaptive baseline included here;
5. mixed-integer optimization with a bounded solve budget;
6. reinforcement learning or contextual bandits;
7. online adaptation under non-stationary load and failure.

Recommended evaluation dimensions:

- deadline-hit and slice-SLA rate;
- p50/p95/p99 end-to-end latency and jitter;
- device joules per successful inference;
- monetary cost per 1,000 tasks;
- privacy-policy violations;
- accuracy loss relative to the largest model;
- handover and migration interruption;
- queue stability and recovery time after a gNodeB/MEC failure;
- decision overhead and regret versus an offline oracle.

Run every policy on identical seeded traces and report confidence intervals. Separate simulator fidelity, scheduler performance, and visualization performance; improving one does not prove improvement in the others.

## Standards and primary sources

- ETSI's current MEC framework separates MEC applications, platform services,
  host-level management, and system-level orchestration; NEXUS—5G keeps its
  laptop-scale MEC nodes and scheduler visibly distinct for the same reason:
  [ETSI GS MEC 003 V4.1.1](https://www.etsi.org/deliver/etsi_gs/mec/001_099/003/04.01.01_60/gs_mec003v040101p.pdf).
- 3GPP's 5G system overview identifies edge computing and slicing as distinct
  architectural capabilities. The three dashboard slices are therefore
  workload/SLA views, not separate radio towers or a claim of complete PLMNs:
  [3GPP 5G System Overview](https://www.3gpp.org/technologies/5g-system-overview).
- 3GPP identifies Release 18 as the first release of **5G-Advanced**: [3GPP Highlights, Release 18](https://www.3gpp.org/ftp/Information/Highlights/2022_Issue05/3GPP_Highlights_Issue_5_WEB.pdf).
- 5G-LENA is the ns-3 NR module. NR-v5.0 is paired with ns-3.48; its
  release notes also warn FDD users to apply ns-3 MR 2929 for an NLOS
  spectrum-model issue that can understate received power:
  [5G-LENA v5.0 release notes](https://cttc-lena.gitlab.io/nr/html/md__2builds_2cttc-lena_2nr_2_r_e_l_e_a_s_e___n_o_t_e_s.html).
- Open5GS implements a 5G Core/EPC and documents SA/NSA network functions and deployment: [Open5GS documentation](https://open5gs.org/open5gs/docs/).
- srsRAN provides a portable open-source 5G CU/DU stack; its metrics can be emitted as JSON over WebSocket: [srsRAN Project documentation](https://docs.srsran.com/projects/project/en/latest/) and [output documentation](https://docs.srsran.com/projects/project/en/latest/user_manuals/source/outputs.html).
- SUMO is a microscopic traffic simulator; TraCI provides TCP client/server control and online access to simulation objects: [Eclipse SUMO](https://eclipse.dev/sumo/) and [TraCI documentation](https://eclipse.dev/sumo/docs/TraCI/index.html).
- OpenTelemetry recommends counters such as `system.network.packet.dropped`,
  `system.network.packet.count`, and `system.network.errors` for measured host
  interface telemetry. The included `TelemetryFrame` remains a domain contract;
  a production OpenTelemetry exporter should map measured counters explicitly
  instead of renaming the demo's analytical percentages:
  [OpenTelemetry system metric semantic conventions](https://opentelemetry.io/docs/specs/semconv/system/system-metrics/).
- OpenStreetMap requires visible attribution and identification of the ODbL;
  the map carries both and the extract retains its provenance:
  [OpenStreetMap copyright and license](https://www.openstreetmap.org/copyright).

These tools are integration targets, not bundled dependencies. Keeping them behind adapters preserves the laptop-friendly demo and prevents simulator-specific types from leaking into the scheduler or UI.

## Current limitations

- Radio coverage is an explanatory visualization, not a calibrated ray-traced RF prediction.
- Link and queue dynamics are deterministic analytical signals, not packet-level ns-3 output.
- The scheduler is a transparent weighted heuristic, not a mixed-integer,
  reinforcement-learning, or globally optimal controller. It uses hand-tuned
  normalization constants; production use requires trace-derived calibration.
- The walkthrough records the UI rendering deterministic simulator telemetry. It
  demonstrates product flow and state transitions, not measured 5G performance.
- Authentication, durable telemetry storage, multi-tenant isolation, admission control, and rate limiting are out of scope.
- The WebSocket endpoint streams an isolated no-failure baseline; bidirectional stream control is intentionally not implemented, while controlled experiments use the typed HTTP step endpoint.
- The map uses a compact vector extract and a lightweight SVG projection; it is
  not a full GIS engine and intentionally omits turn-by-turn routing and terrain.
- Open5GS, srsRAN, ns-3/5G-LENA, and SUMO are documented adapter seams and are not installed automatically.

## Repository layout

```text
.
├── app/                  Next.js geographic operations UI
├── api/
│   ├── edge_twin/        contracts, adapters, scheduler, simulator, FastAPI
│   └── tests/            API and scheduling tests
├── docs/                 integration notes and continuous app walkthrough media
├── public/data/          attributed local OSM GeoJSON extract
├── scripts/              OSM importer and reproducible utilities
├── tests/                interaction, theme, domain, and SSR tests
└── README.md
```

## License

[MIT](LICENSE)
