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
}: {
  scenario: OperationsScenario;
  nodeId: string;
  target: ExecutionTarget;
  latencyMs: number;
  failed: boolean;
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
        <span className="classification reference">NEARBY REFERENCE PHOTOGRAPH</span>
        <p>{scenario.place}</p>
        <h1>{scenario.title}</h1>
        <span className="scene-note">
          Nearby city context · not the mapped scene · not live · not a simulator input
        </span>
      </section>

      <section className="decision-path" aria-label="Current workload placement">
        <div>
          <span>WORKLOAD · FIXTURE</span>
          <strong>{scenario.ueId}</strong>
          <small>{scenario.workload}</small>
        </div>
        <i aria-hidden="true">→</i>
        <div>
          <span>ACCESS · SIMULATED FIXTURE</span>
          <strong>{failed ? "gNB-WEST" : "gNB-CENTRAL"}</strong>
          <small>{failed ? "handover active" : "serving cell"}</small>
        </div>
        <i aria-hidden="true">→</i>
        <div className="placement-choice">
          <span>PLACEMENT · COMPUTED</span>
          <strong>{TIER_LABELS[target]}</strong>
          <small>{nodeId} · {latencyMs.toFixed(1)} ms</small>
        </div>
      </section>

      <figcaption>
        <span>
          Camera {scenario.contextPhoto.cameraCoordinates} · {scenario.contextPhoto.distanceFromScenario} ·
          not the mapped scene
        </span>
        <a href={scenario.contextPhoto.sourceUrl} target="_blank" rel="noreferrer">
          {scenario.contextPhoto.author} · {scenario.contextPhoto.capturedAt} · {scenario.contextPhoto.license}
        </a>
      </figcaption>
    </figure>
  );
}
