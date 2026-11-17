"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { arcCoordinates, type LonLat } from "@/lib/geo/greatCircle";

export type MapRoute = { from: LonLat; to: LonLat; count: number; key: string };
export type MapAirport = { iata: string; lon: number; lat: number; count: number; city?: string | null };

const STYLES = { light: "https://tiles.openfreemap.org/styles/positron", dark: "https://tiles.openfreemap.org/styles/dark" };
let workerSet = false;

/** Colours come from the page theme (globals.css), so the map follows day and night. */
function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    dark: css.colorScheme.includes("dark"),
    PAPER: v("--map-land"), WATER: v("--map-water"), INK_RED: v("--ink-red"), INK_BLUE: v("--ink-blue"), INK: v("--text"),
  };
}

/** Bumps whenever the theme changes (header switch or the system setting). */
function useThemeVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const bump = () => setV((x) => x + 1);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    window.addEventListener("contrail-theme", bump);
    mq.addEventListener("change", bump);
    return () => {
      window.removeEventListener("contrail-theme", bump);
      mq.removeEventListener("change", bump);
    };
  }, []);
  return v;
}

/** Routes drawn as great-circle arcs on a globe (or flat map), thicker for routes flown more often. */
export function RouteMap({
  routes, airports, globe = true, className = "h-[420px]", interactive = true,
}: { routes: MapRoute[]; airports: MapAirport[]; globe?: boolean; className?: string; interactive?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const themeVersion = useThemeVersion();

  useEffect(() => {
    if (!ref.current) return;
    if (!workerSet) {
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      workerSet = true;
    }
    const { dark, PAPER, WATER, INK_RED, INK_BLUE, INK } = themeColors();
    const map = new maplibregl.Map({
      container: ref.current,
      style: dark ? STYLES.dark : STYLES.light,
      center: [78, 20],
      zoom: 1.4,
      attributionControl: { compact: true },
      interactive,
    });

    const maxCount = Math.max(1, ...routes.map((r) => r.count));
    const lines = {
      type: "FeatureCollection" as const,
      features: routes.flatMap((r) =>
        arcCoordinates(r.from, r.to).map((coords) => ({
          type: "Feature" as const,
          properties: { w: r.count / maxCount, key: r.key, count: r.count },
          geometry: { type: "LineString" as const, coordinates: coords },
        })),
      ),
    };
    const points = {
      type: "FeatureCollection" as const,
      features: airports.map((a) => ({
        type: "Feature" as const,
        properties: { iata: a.iata, count: a.count, city: a.city ?? "" },
        geometry: { type: "Point" as const, coordinates: [a.lon, a.lat] },
      })),
    };

    map.on("style.load", () => {
      if (globe) map.setProjection({ type: "globe" });
      // Tint the light base map to aged paper with muted water.
      for (const layer of map.getStyle().layers ?? []) {
        try {
          if (layer.type === "background") map.setPaintProperty(layer.id, "background-color", PAPER);
          else if (layer.type === "fill" && /water|ocean|sea|lake/.test(layer.id)) map.setPaintProperty(layer.id, "fill-color", WATER);
          else if (layer.type === "fill" && /land|park|wood|grass|landuse/.test(layer.id)) map.setPaintProperty(layer.id, "fill-opacity", 0.25);
        } catch {
          /* layer without that paint property */
        }
      }
      map.addSource("routes", { type: "geojson", data: lines });
      map.addSource("airports", { type: "geojson", data: points });
      map.addLayer({
        id: "routes-glow", type: "line", source: "routes",
        paint: { "line-color": INK_RED, "line-opacity": 0.12, "line-blur": 2, "line-width": ["interpolate", ["linear"], ["get", "w"], 0, 4, 1, 10] },
      });
      map.addLayer({
        id: "routes", type: "line", source: "routes",
        layout: { "line-cap": "round" },
        paint: { "line-color": INK_RED, "line-dasharray": [2, 1.5], "line-opacity": ["interpolate", ["linear"], ["get", "w"], 0, 0.55, 1, 1], "line-width": ["interpolate", ["linear"], ["get", "w"], 0, 1.2, 1, 3.5] },
      });
      map.addLayer({
        id: "airports", type: "circle", source: "airports",
        paint: {
          "circle-color": INK_BLUE, "circle-stroke-color": PAPER, "circle-stroke-width": 1.5,
          "circle-radius": ["interpolate", ["linear"], ["get", "count"], 1, 3.5, 40, 9],
        },
      });
      map.addLayer({
        id: "airport-labels", type: "symbol", source: "airports", minzoom: 2.2,
        layout: { "text-field": ["get", "iata"], "text-size": 11, "text-offset": [0, 1.1], "text-font": ["Noto Sans Regular"] },
        paint: { "text-color": INK, "text-halo-color": PAPER, "text-halo-width": 1.4 },
      });

      if (airports.length) {
        const b = new maplibregl.LngLatBounds();
        airports.forEach((a) => b.extend([a.lon, a.lat]));
        const span = b.getEast() - b.getWest();
        if (globe && span > 120) {
          // Routes circle the world: face the airport you use most instead of zooming out to nothing.
          const hub = [...airports].sort((x, y) => y.count - x.count)[0];
          map.jumpTo({ center: [hub.lon, hub.lat], zoom: 1.6 });
        } else {
          map.fitBounds(b, { padding: 60, maxZoom: 5, duration: 0 });
        }
      }
    });

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "text-black" });
    map.on("mouseenter", "airports", (e) => {
      map.getCanvas().style.cursor = "pointer";
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as { iata: string; count: number; city: string };
      popup.setLngLat((f.geometry as GeoJSON.Point).coordinates as LonLat)
        .setHTML(`<strong>${p.iata}</strong> ${p.city}<br/>${p.count} visit${p.count === 1 ? "" : "s"}`)
        .addTo(map);
    });
    map.on("mouseleave", "airports", () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });

    return () => map.remove();
  }, [routes, airports, globe, interactive, themeVersion]);

  return <div ref={ref} className={`w-full overflow-hidden rounded-[14px] border border-line bg-[var(--map-land)] ${className}`} />;
}
