import { routes } from "../../../shared/catalog";
import type { TourState } from "../../../shared/types";

export function tourRoute(t: TourState) {
  return routes.find((r) => r.id === t.routeId);
}

export function tourTarget(t: TourState): string | null {
  return tourRoute(t)?.stops[t.step] || null;
}

/** Step-based progress, used by the panel when no live route is available. */
export function tourProgress(t: TourState): number {
  const r = tourRoute(t);
  if (!r) return 0;
  if (t.phase === "done") return 1;
  return Math.min(1, t.step / r.stops.length);
}
