"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deterministicFrame,
  ObjectiveWeights,
  POLICY_PRESETS,
  PrivacyClass,
  SchedulerMode,
} from "./telemetry";
import { TwinScene } from "./TwinScene";

const fmt = (n: number, digits = 1) => n.toFixed(digits);
const MODES: Exclude<SchedulerMode, "custom">[] = [
  "adaptive",
  "latency",
  "energy",
  "privacy",
  "device",
  "edge",
  "cloud",
];
const WEIGHT_LABELS: { key: keyof ObjectiveWeights; label: string }[] = [
  { key: "latency", label: "Latency" },
  { key: "energy", label: "Energy" },
  { key: "monetary_cost", label: "Cost" },
  { key: "privacy_risk", label: "Privacy risk" },
  { key: "accuracy_loss", label: "Accuracy loss" },
];

export function EdgeTwinDashboard() {
  const [tick, setTick] = useState(0);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<SchedulerMode>("adaptive");
  const [weights, setWeights] = useState<ObjectiveWeights>(POLICY_PRESETS.adaptive.weights);
  const [privacyClass, setPrivacyClass] = useState<PrivacyClass>("internal");
  const [justRestored, setJustRestored] = useState(false);
  const [remoteFrame, setRemoteFrame] = useState<ReturnType<typeof deterministicFrame> | null>(null);
  const [backendStatus, setBackendStatus] = useState<"connected" | "fallback" | "constraint">("fallback");
  const localFrame = useMemo(
    () => deterministicFrame(tick, failed, mode, privacyClass, justRestored, weights),
    [tick, failed, mode, privacyClass, justRestored, weights],
  );
  const frame = remoteFrame ?? localFrame;

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((v) => {
        if (v >= 3) setJustRestored(false);
        return (v + 1) % 1000;
      });
    }, 900);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${process.env.NEXT_PUBLIC_EDGE_API_URL ?? "http://localhost:8000"}/v1/scenarios/metro-autonomy-01/step`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        failure: failed ? "gnb-central" : "none",
        privacy_class: privacyClass,
        placement_policy: mode === "custom" ? "adaptive" : POLICY_PRESETS[mode].placementPolicy,
        objective_weights: weights,
      }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          const error = new Error(response.status === 422 ? "constraint" : "API unavailable");
          throw error;
        }
        return response.json();
      })
      .then((payload) => {
        const selected = payload.decision.candidates.find(
          (candidate: { node_id: string }) => candidate.node_id === payload.decision.node_id,
        );
        setRemoteFrame({
          schemaVersion: "1.0",
          scenarioId: payload.scenario_id,
          tick: payload.tick,
          seed: payload.seed,
          source: { adapter: payload.source.name, kind: payload.source.kind, contractVersion: payload.source.contract_version },
          metrics: {
            latencyMs: payload.metrics.latency_ms,
            throughputMbps: payload.metrics.throughput_mbps,
            packetLossPct: payload.metrics.packet_loss_pct,
            jitterMs: payload.metrics.jitter_ms,
            queueDepth: payload.metrics.queue_depth,
            energyJ: payload.metrics.energy_j,
            accuracyPct: payload.metrics.accuracy_pct,
            privacyRisk: payload.metrics.privacy_risk,
            slaPct: payload.metrics.sla_pct,
          },
          decision: {
            taskId: payload.decision.task_id,
            workload: "Road hazard segmentation",
            deviceId: "AV-07",
            target: payload.decision.target,
            nodeId: payload.decision.node_id,
            score: payload.decision.score,
            rationale: payload.decision.rationale,
            monetaryCostUsd: selected.monetary_cost_usd,
            accuracyLossPct: 100 - selected.accuracy_pct,
            privacyRiskScore: selected.privacy_risk,
          },
          slices: payload.slices.map((slice: { name: string; utilization_pct: number }, index: number) => ({
            name: slice.name,
            utilizationPct: slice.utilization_pct,
            reservedMbps: payload.slices[index].reserved_mbps,
            color: ["#56e8ff", "#5794ff", "#a9ed66"][index] ?? "#56e8ff",
          })),
          events: payload.events,
          failedBaseStation: payload.failed_base_station,
        });
        setBackendStatus("connected");
      })
      .catch((error: unknown) => {
        if ((error as Error).name !== "AbortError") {
          setRemoteFrame(null);
          setBackendStatus((error as Error).message === "constraint" ? "constraint" : "fallback");
        }
      });
    return () => controller.abort();
  }, [tick, failed, mode, weights, privacyClass]);

  const toggleFailure = () => {
    setJustRestored(failed);
    setFailed((v) => !v);
    setTick(0);
  };

  const selectMode = (nextMode: Exclude<SchedulerMode, "custom">) => {
    setMode(nextMode);
    setWeights(POLICY_PRESETS[nextMode].weights);
  };

  const updateWeight = (key: keyof ObjectiveWeights, value: number) => {
    setMode("custom");
    setWeights((current) => ({ ...current, [key]: value }));
  };

  const resetScenario = async () => {
    setFailed(false);
    setJustRestored(false);
    setTick(0);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_EDGE_API_URL ?? "http://localhost:8000"}/v1/scenarios/metro-autonomy-01/reset`, {
        method: "POST",
      });
    } catch {
      // The deterministic browser adapter has already reset locally.
    }
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true" />
          <div className="brand-name">NEXUS<span>—5G</span></div>
          <div className="env">DIGITAL TWIN / METRO-01</div>
        </div>
        <div className="top-status">
          <div className="live"><i className="live-dot" />{backendStatus === "connected" ? "API CONNECTED" : backendStatus === "constraint" ? "POLICY BLOCKED" : "LOCAL TWIN"}</div>
          <span>SEED 42</span>
          <span className="clock">2026-07-25&nbsp;&nbsp;14:32:{String(tick % 60).padStart(2,"0")}.042Z</span>
          <button className="top-action" onClick={resetScenario}>↻ RESET</button>
        </div>
      </header>

      <div className="workspace">
        <aside className="rail" aria-label="Simulation controls">
          <div className="kicker">Scenario</div>
          <div className="scenario-card">
            <div className="scenario-title">Metro autonomy <i /></div>
            <div className="scenario-sub">Urban mobility · 3 gNodeBs<br />2 MEC zones · 1 cloud region</div>
          </div>
          <div className="kicker" style={{marginTop:22}}>Scheduler policy</div>
          <div className="mode-grid">
            {MODES.map((item) => (
              <button key={item} className={`mode-btn ${mode === item ? "active" : ""}`} onClick={() => selectMode(item)}>
                {item.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="weight-head"><span>Objective weights</span><output>{mode === "custom" ? "CUSTOM" : "PRESET"}</output></div>
          {WEIGHT_LABELS.map(({key,label}) => (
            <label className="weight-row" key={key}>
              <span>{label}<output>{Math.round(weights[key] * 100)}%</output></span>
              <input
                aria-label={`${label} objective weight`}
                type="range"
                min="0"
                max="100"
                value={Math.round(weights[key] * 100)}
                onChange={(event) => updateWeight(key, Number(event.target.value) / 100)}
              />
            </label>
          ))}
          <label className="control-label" htmlFor="privacy-class">
            Workload privacy <output aria-hidden="true">{privacyClass.toUpperCase()}</output>
          </label>
          <select id="privacy-class" value={privacyClass} onChange={(event) => setPrivacyClass(event.target.value as PrivacyClass)}>
            <option value="public">Public</option>
            <option value="internal">Internal</option>
            <option value="sensitive">Sensitive</option>
            <option value="restricted">Restricted</option>
          </select>
          <button className={`fault-btn ${failed ? "active" : ""}`} onClick={toggleFailure}>
            {failed ? "✓ RESTORE gNB-CENTRAL" : "⚠ INJECT BASE-STATION FAILURE"}
          </button>

          <div className="kicker" style={{marginTop:26}}>Network inventory</div>
          <div className="legend">
            {[
              ["#56e8ff","gNodeB sectors","3 / 3"],
              ["#5794ff","MEC nodes","2 / 2"],
              ["#ffbd59","Autonomous fleet","8"],
              ["#a9ed66","Aerial devices","1"],
              ["#d8efff","Phone · camera · robot","3"],
              ["#8a99ad","IoT sensors","4"],
            ].map(([c,n,v])=><div className="legend-row" key={n}><span className="legend-name"><i className="legend-swatch" style={{background:c}} />{n}</span><b>{failed&&n==="gNodeB sectors"?"2 / 3":v}</b></div>)}
          </div>
          <div className="scenario-sub" style={{padding:"0 6px"}}>
            Drag the 3D viewport to rotate. The white pulse follows the current task migration path.
          </div>
        </aside>

        <section className="stage" aria-label="Digital twin viewport">
          <TwinScene failed={failed} tick={tick} target={frame.decision.target} />
          <div className="scene-head">
            <div><div className="scene-title">CITY CORE / OPERATIONS VIEW</div><div className="scene-sub">41.387° N · 2.170° E &nbsp; / &nbsp; SCALE 1:2400</div></div>
            <div className="view-pill">PERSPECTIVE&nbsp;&nbsp;·&nbsp;&nbsp;RADIO + COMPUTE</div>
          </div>
          {failed && <div className="alert" role="status"><strong>gNB-CENTRAL SIGNAL LOST</strong><span>Controller rerouting URLLC traffic via MEC-WEST-02 · estimated stabilization 4.2 s</span></div>}
          {backendStatus === "constraint" && <div className="alert constraint-alert" role="alert"><strong>PLACEMENT BLOCKED</strong><span>The selected tier violates the privacy or feasibility constraint. The safe local preview remains on-device.</span></div>}
          <div className="timeline">
            <div className="timeline-row"><strong>{failed ? "FAILURE RECOVERY SEQUENCE" : "DETERMINISTIC SCENARIO REPLAY"}</strong><span>T+{fmt((tick%20)*.9)} s &nbsp; · &nbsp; 1×</span></div>
            <div className="timeline-track"><div className="timeline-progress" style={{width:`${Math.min(100,(tick%20)*5)}%`}} /><i className="timeline-marker" style={{left:`calc(${Math.min(99,(tick%20)*5)}% - 5px)`}} /></div>
          </div>
        </section>

        <aside className="inspector" aria-label="Live telemetry">
          <section className="section">
            <div className="section-head"><h2>Active decision</h2><span>{frame.decision.score} CONF.</span></div>
            <div className="decision">
              <div className="decision-route">
                <div className={`node ${frame.decision.target==="device"?"on":""}`}><i>⌁</i>DEVICE</div><div className="arrow" />
                <div className={`node ${frame.decision.target==="edge"?"on":""}`}><i>▣</i>MEC</div><div className="arrow" />
                <div className={`node ${frame.decision.target==="regional_edge"?"on":""}`}><i>⬡</i>REGION</div><div className="arrow" />
                <div className={`node ${frame.decision.target==="cloud"?"on":""}`}><i>◇</i>CLOUD</div>
              </div>
              <div className="decision-copy"><strong>{frame.decision.workload}</strong><span>{frame.decision.taskId} · {frame.decision.deviceId}<br />{frame.decision.rationale}</span></div>
            </div>
          </section>
          <section className="section">
            <div className="section-head"><h2>Service telemetry</h2><span>{frame.source.adapter}</span></div>
            <div className="metric-grid">
              <Metric label="End-to-end latency" value={fmt(frame.metrics.latencyMs)} unit="ms" delta={frame.metrics.latencyMs < 25 ? "SLA • < 25 ms":"SLA AT RISK"} warn={frame.metrics.latencyMs>=25}/>
              <Metric label="Throughput" value={fmt(frame.metrics.throughputMbps,0)} unit="Mbps" delta="DL AGGREGATE"/>
              <Metric label="Packet loss" value={fmt(frame.metrics.packetLossPct,2)} unit="%" delta={frame.metrics.packetLossPct < 1 ? "HEALTHY" : "DEGRADED"} warn={frame.metrics.packetLossPct >= 1}/>
              <Metric label="Jitter" value={fmt(frame.metrics.jitterMs)} unit="ms" delta={frame.metrics.jitterMs < 5 ? "STABLE" : "SLA AT RISK"} warn={frame.metrics.jitterMs >= 5}/>
              <Metric label="Queue depth" value={String(frame.metrics.queueDepth)} unit="tasks" delta={frame.metrics.queueDepth<25?"HEALTHY":"REBALANCING"} warn={frame.metrics.queueDepth>=25}/>
              <Metric label="Device energy" value={fmt(frame.metrics.energyJ)} unit="J/task" delta="−18.4% BASELINE"/>
              <Metric label="Model accuracy" value={fmt(frame.metrics.accuracyPct)} unit="%" delta="CALIBRATED"/>
              <Metric label="Privacy risk" value={frame.metrics.privacyRisk} unit="" delta={frame.decision.target.toUpperCase()+" EXECUTION"} warn={frame.metrics.privacyRisk!=="LOW"}/>
            </div>
            <div className="objective-readout">
              <span>Cost <b>${frame.decision.monetaryCostUsd.toFixed(4)}/task</b></span>
              <span>Accuracy loss <b>{frame.decision.accuracyLossPct.toFixed(1)}%</b></span>
              <span>Risk score <b>{frame.decision.privacyRiskScore.toFixed(2)}</b></span>
            </div>
          </section>
          <section className="section">
            <div className="section-head"><h2>Network slices</h2><span>{frame.metrics.slaPct}% SLA</span></div>
            {frame.slices.map(s=><div className="slice-row" key={s.name}><div className="slice-meta"><span>{s.name}</span><span>{s.utilizationPct}% · {s.reservedMbps} Mbps reserved</span></div><div className="bar"><i style={{width:`${s.utilizationPct}%`,background:s.color,boxShadow:`0 0 8px ${s.color}`}} /></div></div>)}
          </section>
          <section className="section">
            <div className="section-head"><h2>Event stream</h2><span>LIVE</span></div>
            {frame.events.map((e,i)=><div className="event" key={`${e.at}-${i}`}><span>{e.at}</span><i style={{background:e.severity==="warning"?"#ff677d":e.severity==="recovered"?"#a9ed66":"#56e8ff"}}/><div><strong>{e.label}</strong>{e.detail}</div></div>)}
          </section>
        </aside>
      </div>
    </main>
  );
}

function Metric({ label, value, unit, delta, warn=false }: {label:string;value:string;unit:string;delta:string;warn?:boolean}) {
  return <div className={`metric ${warn?"warn":""}`}><div className="metric-label">{label}</div><div className="metric-value">{value}<small>{unit}</small></div><div className="metric-delta">{delta}</div></div>;
}
