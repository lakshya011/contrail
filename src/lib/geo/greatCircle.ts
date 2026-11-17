import greatCircle from "@turf/great-circle";
import { point } from "@turf/helpers";

export type LonLat = [number, number];

/** Great-circle arc between two points as one or more line strings (split at the antimeridian). */
export function arcCoordinates(from: LonLat, to: LonLat, npoints = 64): LonLat[][] {
  if (from[0] === to[0] && from[1] === to[1]) return [[from, to]];
  const g = greatCircle(point(from), point(to), { npoints });
  const geom = g.geometry;
  if (geom.type === "MultiLineString") return geom.coordinates as LonLat[][];
  return [geom.coordinates as LonLat[]];
}
