import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the Barcelona evidence-first operations workbench", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /NEXUS/);
  assert.match(html, /Barcelona Edge Operations Workbench/);
  assert.match(html, /Road-hazard segmentation/);
  assert.match(html, /REFERENCE PHOTO/);
  assert.match(html, /OBSERVED MAP/);
  assert.match(html, /AUTHORED FIXTURE/);
  assert.match(html, /COMPUTED/);
  assert.match(html, /gran-via\.jpg/);
  assert.match(html, /Nearby city context · not the mapped scene · not live · not a simulator input/);
  assert.match(html, /ACCESS · SIMULATED FIXTURE/);
  assert.match(html, /41\.383820, 2\.160500/);
  assert.match(html, /Inspect scheduler/);
  assert.doesNotMatch(html, /Metro autonomy/);
  assert.doesNotMatch(html, /low-poly/i);
});

test("ships a bounded, attributed OpenStreetMap extract", async () => {
  const raw = await readFile(new URL("../public/data/barcelona-eixample.geojson", import.meta.url), "utf8");
  const extract = JSON.parse(raw);
  assert.deepEqual(extract.bbox, [2.164, 41.3862, 2.166, 41.3877]);
  assert.equal(extract.provenance.license, "ODbL 1.0");
  assert.match(extract.provenance.source, /OpenStreetMap contributors/);
  assert.equal(extract.features.length, 85);
  assert.ok(extract.features.some((feature) => feature.properties.kind === "building"));
  assert.ok(extract.features.some((feature) => feature.properties.name === "Carrer de Balmes"));
});

test("ships real, licensed Barcelona context photographs rather than generated scenery", async () => {
  const [granVia, placa, balmes, readme] = await Promise.all([
    readFile(new URL("../public/context/gran-via.jpg", import.meta.url)),
    readFile(new URL("../public/context/placa-universitat.jpg", import.meta.url)),
    readFile(new URL("../public/context/balmes-night.jpg", import.meta.url)),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);
  assert.ok(granVia.byteLength > 500_000);
  assert.ok(placa.byteLength > 500_000);
  assert.ok(balmes.byteLength > 500_000);
  assert.match(readme, /Pere López Brosa/);
  assert.match(readme, /Freepenguin/);
  assert.match(readme, /CC BY-SA/);
});

test("keeps mobile provenance, export, and replay-speed controls visible and documents the geographic map accurately", async () => {
  const [styles, readme] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(
    styles,
    /\.ops-actions button:first-child,\s*\.ops-actions button:nth-child\(2\)\s*\{\s*display:\s*none/,
  );
  assert.doesNotMatch(
    styles,
    /\.decision-path > div:nth-of-type\(2\)\s*\{\s*display:\s*none/,
  );
  assert.match(styles, /\.decision-path \{\s*[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(styles, /\.street-evidence figcaption span \{ display: block;/);
  assert.match(styles, /\.replay-bar > label \{ display: flex; gap: 4px; \}/);
  assert.doesNotMatch(readme, /3D scene|WebGL scene/i);
  assert.match(readme, /normalized only while scoring/);
  assert.match(readme, /not the mapped scene/);
});
