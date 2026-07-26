import type { PrivacyClass, SchedulerMode } from "./telemetry";

export type GeoPoint = [longitude: number, latitude: number];

export type OperationsScenario = {
  id: string;
  shortLabel: string;
  title: string;
  place: string;
  center: GeoPoint;
  workload: string;
  description: string;
  observed: {
    trafficState: string;
    road: string;
    capturedAt: string;
    source: string;
  };
  contextPhoto: {
    image: string;
    alt: string;
    caption: string;
    author: string;
    capturedAt: string;
    license: string;
    sourceUrl: string;
    cameraCoordinates: string;
    distanceFromScenario: string;
  };
  defaultPolicy: Exclude<SchedulerMode, "custom">;
  privacy: PrivacyClass;
  route: GeoPoint[];
  trafficGeometry: GeoPoint[][];
  ueId: string;
  telemetry: {
    latencyBiasMs: number;
    throughputBaseMbps: number;
    queueBase: number;
    taskNumberBase: number;
    sliceUtilization: [urlcc: number, embb: number, mmtc: number];
  };
};

export const MAP_BOUNDS = {
  west: 2.164,
  south: 41.3862,
  east: 2.166,
  north: 41.3877,
} as const;

export const scenarios: OperationsScenario[] = [
  {
    id: "gran-via-hazard",
    shortLabel: "Gran Via",
    title: "Road-hazard segmentation",
    place: "Gran Via / Balmes · Eixample",
    center: [2.16495, 41.38695],
    workload: "12 fps roadway segmentation · 2.8 MB/frame",
    description: "A connected vehicle sends an urgent road-hazard frame to the lowest feasible execution tier.",
    observed: {
      trafficState: "Dense, moving",
      road: "Gran Via de les Corts Catalanes",
      capturedAt: "Deterministic scenario fixture",
      source: "Local example; not measured traffic",
    },
    contextPhoto: {
      image: "/context/gran-via.jpg",
      alt: "Real street-level photograph of dense vehicle traffic on Gran Via in Barcelona",
      caption: "Historic Gran Via traffic context during the April 2025 blackout; reference photography only, not scenario telemetry.",
      author: "Pere López Brosa",
      capturedAt: "28 April 2025",
      license: "CC BY-SA 4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Apagada_2025_a_Barcelona_-_20250428_171402.jpg",
      cameraCoordinates: "41.383820, 2.160500",
      distanceFromScenario: "approximately 510 m from this scenario map center",
    },
    defaultPolicy: "adaptive",
    privacy: "internal",
    ueId: "AV-07",
    telemetry: {
      latencyBiasMs: 0,
      throughputBaseMbps: 842,
      queueBase: 12,
      taskNumberBase: 7842,
      sliceUtilization: [63, 47, 29],
    },
    route: [
      [2.16403, 41.38672],
      [2.16437, 41.38678],
      [2.16475, 41.38684],
      [2.16513, 41.3869],
      [2.16553, 41.38696],
      [2.16591, 41.38702],
    ],
    trafficGeometry: [
      [
        [2.16403, 41.38672],
        [2.16451, 41.3868],
        [2.16502, 41.38688],
        [2.16551, 41.38696],
        [2.16594, 41.38703],
      ],
      [
        [2.16408, 41.38665],
        [2.16458, 41.38673],
        [2.16508, 41.38681],
        [2.16557, 41.38689],
      ],
    ],
  },
  {
    id: "placa-vision",
    shortLabel: "Plaça",
    title: "Dense vision uplink",
    place: "Plaça Universitat approach",
    center: [2.16518, 41.38725],
    workload: "Six public-space camera streams · 42 Mbps",
    description: "A burst of public video traffic challenges eMBB capacity while a latency-sensitive stream remains protected.",
    observed: {
      trafficState: "High occupancy",
      road: "Carrer de Pelai approach",
      capturedAt: "Deterministic scenario fixture",
      source: "Local example; not measured traffic",
    },
    contextPhoto: {
      image: "/context/placa-universitat.jpg",
      alt: "Real street-level photograph of Plaça Universitat in Barcelona with pedestrians, taxis, and buildings",
      caption: "Plaça Universitat street context; reference photography only, not a live camera or scenario input.",
      author: "Pere López Brosa",
      capturedAt: "11 July 2020",
      license: "CC BY-SA 3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Pla%C3%A7a_Universitat_-_20200711_183028.jpg",
      cameraCoordinates: "41.384444, 2.163611",
      distanceFromScenario: "approximately 340 m from this scenario map center",
    },
    defaultPolicy: "latency",
    privacy: "public",
    ueId: "CAM-PLACA-03",
    telemetry: {
      latencyBiasMs: 3.6,
      throughputBaseMbps: 706,
      queueBase: 20,
      taskNumberBase: 9100,
      sliceUtilization: [56, 82, 38],
    },
    route: [
      [2.16418, 41.38753],
      [2.16455, 41.3874],
      [2.16493, 41.38728],
      [2.1653, 41.38716],
      [2.16567, 41.38704],
    ],
    trafficGeometry: [
      [
        [2.16412, 41.38758],
        [2.16455, 41.38743],
        [2.165, 41.38729],
        [2.16547, 41.38713],
      ],
      [
        [2.1644, 41.38767],
        [2.16477, 41.38752],
        [2.16516, 41.38737],
        [2.16558, 41.3872],
      ],
      [
        [2.16418, 41.38733],
        [2.16465, 41.3872],
        [2.16512, 41.38706],
      ],
    ],
  },
  {
    id: "privacy-camera",
    shortLabel: "Privacy",
    title: "Restricted camera inference",
    place: "Carrer de Balmes · Eixample",
    center: [2.16555, 41.38685],
    workload: "Restricted incident frame · 6.1 MB",
    description: "A privacy policy keeps identifiable imagery on the originating device even when cloud compute is faster.",
    observed: {
      trafficState: "Moderate",
      road: "Carrer de Balmes",
      capturedAt: "Deterministic scenario fixture",
      source: "Local example; not measured traffic",
    },
    contextPhoto: {
      image: "/context/balmes-night.jpg",
      alt: "Real nighttime street photograph of Carrer de Balmes in Barcelona",
      caption: "Carrer de Balmes nighttime context; reference photography only, not a surveillance feed or scenario input.",
      author: "Freepenguin",
      capturedAt: "3 June 2012",
      license: "CC BY-SA 3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Barcelona_3495.JPG",
      cameraCoordinates: "not published by the source",
      distanceFromScenario: "distance not asserted",
    },
    defaultPolicy: "privacy",
    privacy: "restricted",
    ueId: "CAM-BALMES-11",
    telemetry: {
      latencyBiasMs: 1.4,
      throughputBaseMbps: 512,
      queueBase: 16,
      taskNumberBase: 1160,
      sliceUtilization: [69, 41, 47],
    },
    route: [
      [2.16537, 41.38623],
      [2.1654, 41.38655],
      [2.16544, 41.38688],
      [2.16548, 41.3872],
      [2.16552, 41.38756],
    ],
    trafficGeometry: [
      [
        [2.16535, 41.38623],
        [2.16539, 41.38665],
        [2.16543, 41.38708],
        [2.16549, 41.38757],
      ],
      [
        [2.16554, 41.38626],
        [2.16558, 41.3867],
        [2.16562, 41.38714],
        [2.16566, 41.38755],
      ],
    ],
  },
];

export type NetworkAsset = {
  id: string;
  kind: "gnb" | "mec" | "ue";
  name: string;
  point: GeoPoint;
  detail: string;
};

export const fixedAssets: NetworkAsset[] = [
  {
    id: "gnb-west",
    kind: "gnb",
    name: "gNB-WEST",
    point: [2.16432, 41.38682],
    detail: "SIMULATED · n78 · 100 MHz · 3 sectors",
  },
  {
    id: "gnb-central",
    kind: "gnb",
    name: "gNB-CENTRAL",
    point: [2.16508, 41.38703],
    detail: "SIMULATED · n78 · 100 MHz · 3 sectors",
  },
  {
    id: "gnb-north",
    kind: "gnb",
    name: "gNB-NORTH",
    point: [2.16561, 41.38748],
    detail: "SIMULATED · n78 · 100 MHz · 3 sectors",
  },
  {
    id: "mec-west",
    kind: "mec",
    name: "MEC-WEST-02",
    point: [2.16445, 41.38648],
    detail: "SIMULATED · 2× L4 GPU · 42% compute",
  },
  {
    id: "mec-central",
    kind: "mec",
    name: "MEC-CENTRAL-01",
    point: [2.16532, 41.38712],
    detail: "SIMULATED · 4× L4 GPU · 58% compute",
  },
];

export function interpolateRoute(route: GeoPoint[], tick: number): GeoPoint {
  const progress = (tick % 100) / 100;
  const scaled = progress * (route.length - 1);
  const index = Math.min(route.length - 2, Math.floor(scaled));
  const fraction = scaled - index;
  const start = route[index];
  const end = route[index + 1];
  return [
    start[0] + (end[0] - start[0]) * fraction,
    start[1] + (end[1] - start[1]) * fraction,
  ];
}
