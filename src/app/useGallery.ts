import { useCallback, useEffect, useRef, useState } from "react";
import type { Point } from "../shared/types";
import { artworkById, artworks } from "../shared/catalog";
import { useWalker } from "../features/space/model/useWalker";
import { useNav } from "../features/space/model/useNav";
import {
  arrivedAtArtwork,
  isPointWalkable,
  planArtworkRoute,
  stopYaw,
  type ArtworkRoutePlan,
  type NavModel,
  type StopSide,
} from "../features/space/lib/nav";
import {
  type ActiveRoute,
  type NavStatus,
  makeRoute,
  progressOf,
  reconcileRoute,
  remainingDistance,
} from "../features/space/lib/route";
import { useCatalog } from "../features/catalog";
import { useNarration } from "../features/narration";
import { useTour } from "../features/tours";
import { useCollection } from "../features/collection";

/** Radius around a viewing stop that counts as standing at the artwork. */
const ARRIVAL_TOLERANCE = 0.4;
const RECONCILE_INTERVAL = 450;

function forwardPath(route: ActiveRoute, from: Point): Point[] {
  let idx = 0;
  let best = Infinity;
  for (let i = 0; i < route.path.length; i++) {
    const d = Math.hypot(route.path[i].x - from.x, route.path[i].z - from.z);
    if (d < best) {
      best = d;
      idx = i;
    }
  }
  const points = route.path.slice(idx).map((p) => ({ ...p }));
  if (!points.length) return [from, { ...route.stop }];
  points[0] = { x: from.x, z: from.z };
  const last = points[points.length - 1];
  if (Math.hypot(last.x - route.stop.x, last.z - route.stop.z) > 0.02)
    points.push({ ...route.stop });
  return points;
}

export function useGallery() {
  const nav = useNav();
  const catalog = useCatalog();
  const tour = useTour();
  const collection = useCollection();

  const [route, setRoute] = useState<ActiveRoute | null>(null);
  const [status, setStatus] = useState<NavStatus>({ kind: "idle" });
  const [autoWalk, setAutoWalk] = useState(false);

  const routeRef = useRef<ActiveRoute | null>(null);
  const navRef = useRef<NavModel>(nav.model);
  const tourRef = useRef(tour.state);
  const tourApi = useRef(tour);
  const catalogRef = useRef(catalog);

  navRef.current = nav.model;
  tourRef.current = tour.state;
  tourApi.current = tour;
  catalogRef.current = catalog;

  const setRouteBoth = useCallback((next: ActiveRoute | null) => {
    routeRef.current = next;
    setRoute(next);
  }, []);

  const narration = useNarration(() => {
    const t = tourRef.current;
    if (t.phase === "listening") tourApi.current.next();
  });
  const narrationRef = useRef(narration);
  narrationRef.current = narration;

  /* ------------------------------------------------------------------ */
  /* Planning from the current position                                  */
  /* ------------------------------------------------------------------ */

  const walkerRef = useRef<ReturnType<typeof useWalker> | null>(null);
  const here = () =>
    walkerRef.current
      ? { ...walkerRef.current.positionRef.current }
      : { x: 3, z: 6.5 };

  const planFor = useCallback(
    (artworkId: string): ArtworkRoutePlan => {
      const art = artworkById(artworkId);
      if (!art) {
        return {
          ok: false,
          stop: null,
          stopSide: null,
          stopLabel: null,
          path: [],
          distance: Infinity,
          code: "blocked",
          reason: "作品不存在。",
        };
      }
      return planArtworkRoute(navRef.current, here(), art);
    },
    [],
  );

  /* ------------------------------------------------------------------ */
  /* Arrival                                                             */
  /* ------------------------------------------------------------------ */

  const arriveAt = useCallback(
    (
      artworkId: string,
      side: StopSide,
      label: string,
      source: "free" | "tour",
    ) => {
      const art = artworkById(artworkId);
      setRouteBoth(null);
      setAutoWalk(false);
      setStatus({ kind: "arrived", artworkId, side, label, source });
      catalogRef.current.arrive(artworkId);
      catalogRef.current.setNearby(artworkId, side);
      const walker = walkerRef.current;
      if (walker) {
        walker.clear();
        if (art) walker.yaw.current = stopYaw(art, side);
      }
      if (source === "tour" && tourRef.current.phase === "walking") {
        tourApi.current.arrive();
        if (art) narrationRef.current.play(art.id);
      }
    },
    [setRouteBoth],
  );
  const arriveRef = useRef(arriveAt);
  arriveRef.current = arriveAt;

  /* ------------------------------------------------------------------ */
  /* Walker                                                              */
  /* ------------------------------------------------------------------ */

  const walker = useWalker(nav.model, {
    onPosition: (p) => {
      const model = navRef.current;
      if (!isPointWalkable(model, p)) {
        catalogRef.current.clearNearby();
        return;
      }
      const currentRoute = routeRef.current;
      if (currentRoute) {
        const art = artworkById(currentRoute.artworkId);
        if (!art) return;
        const reached = arrivedAtArtwork(
          model,
          p,
          art,
          ARRIVAL_TOLERANCE,
        );
        if (reached) {
          arriveRef.current(
            art.id,
            reached.side,
            reached.label,
            currentRoute.source,
          );
          return;
        }
        // A suspended route (manual takeover) still remembers its target, but
        // no longer owns the feet: fall through to free-walk proximity.
        if (!currentRoute.suspended) return;
      }

      // Free walking: proximity alone is a hint.  The panel changes only once
      // a legal viewing position with a clear sightline has been reached.
      let bestId: string | null = null;
      let bestSide: StopSide | null = null;
      let bestD = Infinity;
      for (const art of artworks) {
        const reached = arrivedAtArtwork(model, p, art);
        if (!reached) continue;
        const d = Math.hypot(p.x - reached.point.x, p.z - reached.point.z);
        if (d < bestD) {
          bestD = d;
          bestId = art.id;
          bestSide = reached.side;
        }
      }
      catalogRef.current.setNearby(bestId, bestSide);
      const atTourStop = tourRef.current.phase === "listening";
      const quiet = tourRef.current.phase === "idle" || tourRef.current.phase === "done";
      if (bestId && quiet) {
        if (bestId !== catalogRef.current.active) {
          catalogRef.current.arrive(bestId);
          const art = artworkById(bestId);
          if (art && bestSide) walker.yaw.current = stopYaw(art, bestSide);
        }
        // Reaching a different work on foot retires a suspended route to the
        // old target; its record is intentionally dropped, not resurrected.
        if (currentRoute && currentRoute.artworkId !== bestId) {
          setRouteBoth(null);
          setStatus({ kind: "arrived", artworkId: bestId, side: bestSide!, label: "", source: "free" });
        }
      } else if (atTourStop && bestId && bestId !== tourApi.current.target) {
        // Never let casual walking during a narration switch the panel to a
        // different artwork; the tour keeps its own stop.
        catalogRef.current.arrive(tourApi.current.target!);
      }
    },
    onArrive: (_stop, kind) => {
      if (kind === "escape") {
        if (routeRef.current) reconcileRef.current();
        else setStatus({ kind: "idle" });
      } else {
        checkArrivalRef.current();
      }
    },
    onManual: () => {
      if (!routeRef.current) return;
      // The walker has already dropped its automatic plan.  Free walking is
      // now in charge; a tour keeps its step and pauses in place.
      const suspended = { ...routeRef.current, suspended: true };
      setRouteBoth(suspended);
      setAutoWalk(false);
      setStatus({ kind: "idle" });
      const phase = tourRef.current.phase;
      if (phase === "walking") {
        tourApi.current.pause();
        tourApi.current.setNotice({
          kind: "info",
          text: "已改为自由行走，导览暂停在这一站。可随时继续导览或结束。",
        });
      }
    },
  });
  walkerRef.current = walker;

  const checkArrival = useCallback(() => {
    const current = routeRef.current;
    if (!current) return;
    const p = walker.positionRef.current;
    const model = navRef.current;
    if (!isPointWalkable(model, p)) return;
    const art = artworkById(current.artworkId);
    if (!art) return;
    const reached = arrivedAtArtwork(model, p, art, ARRIVAL_TOLERANCE);
    if (reached)
      arriveRef.current(art.id, reached.side, reached.label, current.source);
  }, [walker]);
  const checkArrivalRef = useRef(checkArrival);
  checkArrivalRef.current = checkArrival;

  /* ------------------------------------------------------------------ */
  /* Travel and reconciliation                                           */
  /* ------------------------------------------------------------------ */

  const followRoute = useCallback(
    (next: ActiveRoute, from: Point) => {
      const art = artworkById(next.artworkId);
      if (art) walker.yaw.current = stopYaw(art, next.stopSide);
      walker.follow({ path: forwardPath(next, from), stop: next.stop, kind: "route" });
      setAutoWalk(true);
    },
    [walker],
  );

  const travel = useCallback(
    (artworkId: string, source: "free" | "tour"): ArtworkRoutePlan => {
      const plan = planFor(artworkId);
      if (!plan.ok || !plan.stop) {
        setRouteBoth(null);
        setAutoWalk(false);
        walker.clear();
        catalogRef.current.clearNearby();
        setStatus({
          kind: "unreachable",
          artworkId,
          code: plan.code || "blocked",
          reason: plan.reason || "暂时无法到达这件作品。",
          source,
        });
        return plan;
      }
      const prior = routeRef.current;
      // Retrying the same destination must not reset the journey progress
      // that was already earned on this leg.
      const base =
        prior && prior.artworkId === artworkId
          ? progressOf(prior, here())
          : 0;
      const next = makeRoute(
        plan,
        artworkId,
        source,
        navRef.current.version,
        base,
      );
      setRouteBoth(next);
      setStatus({
        kind: "routing",
        artworkId,
        side: next.stopSide,
        label: next.stopLabel,
        source,
      });
      followRoute(next, here());
      return plan;
    },
    [followRoute, planFor, setRouteBoth, walker],
  );

  const go = useCallback(
    (id: string) => {
      catalogRef.current.select(id);
      // An explicit request supersedes whatever the tour was doing.  The tour
      // is ended rather than left listening to a work the visitor left behind.
      if (tourRef.current.phase !== "idle") {
        tourApi.current.stop();
        narration.pause();
      }
      travel(id, "free");
    },
    [narration, travel],
  );

  const reconcileNow = useCallback(() => {
    const current = routeRef.current;
    if (!current) return;
    const model = navRef.current;
    const p = walker.positionRef.current;
    if (!isPointWalkable(model, p)) return; // walker is stepping out of a hoarding

    const update = reconcileRoute(model, current, p);
    if (update.kind === "unreachable") {
      setRouteBoth(update.route);
      setAutoWalk(false);
      // Stop auto-walking but keep free walking available: the visitor may
      // want to step aside so the next station becomes reachable again.
      walker.clear();
      catalogRef.current.clearNearby();
      setStatus({
        kind: "unreachable",
        artworkId: current.artworkId,
        code: update.code,
        reason: update.reason,
        source: current.source,
      });
      if (current.source === "tour" && tourRef.current.phase !== "idle") {
        narrationRef.current.pause();
        tourApi.current.wait(update.reason);
      }
      return;
    }

    const next = update.route;
    setRouteBoth(next);
    if (tourRef.current.phase === "paused" || current.suspended) {
      // Keep the new plan and progress, but do not take control of the feet:
      // the visitor took over manually (or paused) mid-route.
      return;
    }
    if (update.kind === "replanned" || !walker.isAutoWalking()) {
      followRoute(next, p);
    }
    walker.resume();
    setAutoWalk(true);
    setStatus({
      kind: "routing",
      artworkId: next.artworkId,
      side: next.stopSide,
      label: next.stopLabel,
      source: next.source,
    });
    if (tourRef.current.phase === "waiting") tourApi.current.retry();
  }, [followRoute, setRouteBoth, walker]);

  const reconcileRef = useRef(reconcileNow);
  reconcileRef.current = reconcileNow;

  /* ------------------------------------------------------------------ */
  /* Reactions to rule changes                                           */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    const p = walker.positionRef.current;
    if (!isPointWalkable(nav.model, p)) {
      // A hoarding landed underfoot.  Keep the route record intact and step
      // out at walking speed; the reconciler resumes once legal again.
      setStatus({
        kind: "displaced",
        artworkId: routeRef.current?.artworkId || null,
        reason: "临时围挡正好落在脚下，正在移动到最近的通行位置。",
      });
      catalogRef.current.clearNearby();
      return;
    }
    reconcileNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.model]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      // Probe arrival in case the walker stopped without a position change.
      checkArrivalRef.current();
      reconcileRef.current();
    }, RECONCILE_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  /* ------------------------------------------------------------------ */
  /* Tour driving                                                        */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    const state = tour.state;
    if (state.phase !== "walking" || !state.routeId) return;
    const target = tour.target;
    if (!target) return;
    const current = routeRef.current;
    if (current && current.source === "tour" && current.artworkId === target)
      return;
    const plan = travel(target, "tour");
    if (!plan.ok) {
      walker.pause();
      narration.pause();
      catalogRef.current.clearNearby();
      tour.wait(plan.reason || "下一站暂时不可达。");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.state.phase, tour.state.routeId, tour.state.step, tour.target]);

  // While waiting, keep checking whether the next stop became reachable again.
  const waiting = tour.state.phase === "waiting";
  useEffect(() => {
    if (!waiting) return;
    const target = tour.target;
    if (!target) return;
    const attempt = () => {
      const art = artworkById(target);
      if (!art) return;
      // If a frozen route is still on record, the reconciler owns recovery:
      // it keeps the visitor's progress and stop consistent.  This fallback
      // only matters when the failure happened before any route existed.
      if (routeRef.current) return;
      const plan = planArtworkRoute(navRef.current, here(), art);
      if (!plan.ok) return;
      walker.clear();
      tour.retry();
    };
    attempt();
    const timer = window.setInterval(attempt, RECONCILE_INTERVAL);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, tour.target, nav.model]);

  const startTour = useCallback(
    (id: string) => {
      narration.pause();
      setRouteBoth(null);
      walker.clear();
      setAutoWalk(false);
      catalogRef.current.clearNearby();
      setStatus({ kind: "idle" });
      tour.start(id);
    },
    [narration, setRouteBoth, tour, walker],
  );

  const pauseTour = useCallback(() => {
    tour.pause();
    walker.pause();
    narration.pause();
  }, [tour, walker, narration]);

  const resumeTour = useCallback(() => {
    const state = tour.state;
    if (state.phase !== "paused") return;
    const resumePhase = state.resumePhase;
    tour.resume();
    if (resumePhase === "listening") {
      narration.resume();
      return;
    }
    walker.resume();
    const current = routeRef.current;
    if (current && current.source === "tour") {
      // Reconcile against the current spot rather than reusing the path that
      // was planned before the visitor took over the controls.
      const revived = { ...current, suspended: false };
      const update = reconcileRoute(navRef.current, revived, here());
      if (update.kind === "unreachable") {
        setRouteBoth(update.route);
        walker.clear();
        setStatus({
          kind: "unreachable",
          artworkId: revived.artworkId,
          code: update.code,
          reason: update.reason,
          source: "tour",
        });
        tour.wait(update.reason);
        return;
      }
      setRouteBoth(update.route);
      followRoute(update.route, here());
      setStatus({
        kind: "routing",
        artworkId: update.route.artworkId,
        side: update.route.stopSide,
        label: update.route.stopLabel,
        source: update.route.source,
      });
    } else if (tour.target) {
      travel(tour.target, "tour");
    }
  }, [tour, walker, narration, followRoute, travel, setRouteBoth]);

  const stopTour = useCallback(() => {
    tour.stop();
    setRouteBoth(null);
    walker.clear();
    setAutoWalk(false);
    narration.pause();
    setStatus({ kind: "idle" });
  }, [tour, narration, setRouteBoth, walker]);

  const nextTour = useCallback(() => {
    if (tour.state.phase !== "listening" && tour.state.phase !== "paused")
      return;
    narration.pause();
    setRouteBoth(null);
    walker.clear();
    setAutoWalk(false);
    tour.next();
  }, [tour, narration, setRouteBoth, walker]);

  /* ------------------------------------------------------------------ */
  /* Dwell recording                                                     */
  /* ------------------------------------------------------------------ */

  const dwell = useRef({ nearby: catalog.nearby, record: collection.record });
  dwell.current = { nearby: catalog.nearby, record: collection.record };
  useEffect(() => {
    const timer = window.setInterval(() => {
      // Only genuine proximity counts, and proximity is cleared the moment a
      // hoarding hides the artwork or the visitor is displaced.
      if (dwell.current.nearby) dwell.current.record(dwell.current.nearby, 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return {
    nav,
    catalog,
    tour,
    collection,
    walker,
    narration,
    route,
    status,
    autoWalk,
    // Monotonic: `base` is frozen at each replan and only the remaining path
    // contributes, so waiting or probing never moves it backwards.
    progress: route ? progressOf(route, walker.position) : 0,
    distanceLeft: route ? remainingDistance(route, walker.position) : 0,
    go,
    startTour,
    pauseTour,
    resumeTour,
    stopTour,
    nextTour,
  };
}

export type Gallery = ReturnType<typeof useGallery>;
