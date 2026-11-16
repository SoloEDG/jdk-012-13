import type { Point } from "../../../shared/types";
import { artworks } from "../../../shared/catalog";
import {
  type ArtworkRoutePlan,
  type FailureCode,
  type NavModel,
  type StopSide,
  findPath,
  hasLineOfSight,
  isPointWalkable,
  isSegmentWalkable,
  nearestPathIndex,
  pathLength,
  pathProgress,
  planArtworkRoute,
  whyBlocked,
} from "./nav";

export type RouteSource = "free" | "tour";

export type ActiveRoute = {
  artworkId: string;
  /** Exact point the visitor will stand at when the route completes. */
  stop: Point;
  path: Point[];
  stopSide: StopSide;
  stopLabel: string;
  source: RouteSource;
  /** Navigation-model version this route was planned against. */
  version: number;
  /** Path length when this route was created, for display. */
  total: number;
  /**
   * Journey progress already completed before this path segment started.
   * Progress is `base + (1 - base) * pathProgress(path, p)`, so replanning
   * never makes the displayed progress jump backwards.
   */
  base: number;
  startedAt: number;
  /**
   * True when the visitor took over manually (or paused) mid-route.  The route
   * is still replanned under changing rules so progress and the record remain
   * accurate, but the walker is not driven until the route is resumed.
   */
  suspended?: boolean;
  /**
   * Set when the route becomes unreachable: progress is pinned at this value
   * so repeated probes cannot drift it while the visitor waits.
   */
  frozenProgress?: number;
};

export type NavStatus =
  | { kind: "idle" }
  | {
      kind: "routing";
      artworkId: string;
      side: StopSide;
      label: string;
      source: RouteSource;
    }
  | {
      kind: "arrived";
      artworkId: string;
      side: StopSide;
      label: string;
      source: RouteSource;
    }
  | {
      kind: "displaced";
      artworkId: string | null;
      reason: string;
    }
  | {
      kind: "unreachable";
      artworkId: string;
      code: FailureCode;
      reason: string;
      source: RouteSource;
    };

export type RouteUpdate =
  | { kind: "kept"; route: ActiveRoute }
  | { kind: "replanned"; route: ActiveRoute }
  | {
      kind: "unreachable";
      route: ActiveRoute;
      code: FailureCode;
      reason: string;
    };

export function makeRoute(
  plan: ArtworkRoutePlan,
  artworkId: string,
  source: RouteSource,
  version: number,
  base = 0,
  startedAt = Date.now(),
): ActiveRoute {
  return {
    artworkId,
    stop: { ...plan.stop! },
    path: plan.path.map((p) => ({ ...p })),
    stopSide: plan.stopSide!,
    stopLabel: plan.stopLabel!,
    source,
    version,
    total: plan.distance,
    base: Math.min(1, Math.max(0, base)),
    startedAt,
  };
}

/** Overall journey progress, monotonic across replans. */
export function progressOf(route: ActiveRoute, p: Point): number {
  if (typeof route.frozenProgress === "number") return route.frozenProgress;
  const local = pathProgress(route.path, p);
  return Math.min(1, Math.max(0, route.base + (1 - route.base) * local));
}

export function remainingDistance(route: ActiveRoute, p: Point): number {
  if (route.path.length < 2) {
    return Math.hypot(route.stop.x - p.x, route.stop.z - p.z);
  }
  const idx = nearestPathIndex(route.path, p);
  let total = 0;
  let prev = p;
  for (let i = Math.max(1, idx); i < route.path.length; i++) {
    total += Math.hypot(route.path[i].x - prev.x, route.path[i].z - prev.z);
    prev = route.path[i];
  }
  total += Math.hypot(route.stop.x - prev.x, route.stop.z - prev.z);
  return total;
}

/**
 * Whether the not-yet-walked part of a route is still walkable.  Parts behind
 * the visitor are not re-validated, so a hoarding appearing behind you never
 * invalidates progress you have already made.
 */
export function isRouteWalkableFrom(
  nav: NavModel,
  route: ActiveRoute,
  p: Point,
): boolean {
  if (route.path.length < 2) return false;
  if (!isPointWalkable(nav, p)) return false;
  if (!isPointWalkable(nav, route.stop)) return false;
  const art = artworks.find((a) => a.id === route.artworkId);
  if (art && !hasLineOfSight(nav, route.stop, art.position)) return false;
  const idx = nearestPathIndex(route.path, p);
  const gap = Math.hypot(route.path[idx].x - p.x, route.path[idx].z - p.z);
  if (gap > 1.2) return false;
  for (let i = Math.max(1, idx); i < route.path.length; i++) {
    if (!isSegmentWalkable(nav, route.path[i - 1], route.path[i])) return false;
  }
  const last = route.path[route.path.length - 1];
  if (
    Math.hypot(last.x - route.stop.x, last.z - route.stop.z) > 0.02 &&
    !isSegmentWalkable(nav, last, route.stop)
  ) {
    return false;
  }
  return true;
}

function pathTo(
  nav: NavModel,
  p: Point,
  stop: Point,
): { path: Point[]; distance: number } | null {
  if (!isPointWalkable(nav, stop)) return null;
  const result = findPath(nav, p, stop);
  return result.ok ? { path: result.path, distance: result.distance } : null;
}

/**
 * Replanning policy, in priority order:
 *
 * 1. Route still walkable → keep it, including progress and chosen stop.
 * 2. Chosen stop still reachable → keep that stop, replace only the path.
 * 3. A different viewing side works → pick the best one.
 * 4. Nothing works → keep the route so progress/records stay consistent and
 *    report why.  The caller keeps the visitor exactly where they are.
 */
export function reconcileRoute(
  nav: NavModel,
  route: ActiveRoute,
  p: Point,
): RouteUpdate {
  const freeze = (r: ActiveRoute): ActiveRoute => ({
    ...r,
    version: nav.version,
    base: progressOf(r, p),
    frozenProgress: progressOf(r, p),
  });

  if (isPointWalkable(nav, p) && isRouteWalkableFrom(nav, route, p)) {
    // Route legal again.  If it had been frozen while unreachable, resume from
    // the frozen value so progress neither jumps nor drifts.
    const resumed =
      typeof route.frozenProgress === "number"
        ? { ...route, base: route.frozenProgress, frozenProgress: undefined }
        : route;
    return { kind: "kept", route: { ...resumed, version: nav.version } };
  }

  const art = artworks.find((a) => a.id === route.artworkId);
  if (!art) {
    return {
      kind: "unreachable",
      route: freeze(route),
      code: "blocked",
      reason: "作品不存在。",
    };
  }

  const base = progressOf(route, p);

  if (isPointWalkable(nav, p)) {
    const sameStop = pathTo(nav, p, route.stop);
    if (sameStop) {
      return {
        kind: "replanned",
        route: {
          ...route,
          path: sameStop.path,
          version: nav.version,
          total: sameStop.distance,
          base,
          frozenProgress: undefined,
        },
      };
    }
    const plan = planArtworkRoute(nav, p, art);
    if (plan.ok) {
      return {
        kind: "replanned",
        route: makeRoute(
          plan,
          route.artworkId,
          route.source,
          nav.version,
          base,
          route.startedAt,
        ),
      };
    }
    return {
      kind: "unreachable",
      route: freeze(route),
      code: plan.code || "blocked",
      reason: plan.reason || "暂时无法到达这件作品。",
    };
  }

  return {
    kind: "unreachable",
    route: freeze(route),
    code: "narrow",
    reason: whyBlocked(nav, p)?.code === "inside-barrier"
      ? "你正处在临时围挡的位置，正在移出；路线会从新的位置继续。"
      : `当前站立的位置窄于最小通行宽度 ${nav.settings.minWidth.toFixed(1)} 米，正在移出。`,
  };
}
