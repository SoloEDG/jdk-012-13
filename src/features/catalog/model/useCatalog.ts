import { useState } from "react";
import type { Point } from "../../../shared/types";
import { artworks } from "../../../shared/catalog";
import { arrivedAtArtwork, type NavModel, type StopSide } from "../../space/lib/nav";

export type Arrival = { artworkId: string; side: StopSide; distance: number };

/**
 * The artwork the visitor has genuinely reached: inside a viewing zone, on
 * legal ground, with an unobstructed line of sight.
 */
export function reachedArtwork(nav: NavModel, p: Point): Arrival | null {
  let best: Arrival | null = null;
  for (const a of artworks) {
    const stop = arrivedAtArtwork(nav, p, a);
    if (!stop) continue;
    const d = Math.hypot(p.x - stop.point.x, p.z - stop.point.z);
    if (!best || d < best.distance)
      best = { artworkId: a.id, side: stop.side, distance: d };
  }
  return best;
}

/**
 * `active` is what the right-hand panel shows; it changes only when the
 * visitor actually arrives.  `focus` is the requested destination and stays
 * separate so requesting a walk never rewrites the introduction early.
 */
export function useCatalog() {
  const [active, setActive] = useState<string | null>("a1");
  const [nearby, setNearbyState] = useState<string | null>(null);
  const [nearbySide, setNearbySide] = useState<StopSide | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  return {
    active,
    nearby,
    nearbySide,
    focus,
    select: (id: string | null) => setFocus(id),
    arrive: (id: string) => {
      setActive(id);
      setFocus((f) => (f === id ? null : f));
    },
    setNearby: (id: string | null, side: StopSide | null = null) => {
      setNearbyState((prev) => (prev === id ? prev : id));
      setNearbySide((prev) => (prev === side ? prev : side));
    },
    clearNearby: () => {
      setNearbyState(null);
      setNearbySide(null);
    },
    resetFocus: () => setFocus(null),
  };
}

export type Catalog = ReturnType<typeof useCatalog>;
