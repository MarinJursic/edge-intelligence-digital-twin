import { readFile, writeFile } from "node:fs/promises";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) {
  throw new Error("usage: node scripts/import_osm_extract.mjs source.osm destination.geojson");
}

const xml = await readFile(source, "utf8");
const nodes = new Map();
for (const match of xml.matchAll(/<node id="(\d+)"[^>]*lat="([^"]+)" lon="([^"]+)"[^>]*\/?>/g)) {
  nodes.set(match[1], [Number(match[3]), Number(match[2])]);
}

const features = [];
let buildingCount = 0;
for (const match of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
  const [, id, body] = match;
  const tags = Object.fromEntries(
    [...body.matchAll(/<tag k="([^"]+)" v="([^"]*)"\/>/g)].map((tag) => [
      tag[1],
      tag[2]
        .replaceAll("&quot;", '"')
        .replaceAll("&amp;", "&")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">"),
    ]),
  );
  const isRoad = Boolean(tags.highway);
  const isBuilding = Boolean(tags.building);
  if (!isRoad && !isBuilding) continue;
  if (isBuilding && buildingCount >= 70) continue;

  let coordinates = [...body.matchAll(/<nd ref="(\d+)"\/>/g)]
    .map((node) => nodes.get(node[1]))
    .filter(Boolean);
  if (coordinates.length < 2) continue;
  if (coordinates.length > 18) {
    const last = coordinates.at(-1);
    coordinates = coordinates.filter((_, index) => index % 3 === 0);
    if (last && coordinates.at(-1) !== last) coordinates.push(last);
  }

  if (isBuilding) {
    if (
      coordinates[0][0] !== coordinates.at(-1)[0] ||
      coordinates[0][1] !== coordinates.at(-1)[1]
    ) {
      coordinates.push(coordinates[0]);
    }
    buildingCount += 1;
  }
  features.push({
    type: "Feature",
    properties: {
      osm_id: Number(id),
      kind: isRoad ? "road" : "building",
      name: tags.name || null,
      highway: tags.highway || null,
      building: tags.building || null,
      levels: Number(tags["building:levels"] || 3),
      source: "OpenStreetMap",
    },
    geometry: isBuilding
      ? { type: "Polygon", coordinates: [coordinates] }
      : { type: "LineString", coordinates },
  });
}

const collection = {
  type: "FeatureCollection",
  name: "Barcelona Eixample · Gran Via / Balmes",
  bbox: [2.164, 41.3862, 2.166, 41.3877],
  provenance: {
    source: "© OpenStreetMap contributors",
    license: "ODbL 1.0",
    source_url: "https://www.openstreetmap.org/copyright",
    extraction_endpoint: "https://api.openstreetmap.org/api/0.6/map",
    extracted_at: "2026-07-26T09:24:00Z",
    query_bbox: "2.1640,41.3862,2.1660,41.3877",
    note: "A compact deterministic extract; radio and compute overlays are simulated.",
  },
  features,
};

await writeFile(destination, `${JSON.stringify(collection)}\n`);
console.log(`wrote ${features.length} features (${buildingCount} buildings) to ${destination}`);
