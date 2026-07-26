"use client";

import Image from "next/image";

import type { OperationsScenario } from "./operationsData";
import type { ExecutionTarget } from "./telemetry";

const TIER_LABELS: Record<ExecutionTarget, string> = {
  device: "On device",
  edge: "Barcelona MEC",
  regional_edge: "Regional edge",
  cloud: "Cloud region",
};

export function StreetEvidenceView({
  scenario,
  nodeId,
  target,
  latencyMs,
  failed,
  onShowMap,
  onInspectDecision,
}: {
  scenario: OperationsScenario;
  nodeId: string;
  target: ExecutionTarget;
  latencyMs: number;
  failed: boolean;
  onShowMap: () => void;
  onInspectDecision: (opener: HTMLButtonElement) => void;
}) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  return (
    <figure className="street-evidence" aria-label={`${scenario.place} reference photography`}>
      {/* The photograph is deliberately not used as a georeferenced or measured data layer. */}
      <Image
        src={`${basePath}${scenario.contextPhoto.image}`}
        alt={scenario.contextPhoto.alt}
        fill
        priority
        sizes="(max-width: 1180px) 100vw, calc(100vw - 344px)"
        unoptimized
      />
      <div className="photo-shade" aria-hidden="true" />

      <section className="scene-heading">
        <span className="classification reference">REAL BARCELONA CONTEXT</span>
        <p>{scenario.place}</p>
        <h1>{scenario.title}</h1>
        <span className="scene-note">
          Follow one camera frame from capture to its selected compute destination.
        </span>
      </section>

      <section className="decision-path" aria-label="Current workload placement">
        <div>
          <span><b>1</b> CAPTURE</span>
          <strong>A camera sends a frame</strong>
          <small>{scenario.ueId} · {scenario.workload}</small>
        </div>
        <i aria-hidden="true">→</i>
        <div>
          <span><b>2</b> CONNECT</span>
          <strong>{failed ? "Rerouted to the west cell" : "Nearest 5G cell"}</strong>
          <small>{failed ? "gNB-WEST · handover active" : "gNB-CENTRAL · serving cell"}</small>
        </div>
        <i aria-hidden="true">→</i>
        <div className="placement-choice">
          <span><b>3</b> PROCESS</span>
          <strong>Run at {TIER_LABELS[target]}</strong>
          <small>{latencyMs.toFixed(1)} ms round trip · {nodeId}</small>
        </div>
      </section>

      <div className="journey-actions" aria-label="Explore this placement decision">
        <button type="button" onClick={onShowMap}>See the network route</button>
        <button type="button" onClick={(event) => onInspectDecision(event.currentTarget)}>Why this destination?</button>
      </div>

      <figcaption>
        <span>
          Reference photo only · camera {scenario.contextPhoto.cameraCoordinates} ·
          {scenario.contextPhoto.distanceFromScenario}
        </span>
        <a href={scenario.contextPhoto.sourceUrl} target="_blank" rel="noreferrer">
          {scenario.contextPhoto.author} · {scenario.contextPhoto.capturedAt} · {scenario.contextPhoto.license}
        </a>
      </figcaption>
    </figure>
  );
}
