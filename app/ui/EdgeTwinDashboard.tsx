"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GeoOperationsMap, LayerState } from "./GeoOperationsMap";
import { StreetEvidenceView } from "./StreetEvidenceView";
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
  const [viewMode, setViewMode] = useState<"context" | "map">("context");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const schedulerTriggerRef = useRef<HTMLButtonElement>(null);
  const schedulerOpenerRef = useRef<HTMLButtonElement | null>(null);
  const schedulerDialogRef = useRef<HTMLElement>(null);
  const schedulerCloseRef = useRef<HTMLButtonElement>(null);
  const theme = useTheme();

  const frame = useMemo(
    () => deterministicFrame(scenario, tick, failed, mode, privacyClass, restored, weights),
    [scenario, tick, failed, mode, privacyClass, restored, weights],
  );
  const selectedAsset = fixedAssets.find((asset) => asset.id === selectedId);
  const recoveryPct = failed ? failureRecoveryPercent(tick) : 100;
  const weightTotalPct = Math.round(
    Object.values(weights).reduce((sum, value) => sum + Math.max(0, value), 0) * 100,
  );

  useEffect(() => {
    if (!playing || reduceMotion) return;
    const id = window.setInterval(
      () => setTick((value) => failed ? Math.min(99, value + 1) : (value + 1) % 100),
      900 / speed,
    );
    return () => window.clearInterval(id);
  }, [failed, playing, reduceMotion, speed]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduceMotion(media.matches);
      if (media.matches) setPlaying(false);
    };
    apply();
    media.addEventListener?.("change", apply);
    return () => media.removeEventListener?.("change", apply);
  }, []);

  useEffect(() => {
    if (!schedulerOpen) return;
    const dialog = schedulerDialogRef.current;
    const returnFocus = schedulerOpenerRef.current ?? schedulerTriggerRef.current;
    const focusable = () => [
      ...(dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])',
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
      schedulerOpenerRef.current = null;
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
    setViewMode("context");
    setToolsOpen(false);
  }

  function chooseMode(next: Exclude<SchedulerMode, "custom">) {
    setMode(next);
    setWeights(POLICY_PRESETS[next].weights);
  }

  function updateWeight(key: keyof ObjectiveWeights, value: number) {
    setMode("custom");
    setWeights((current) => ({ ...current, [key]: Math.max(0, value) / 100 }));
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

  function openScheduler(opener: HTMLButtonElement) {
    schedulerOpenerRef.current = opener;
    setSchedulerOpen(true);
  }

  function exportFrame() {
    const payload = JSON.stringify({
      classification: {
        photography: "REFERENCE · nearby city context, not the mapped scene",
        geography: "OBSERVED · pinned OpenStreetMap extract",
        authoredScenario: "AUTHORED FIXTURE · traffic, routes, topology, target profiles, nominal RSRP",
        replayMetrics: "COMPUTED FROM FIXTURES · deterministic local replay",
        decision: "COMPUTED FROM FIXTURES · placement/privacy gates, normalized weighted ranking, deterministic tie-break",
      },
      scenario,
      frame,
    }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `edgetwin-${scenario.id}-frame-${tick}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="ops-shell">
      <header className="ops-command">
        <a className="ops-brand" href="#operations-map" aria-label="EdgeTwin network operations">
          <span aria-hidden="true">E</span>
          <strong>EdgeTwin</strong>
          <small>SEE WHERE AI WORK RUNS</small>
        </a>
        <label className="scenario-select">
          <span>Scenario</span>
          <select value={scenarioId} onChange={(event) => chooseScenario(event.target.value)}>
            {scenarios.map((item) => <option value={item.id} key={item.id}>{item.shortLabel} · {item.title}</option>)}
          </select>
        </label>
        <div className="source-status" aria-label="Data classifications">
          <span className="plain-language-status">Camera frame → 5G cell → compute destination</span>
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
          <div><b>REFERENCE</b><span>Nearby Barcelona photographs provide city context only; each source location is disclosed and is not asserted to be the mapped scene.</span></div>
          <div><b>OBSERVED</b><span>Roads and buildings come from a pinned OpenStreetMap extract, ODbL 1.0, bbox 2.1640/41.3862/2.1660/41.3877.</span></div>
          <div><b>AUTHORED</b><span>Traffic, routes, topology, target profiles, nominal RSRP, and workload inputs are deterministic scenario fixtures, not measurements.</span></div>
          <div><b>COMPUTED</b><span>Replay KPIs and candidate rankings are calculated locally from those fixtures; only placement and privacy gates are checked in the browser baseline.</span></div>
        </section>
      )}

      <section className="map-stage" id="operations-map">
        <div className="stage-toolbar">
          <div className="view-switch" role="group" aria-label="Primary evidence view">
            <button type="button" aria-pressed={viewMode === "context"} onClick={() => { setViewMode("context"); setToolsOpen(false); }}>Street context</button>
            <button type="button" aria-pressed={viewMode === "map"} onClick={() => setViewMode("map")}>Geographic map</button>
          </div>
          <button
            type="button"
            className="tools-trigger"
            aria-expanded={toolsOpen}
            onClick={() => {
              setViewMode("map");
              setToolsOpen((value) => !value);
            }}
          >
            Layers &amp; assets
          </button>
        </div>
        {viewMode === "context" ? (
          <StreetEvidenceView
            scenario={scenario}
            nodeId={frame.decision.nodeId}
            target={frame.decision.target}
            latencyMs={frame.metrics.latencyMs}
            failed={failed}
            onShowMap={() => setViewMode("map")}
            onInspectDecision={openScheduler}
          />
        ) : (
          <>
            <div className="map-title">
              <div><span>FRAME JOURNEY</span><h1>How this camera frame travels</h1><p>{scenario.ueId} → {failed ? "gNB-WEST" : "gNB-CENTRAL"} → {frame.decision.nodeId}</p></div>
              <div><span>CURRENT RESULT</span><strong>{frame.metrics.latencyMs.toFixed(1)} ms</strong><small>{frame.metrics.latencyMs < 25 ? "INSIDE 25 MS TARGET" : "TARGET AT RISK"}</small></div>
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
              onSelect={(id) => {
                setSelectedId(id);
                setViewMode("map");
              }}
            />
          </>
        )}
        {toolsOpen && (
          <aside className="layer-rail" aria-label="Map layers and assets">
            <div className="tools-head">
              <div><span>VIEW CONTROLS</span><strong>Layers &amp; assets</strong></div>
              <button type="button" aria-label="Close layers and assets" onClick={() => setToolsOpen(false)}>×</button>
            </div>
            <div className="rail-section">
              <span className="rail-kicker">MAP LAYERS</span>
              {([
                ["buildings", "Buildings", "OBSERVED"],
                ["traffic", "Traffic state", "SCENARIO"],
                ["radio", "Cells + sectors", "AUTHORED FIXTURE"],
                ["compute", "MEC sites", "AUTHORED FIXTURE"],
                ["task", "Task path", "COMPUTED"],
              ] as [keyof LayerState, string, string][]).map(([key, label, classification]) => (
                <label className="layer-row" key={key}>
                  <input type="checkbox" checked={layers[key]} onChange={() => toggleLayer(key)} />
                  <span><strong>{label}</strong><small>{classification}</small></span>
                </label>
              ))}
            </div>
            <div className="rail-section assets">
              <span className="rail-kicker">NETWORK ASSETS</span>
              <button type="button" className={selectedId === "active-ue" ? "active" : ""} onClick={() => { setSelectedId("active-ue"); setToolsOpen(false); setViewMode("map"); }}>
                <i className="ue-swatch" /><span><strong>{scenario.ueId}</strong><small>ACTIVE UE</small></span>
              </button>
              {fixedAssets.map((asset) => (
                <button type="button" key={asset.id} className={selectedId === asset.id ? "active" : ""} onClick={() => { setSelectedId(asset.id); setToolsOpen(false); setViewMode("map"); }}>
                  <i className={`${asset.kind}-swatch`} /><span><strong>{asset.name}</strong><small>{asset.kind === "gnb" ? "CANDIDATE CELL" : "COMPUTE SITE"}</small></span>
                </button>
              ))}
            </div>
            <p className="rail-guidance">The photograph is context only. Asset positions appear only on the observed OSM geometry to avoid false visual alignment.</p>
          </aside>
        )}
        {failed && (
          <div className="incident-alert" role="status">
            <div><span>SIMULATED INCIDENT</span><strong>gNB-CENTRAL unavailable</strong><small>Five UEs handed over to gNB-WEST · task route recomputed</small></div>
            <div className="recovery"><span>Stabilization {recoveryPct}%</span><div role="progressbar" aria-label="Reroute stabilization" aria-valuemin={0} aria-valuemax={100} aria-valuenow={recoveryPct}><i style={{ width: `${recoveryPct}%` }} /></div></div>
          </div>
        )}
        <div className="kpi-strip" aria-label="Current service metrics">
          <Kpi label="Round trip" value={`${frame.metrics.latencyMs.toFixed(1)} ms`} status={frame.metrics.latencyMs < 25 ? "inside 25 ms target" : "target at risk"} warn={frame.metrics.latencyMs >= 25} />
          <Kpi label="Signal" value={failed ? "−89 dBm" : "−72 dBm"} status={failed ? "backup cell" : "serving cell"} warn={failed} />
          <Kpi label="Lost packets" value={`${frame.metrics.packetLossPct.toFixed(2)}%`} status={frame.metrics.packetLossPct < 1 ? "healthy link" : "degraded link"} warn={frame.metrics.packetLossPct >= 1} />
          <Kpi label="Service target" value={`${frame.metrics.slaPct}%`} status={failed ? "recovering" : "nominal"} warn={failed} />
        </div>
      </section>

      <aside className="selection-drawer" aria-label="Selected object details">
        <div className="selection-head">
          <span>{selectedAsset ? (selectedAsset.kind === "gnb" ? "AUTHORED RADIO FIXTURE" : "AUTHORED COMPUTE FIXTURE") : "AUTHORED UE FIXTURE"}</span>
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
              <span>COMPUTE DECISION · LOCAL REPLAY</span>
              <strong>Run at {frame.decision.nodeId}</strong>
              <p>{frame.metrics.latencyMs.toFixed(1)} ms round trip. {frame.decision.rationale}</p>
              {viewMode === "map" && (
                <div className="tier-route" aria-label={`Execution target ${frame.decision.target}`}>
                  {["DEVICE", "MEC", "REGION", "CLOUD"].map((tier) => {
                    const active = tier.toLowerCase() === (frame.decision.target === "edge" ? "mec" : frame.decision.target === "regional_edge" ? "region" : frame.decision.target);
                    return <span className={active ? "active" : ""} key={tier}>{tier}</span>;
                  })}
                </div>
              )}
              <button ref={schedulerTriggerRef} type="button" onClick={(event) => openScheduler(event.currentTarget)}>Compare every destination</button>
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

        <details className="event-feed">
          <summary><span>Event trace</span><small>{frame.events.length} deterministic events</small></summary>
          {frame.events.map((event, index) => (
            <article key={`${event.at}-${index}`}><time>{event.at}</time><i className={event.severity} /><p><strong>{event.label}</strong>{event.detail}</p></article>
          ))}
        </details>
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
            <header><div><span>WHY THIS DESTINATION WON</span><h2 id="scheduler-title">Compare placement options</h2></div><button ref={schedulerCloseRef} type="button" aria-label="Close scheduler" onClick={() => setSchedulerOpen(false)}>×</button></header>
            <div className="scheduler-controls">
              <label className="policy-select">Placement policy
                <select
                  aria-label="Placement policy"
                  value={mode}
                  onChange={(event) => {
                    if (event.target.value !== "custom") {
                      chooseMode(event.target.value as Exclude<SchedulerMode, "custom">);
                    }
                  }}
                >
                  {mode === "custom" && <option value="custom">Custom objectives</option>}
                  {MODES.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
                </select>
              </label>
              <div className="scheduler-answer">
                <span>Current answer</span>
                <strong>{frame.decision.nodeId}</strong>
                <small>{frame.metrics.latencyMs.toFixed(1)} ms · constraints checked before scoring</small>
              </div>
            </div>
            <details className="advanced-objectives">
              <summary>Tune objective weights <span>{mode === "custom" ? `CUSTOM · raw total ${weightTotalPct}%` : `${mode.toUpperCase()} PRESET`}</span></summary>
              <div className="weights">
                {WEIGHTS.map(({ key, label }) => (
                  <label key={key}><span>{label}<output>{Math.round(weights[key] * 100)}%</output></span><input aria-label={`${label} objective weight`} type="range" min="0" max="100" value={Math.round(weights[key] * 100)} onChange={(event) => updateWeight(key, Number(event.target.value))} /></label>
                ))}
              </div>
              <p className="weights-note">Each slider preserves the raw value you set. The scheduler normalizes the active total only while scoring candidates; all-zero weights use the latency tie-break.</p>
            </details>
            <table className="candidate-table">
              <caption>Placement candidates and their feasibility</caption>
              <thead><tr><th scope="col">Candidate</th><th scope="col">Latency</th><th scope="col">Cost/task</th><th scope="col">Feasibility</th></tr></thead>
              <tbody>
                {frame.candidates.map((candidate) => (
                  <tr className={frame.decision.target === candidate.target ? "winner" : ""} key={candidate.target}>
                    <th scope="row">{candidate.label}</th>
                    <td>{candidate.latencyMs.toFixed(1)} ms</td>
                    <td>{candidate.monetaryCostUsd === 0 ? "$0" : `$${candidate.monetaryCostUsd.toFixed(4)}`}</td>
                    <td>{candidate.feasible ? "FEASIBLE" : `${candidate.violations.join(" + ")} BLOCK`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="sheet-note">Candidate attributes are authored scenario fixtures. Feasibility and scores are computed locally from those fixtures; they are not measured operator performance and do not claim global optimality.</p>
          </section>
        </div>
      )}
    </main>
  );
}

function Kpi({ label, value, status, warn = false }: { label: string; value: string; status: string; warn?: boolean }) {
  return <div className={warn ? "warn" : ""}><span>{label}</span><strong>{value}</strong><small>{status}</small></div>;
}
