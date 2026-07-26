"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GeoOperationsMap, LayerState } from "./GeoOperationsMap";
import {
  fixedAssets,
  scenarios,
} from "./operationsData";
import {
  deterministicFrame,
  failureRecoveryPercent,
  ObjectiveWeights,
  POLICY_PRESETS,
  PrivacyClass,
  SchedulerMode,
} from "./telemetry";
import { setStoredTheme, useTheme } from "./theme";

const MODES: { id: Exclude<SchedulerMode, "custom">; label: string }[] = [
  { id: "adaptive", label: "Adaptive" },
  { id: "latency", label: "Latency" },
  { id: "energy", label: "Energy" },
  { id: "privacy", label: "Privacy" },
  { id: "device", label: "Device" },
  { id: "edge", label: "MEC" },
  { id: "cloud", label: "Cloud" },
];

const WEIGHTS: { key: keyof ObjectiveWeights; label: string }[] = [
  { key: "latency", label: "Latency" },
  { key: "energy", label: "Energy" },
  { key: "monetary_cost", label: "Cost" },
  { key: "privacy_risk", label: "Privacy" },
  { key: "accuracy_loss", label: "Accuracy loss" },
];

const initialLayers: LayerState = {
  buildings: true,
  traffic: true,
  radio: true,
  compute: true,
  task: true,
};

function normalizedWeights(weights: ObjectiveWeights) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, value / total]),
  ) as unknown as ObjectiveWeights;
}

export function EdgeTwinDashboard() {
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
  const [tick, setTick] = useState(36);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState(false);
  const [restored, setRestored] = useState(false);
  const [mode, setMode] = useState<SchedulerMode>(scenario.defaultPolicy);
  const [weights, setWeights] = useState<ObjectiveWeights>(POLICY_PRESETS[scenario.defaultPolicy].weights);
  const [privacyClass, setPrivacyClass] = useState<PrivacyClass>(scenario.privacy);
  const [layers, setLayers] = useState<LayerState>(initialLayers);
  const [selectedId, setSelectedId] = useState("active-ue");
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const schedulerTriggerRef = useRef<HTMLButtonElement>(null);
  const schedulerDialogRef = useRef<HTMLElement>(null);
  const schedulerCloseRef = useRef<HTMLButtonElement>(null);
  const theme = useTheme();

  const frame = useMemo(
    () => deterministicFrame(scenario, tick, failed, mode, privacyClass, restored, weights),
    [scenario, tick, failed, mode, privacyClass, restored, weights],
  );
  const selectedAsset = fixedAssets.find((asset) => asset.id === selectedId);
  const recoveryPct = failed ? failureRecoveryPercent(tick) : 100;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(
      () => setTick((value) => failed ? Math.min(99, value + 1) : (value + 1) % 100),
      900 / speed,
    );
    return () => window.clearInterval(id);
  }, [failed, playing, speed]);

  useEffect(() => {
    if (!schedulerOpen) return;
    const dialog = schedulerDialogRef.current;
    const returnFocus = schedulerTriggerRef.current;
    const focusable = () => [
      ...(dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ];
    const focusTimer = window.setTimeout(() => schedulerCloseRef.current?.focus(), 0);
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSchedulerOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", keyDown);
      returnFocus?.focus();
    };
  }, [schedulerOpen]);

  function chooseScenario(id: string) {
    const next = scenarios.find((item) => item.id === id) ?? scenarios[0];
    setScenarioId(id);
    setTick(0);
    setPlaying(true);
    setFailed(false);
    setRestored(false);
    setMode(next.defaultPolicy);
    setWeights(POLICY_PRESETS[next.defaultPolicy].weights);
    setPrivacyClass(next.privacy);
    setSelectedId("active-ue");
  }

  function chooseMode(next: Exclude<SchedulerMode, "custom">) {
    setMode(next);
    setWeights(POLICY_PRESETS[next].weights);
  }

  function updateWeight(key: keyof ObjectiveWeights, value: number) {
    setMode("custom");
    setWeights((current) => normalizedWeights({ ...current, [key]: value / 100 }));
  }

  function toggleLayer(key: keyof LayerState) {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  }

  function reset() {
    setTick(0);
    setPlaying(false);
    setFailed(false);
    setRestored(false);
    setMode(scenario.defaultPolicy);
    setWeights(POLICY_PRESETS[scenario.defaultPolicy].weights);
    setPrivacyClass(scenario.privacy);
    setSelectedId("active-ue");
  }

  function exportFrame() {
    const payload = JSON.stringify({
      classification: {
        geography: "OBSERVED · OpenStreetMap",
        trafficContext: "SCENARIO FIXTURE · deterministic, not measured",
        radioAndCompute: "SIMULATED · deterministic local twin",
        decision: "DERIVED · interpretable weighted baseline",
      },
      scenario,
      frame,
    }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nexus-${scenario.id}-frame-${tick}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="ops-shell">
      <header className="ops-command">
        <a className="ops-brand" href="#operations-map" aria-label="Nexus network operations">
          <span aria-hidden="true">N</span>
          <strong>NEXUS</strong>
          <small>EDGE OPERATIONS TWIN</small>
        </a>
        <label className="scenario-select">
          <span>Scenario</span>
          <select value={scenarioId} onChange={(event) => chooseScenario(event.target.value)}>
            {scenarios.map((item) => <option value={item.id} key={item.id}>{item.shortLabel} · {item.title}</option>)}
          </select>
        </label>
        <div className="source-status" aria-label="Data classifications">
          <span><i className="observed" /> OBSERVED MAP</span>
          <span><i className="simulated" /> SIMULATED RAN</span>
          <span><i className="derived" /> DERIVED DECISION</span>
        </div>
        <div className="ops-actions">
          <button type="button" onClick={() => setProvenanceOpen((value) => !value)} aria-expanded={provenanceOpen}>Sources</button>
          <button type="button" onClick={exportFrame}>Export</button>
          <button type="button" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} onClick={() => setStoredTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      {provenanceOpen && (
        <section className="provenance-banner" aria-label="Data provenance">
          <div><b>OBSERVED</b><span>Roads and buildings: OpenStreetMap local extract, ODbL 1.0, bbox 2.1640/41.3862/2.1660/41.3877.</span></div>
          <div><b>FIXTURE</b><span>Traffic states and routes are deterministic scenario inputs; they are not current or measured traffic.</span></div>
          <div><b>SIMULATED</b><span>gNB locations, radio measurements, UEs, compute sites, slices, failures, and recovery.</span></div>
          <div><b>BASELINE</b><span>Placement is an interpretable deterministic scheduler, not an optimality or measured-network claim.</span></div>
        </section>
      )}

      <aside className="layer-rail" aria-label="Map layers and assets">
        <div className="rail-section">
          <span className="rail-kicker">LAYERS</span>
          {([
            ["buildings", "Buildings", "OBSERVED"],
            ["traffic", "Traffic state", "SCENARIO"],
            ["radio", "Cells + sectors", "SIMULATED"],
            ["compute", "MEC sites", "SIMULATED"],
            ["task", "Task path", "DERIVED"],
          ] as [keyof LayerState, string, string][]).map(([key, label, classification]) => (
            <label className="layer-row" key={key}>
              <input type="checkbox" checked={layers[key]} onChange={() => toggleLayer(key)} />
              <span><strong>{label}</strong><small>{classification}</small></span>
            </label>
          ))}
        </div>
        <div className="rail-section assets">
          <span className="rail-kicker">NETWORK ASSETS</span>
          <button type="button" className={selectedId === "active-ue" ? "active" : ""} onClick={() => setSelectedId("active-ue")}>
            <i className="ue-swatch" /><span><strong>{scenario.ueId}</strong><small>ACTIVE UE</small></span>
          </button>
          {fixedAssets.map((asset) => (
            <button type="button" key={asset.id} className={selectedId === asset.id ? "active" : ""} onClick={() => setSelectedId(asset.id)}>
              <i className={`${asset.kind}-swatch`} /><span><strong>{asset.name}</strong><small>{asset.kind === "gnb" ? "CANDIDATE CELL" : "COMPUTE SITE"}</small></span>
            </button>
          ))}
        </div>
        <p className="rail-guidance">Drag the map or use its camera controls. Every simulated overlay is explicitly marked.</p>
      </aside>

      <section className="map-stage" id="operations-map">
        <div className="map-title">
          <div><span>BARCELONA / EIXAMPLE</span><h1>{scenario.title}</h1><p>{scenario.place} · {scenario.description}</p></div>
          <div><span>SCENARIO TRAFFIC</span><strong>{scenario.observed.trafficState}</strong><small>DETERMINISTIC FIXTURE</small></div>
        </div>
        <GeoOperationsMap
          key={scenario.id}
          scenario={scenario}
          tick={tick}
          failed={failed}
          target={frame.decision.target}
          theme={theme}
          layers={layers}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {failed && (
          <div className="incident-alert" role="status">
            <div><span>SIMULATED INCIDENT</span><strong>gNB-CENTRAL unavailable</strong><small>Five UEs handed over to gNB-WEST · task route recomputed</small></div>
            <div className="recovery"><span>Stabilization {recoveryPct}%</span><div role="progressbar" aria-label="Reroute stabilization" aria-valuemin={0} aria-valuemax={100} aria-valuenow={recoveryPct}><i style={{ width: `${recoveryPct}%` }} /></div></div>
          </div>
        )}
        <div className="kpi-strip" aria-label="Current service metrics">
          <Kpi label="Latency" value={`${frame.metrics.latencyMs.toFixed(1)} ms`} status={frame.metrics.latencyMs < 25 ? "within SLA" : "at risk"} warn={frame.metrics.latencyMs >= 25} />
          <Kpi label="RSRP" value={failed ? "−89 dBm" : "−72 dBm"} status={failed ? "handover" : "serving cell"} warn={failed} />
          <Kpi label="RSRQ" value={failed ? "−13.2 dB" : "−8.4 dB"} status="simulated" warn={failed} />
          <Kpi label="SINR" value={failed ? "7.8 dB" : "19.6 dB"} status="simulated" warn={failed} />
          <Kpi label="Packet loss" value={`${frame.metrics.packetLossPct.toFixed(2)}%`} status={frame.metrics.packetLossPct < 1 ? "healthy" : "degraded"} warn={frame.metrics.packetLossPct >= 1} />
          <Kpi label="SLA" value={`${frame.metrics.slaPct}%`} status={failed ? "recovering" : "nominal"} warn={failed} />
        </div>
      </section>

      <aside className="selection-drawer" aria-label="Selected object details">
        <div className="selection-head">
          <span>{selectedAsset ? (selectedAsset.kind === "gnb" ? "SIMULATED RADIO" : "SIMULATED COMPUTE") : "SIMULATED UE"}</span>
          <strong>{selectedAsset?.name ?? scenario.ueId}</strong>
          <p>{selectedAsset?.detail ?? scenario.workload}</p>
        </div>

        {selectedAsset?.kind === "gnb" ? (
          <>
            <dl className="asset-facts">
              <div><dt>Band</dt><dd>n78 · 3.5 GHz</dd></div>
              <div><dt>Bandwidth</dt><dd>100 MHz</dd></div>
              <div><dt>Numerology</dt><dd>µ = 1 · 30 kHz</dd></div>
              <div><dt>PRB load</dt><dd>{failed && selectedAsset.id === "gnb-central" ? "OFFLINE" : "63%"}</dd></div>
              <div><dt>Attached UEs</dt><dd>{failed && selectedAsset.id === "gnb-central" ? "0" : "5"}</dd></div>
            </dl>
            {selectedAsset.id === "gnb-central" && (
              <button
                type="button"
                className={`incident-button ${failed ? "restore" : ""}`}
                onClick={() => {
                  if (failed) {
                    setFailed(false);
                    setRestored(true);
                  } else {
                    setFailed(true);
                    setRestored(false);
                  }
                  setTick(0);
                }}
              >
                {failed ? "Restore gNB-CENTRAL" : "Simulate gNB-CENTRAL outage"}
              </button>
            )}
          </>
        ) : (
          <>
            <section className="decision-summary">
              <span>ACTIVE PLACEMENT</span>
              <strong>{frame.decision.nodeId}</strong>
              <p>{frame.decision.rationale}</p>
              <div className="tier-route" aria-label={`Execution target ${frame.decision.target}`}>
                {["DEVICE", "MEC", "REGION", "CLOUD"].map((tier) => {
                  const active = tier.toLowerCase() === (frame.decision.target === "edge" ? "mec" : frame.decision.target === "regional_edge" ? "region" : frame.decision.target);
                  return <span className={active ? "active" : ""} key={tier}>{tier}</span>;
                })}
              </div>
              <button ref={schedulerTriggerRef} type="button" onClick={() => setSchedulerOpen(true)}>Inspect scheduler</button>
            </section>
            <label className="privacy-select">Workload privacy
              <select aria-label="Workload privacy" value={privacyClass} onChange={(event) => setPrivacyClass(event.target.value as PrivacyClass)}>
                <option value="public">Public</option>
                <option value="internal">Internal</option>
                <option value="sensitive">Sensitive</option>
                <option value="restricted">Restricted</option>
              </select>
            </label>
          </>
        )}

        <section className="event-feed">
          <div><span>EVENT TRACE</span><small>DETERMINISTIC</small></div>
          {frame.events.map((event, index) => (
            <article key={`${event.at}-${index}`}><time>{event.at}</time><i className={event.severity} /><p><strong>{event.label}</strong>{event.detail}</p></article>
          ))}
        </section>
      </aside>

      <footer className="replay-bar">
        <div className="replay-controls" role="toolbar" aria-label="Scenario replay">
          <button type="button" aria-label="Reset replay" onClick={reset}>↺</button>
          <button type="button" aria-label={playing ? "Pause replay" : "Play replay"} onClick={() => setPlaying((value) => !value)}>{playing ? "Ⅱ" : "▶"}</button>
          <button type="button" aria-label="Step replay forward" onClick={() => { setPlaying(false); setTick((value) => failed ? Math.min(99, value + 1) : (value + 1) % 100); }}>→</button>
        </div>
        <span className="replay-time">T+{(tick * .9).toFixed(1)} s</span>
        <input aria-label="Replay position" type="range" min="0" max="99" value={tick} onChange={(event) => { setPlaying(false); setTick(Number(event.target.value)); }} />
        <div className="event-markers" aria-hidden="true"><i style={{ left: "18%" }} /><i style={{ left: "54%" }} /><i style={{ left: "78%" }} /></div>
        <label>Speed
          <select aria-label="Replay speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            <option value=".5">0.5×</option><option value="1">1×</option><option value="2">2×</option>
          </select>
        </label>
      </footer>

      {schedulerOpen && (
        <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSchedulerOpen(false); }}>
          <section ref={schedulerDialogRef} className="scheduler-sheet" role="dialog" aria-modal="true" aria-labelledby="scheduler-title">
            <header><div><span>INTERPRETABLE BASELINE</span><h2 id="scheduler-title">Placement scheduler</h2></div><button ref={schedulerCloseRef} type="button" aria-label="Close scheduler" onClick={() => setSchedulerOpen(false)}>×</button></header>
            <div className="policy-grid">
              {MODES.map((item) => <button type="button" key={item.id} aria-pressed={mode === item.id} onClick={() => chooseMode(item.id)}>{item.label}</button>)}
            </div>
            <div className="weights">
              <div><strong>Normalized objective</strong><span>{mode === "custom" ? "CUSTOM · sums to 100%" : `${mode.toUpperCase()} PRESET`}</span></div>
              {WEIGHTS.map(({ key, label }) => (
                <label key={key}><span>{label}<output>{Math.round(weights[key] * 100)}%</output></span><input aria-label={`${label} objective weight`} type="range" min="0" max="100" value={Math.round(weights[key] * 100)} onChange={(event) => updateWeight(key, Number(event.target.value))} /></label>
              ))}
            </div>
            <div className="candidate-table">
              <div><span>Candidate</span><span>Latency</span><span>Cost/task</span><span>Feasibility</span></div>
              {frame.candidates.map((candidate) => (
                <div className={frame.decision.target === candidate.target ? "winner" : ""} key={candidate.target}>
                  <strong>{candidate.label}</strong>
                  <span>{candidate.latencyMs.toFixed(1)} ms</span>
                  <span>{candidate.monetaryCostUsd === 0 ? "$0" : `$${candidate.monetaryCostUsd.toFixed(4)}`}</span>
                  <span>{candidate.feasible ? "FEASIBLE" : `${candidate.violations.join(" + ")} BLOCK`}</span>
                </div>
              ))}
            </div>
            <p className="sheet-note">Scores are deterministic simulator output. They are not measured operator performance and do not claim global optimality.</p>
          </section>
        </div>
      )}
    </main>
  );
}

function Kpi({ label, value, status, warn = false }: { label: string; value: string; status: string; warn?: boolean }) {
  return <div className={warn ? "warn" : ""}><span>{label}</span><strong>{value}</strong><small>{status}</small></div>;
}
