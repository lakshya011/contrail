// MapLibre loads its web worker from a URL next to its own module, which the bundler does not serve.
// Copy the worker into public/ so RouteMap can point setWorkerUrl at it.
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public/maplibre", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre/maplibre-gl-worker.mjs");
