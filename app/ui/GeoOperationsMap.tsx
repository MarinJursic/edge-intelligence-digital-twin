"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fixedAssets,
  GeoPoint,
  interpolateRoute,
  MAP_BOUNDS,
  OperationsScenario,
} from "./operationsData";
import type { ExecutionTarget } from "./telemetry";
import type { Theme } from "./theme";

export type LayerState = {
  buildings: boolean;
  traffic: boolean;
  radio: boolean;
  compute: boolean;
  task: boolean;
};

type GeoFeature = {
  properties: { osm_id: number; kind: "road" | "building"; name?: string | null; highway?: string | null; levels?: number };
  geometry: { type: "LineString" | "Polygon"; coordinates: GeoPoint[] | GeoPoint[][] };
};

type Extract = {
  features: GeoFeature[];
  provenance: { source: string; license: string; extracted_at: string };
};

function project(point: GeoPoint): [number, number] {
  return [
    ((point[0] - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west)) * 1000,
    (1 - (point[1] - MAP_BOUNDS.south) / (MAP_BOUNDS.north - MAP_BOUNDS.south)) * 720,
  ];
}

function pathData(points: GeoPoint[]) {
  return points.map((point, index) => {
    const [x, y] = project(point);
    return `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

export function GeoOperationsMap({
  scenario,
  tick,
  failed,
  target,
  theme,
  layers,
  selectedId,
  onSelect,
}: {
  scenario: OperationsScenario;
  tick: number;
  failed: boolean;
  target: ExecutionTarget;
  theme: Theme;
  layers: LayerState;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [extract, setExtract] = useState<Extract | null>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [bearing, setBearing] = useState(-8);
  const [pitch, setPitch] = useState(0.88);
  const [zoom, setZoom] = useState(1.04);
  const drag = useRef<{ x: number; bearing: number } | null>(null);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${basePath}/data/barcelona-eixample.geojson`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Map extract returned HTTP ${response.status}`);
        return response.json();
      })
      .then((value: Extract) => {
        setExtract(value);
        setMapStatus("ready");
      })
      .catch((error: unknown) => {
        if ((error as Error).name !== "AbortError") {
          setExtract(null);
          setMapStatus("error");
        }
      });
    return () => controller.abort();
  }, [basePath, retry]);

  const ue = useMemo(() => interpolateRoute(scenario.route, tick), [scenario, tick]);
  const [ueX, ueY] = project(ue);
  const destination =
    target === "device"
      ? ue
      : target === "edge"
        ? fixedAssets.find((asset) => asset.id === (failed ? "mec-west" : "mec-central"))!.point
        : target === "regional_edge"
          ? [MAP_BOUNDS.west + .00014, MAP_BOUNDS.north - .00012] as GeoPoint
          : [MAP_BOUNDS.east - .00012, MAP_BOUNDS.south + .00012] as GeoPoint;

  const buildings = extract?.features.filter((feature) => feature.properties.kind === "building") ?? [];
  const roads = extract?.features.filter((feature) => feature.properties.kind === "road") ?? [];
  const centerX = 500;
  const centerY = 360;
  const mapTransform = `translate(${centerX} ${centerY}) scale(${zoom} ${zoom * pitch}) rotate(${bearing}) translate(${-centerX} ${-centerY})`;

  function keyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setBearing((value) => value + (event.key === "ArrowLeft" ? -15 : 15));
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      setPitch((value) => Math.min(1, Math.max(.63, value + (event.key === "ArrowUp" ? -.06 : .06))));
    }
    if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(1.7, value + .1));
    if (event.key === "-") setZoom((value) => Math.max(.8, value - .1));
  }

  function selectAssetWithKeyboard(
    event: React.KeyboardEvent<SVGGElement>,
    assetId: string,
  ) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(assetId);
  }

  return (
    <div className="geo-map" data-theme={theme} data-testid="operations-map">
      <svg
        viewBox="0 0 1000 720"
        role="region"
        tabIndex={0}
        aria-label="Interactive operations map of Barcelona Eixample. Drag to rotate, use arrow keys to change bearing and pitch, and plus or minus to zoom."
        onKeyDown={keyDown}
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, bearing };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current) setBearing(drag.current.bearing + (event.clientX - drag.current.x) * .35);
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onWheel={(event) => {
          event.preventDefault();
          setZoom((value) => Math.max(.8, Math.min(1.7, value + (event.deltaY < 0 ? .08 : -.08))));
        }}
      >
        <rect width="1000" height="720" className="map-land" />
        <g transform={mapTransform} className="map-camera">
          {layers.buildings && buildings.map((feature) => {
            const ring = feature.geometry.coordinates[0] as GeoPoint[];
            return <path key={`b-${feature.properties.osm_id}`} d={`${pathData(ring)} Z`} className="map-building" />;
          })}
          {roads.map((feature) => (
            <path
              key={`r-${feature.properties.osm_id}`}
              d={pathData(feature.geometry.coordinates as GeoPoint[])}
              className={`map-road ${feature.properties.highway ?? ""}`}
            />
          ))}
          {layers.traffic && (
            <g data-testid="scenario-traffic" data-scenario-id={scenario.id}>
              {scenario.trafficGeometry.map((line, index) => (
                <path
                  key={`${scenario.id}-traffic-${index}`}
                  d={pathData(line)}
                  className="traffic-scenario"
                />
              ))}
            </g>
          )}
          {layers.radio && fixedAssets.filter((asset) => asset.kind === "gnb").map((asset) => {
            const [x, y] = project(asset.point);
            const outage = failed && asset.id === "gnb-central";
            return (
              <g
                key={asset.id}
                className={`map-asset gnb ${outage ? "outage" : ""} ${selectedId === asset.id ? "selected" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`Select ${asset.name} simulated cell`}
                aria-pressed={selectedId === asset.id}
                onClick={() => onSelect(asset.id)}
                onKeyDown={(event) => selectAssetWithKeyboard(event, asset.id)}
              >
                <circle cx={x} cy={y} r="54" className="coverage" />
                <circle cx={x} cy={y} r="11" className="asset-core" />
                <path d={`M ${x} ${y - 11} l -9 21 h 18 Z`} className="asset-symbol" />
                <text x={x + 16} y={y - 13}>{asset.name}</text>
              </g>
            );
          })}
          {layers.compute && fixedAssets.filter((asset) => asset.kind === "mec").map((asset) => {
            const [x, y] = project(asset.point);
            return (
              <g
                key={asset.id}
                className={`map-asset mec ${selectedId === asset.id ? "selected" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`Select ${asset.name} simulated compute site`}
                aria-pressed={selectedId === asset.id}
                onClick={() => onSelect(asset.id)}
                onKeyDown={(event) => selectAssetWithKeyboard(event, asset.id)}
              >
                <rect x={x - 9} y={y - 9} width="18" height="18" rx="2" />
                <text x={x + 15} y={y - 11}>{asset.name}</text>
              </g>
            );
          })}
          <path d={pathData(scenario.route)} className="ue-route" />
          {layers.task && <path d={pathData([ue, destination])} className="task-route" />}
          <g
            className={`map-asset ue ${selectedId === "active-ue" ? "selected" : ""}`}
            role="button"
            tabIndex={0}
            aria-label={`Select active UE ${scenario.ueId}`}
            aria-pressed={selectedId === "active-ue"}
            onClick={() => onSelect("active-ue")}
            onKeyDown={(event) => selectAssetWithKeyboard(event, "active-ue")}
          >
            <circle cx={ueX} cy={ueY} r="13" />
            <circle cx={ueX} cy={ueY} r="4" className="ue-core" />
            <text x={ueX + 18} y={ueY - 12}>{scenario.ueId}</text>
          </g>
        </g>
      </svg>
      <div className="map-controls" role="toolbar" aria-label="Map camera controls">
        <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.7, value + .1))}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(.8, value - .1))}>−</button>
        <button type="button" aria-label="Rotate map left" onClick={() => setBearing((value) => value - 30)}>↺</button>
        <button type="button" aria-label="Rotate map right" onClick={() => setBearing((value) => value + 30)}>↻</button>
        <button type="button" aria-label="Reset map bearing and pitch" onClick={() => { setBearing(0); setPitch(1); setZoom(1); }}>N</button>
      </div>
      <div className="map-readout">
        <span>BEARING {Math.round(((bearing % 360) + 360) % 360)}°</span>
        <span>PITCH {Math.round((1 - pitch) * 70)}°</span>
        <span>ZOOM {zoom.toFixed(2)}×</span>
      </div>
      <div className="map-attribution">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap contributors
        </a>
        <span>ODbL 1.0 · local deterministic extract</span>
      </div>
      {mapStatus === "loading" && (
        <div className="map-loading" role="status">Loading local geographic extract…</div>
      )}
      {mapStatus === "error" && (
        <div className="map-loading map-error" role="alert">
          <span>Map extract unavailable.</span>
          <button
            type="button"
            onClick={() => {
              setMapStatus("loading");
              setRetry((value) => value + 1);
            }}
          >
            Retry local map
          </button>
        </div>
      )}
    </div>
  );
}
