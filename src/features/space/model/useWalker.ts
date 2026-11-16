import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Point } from "../../../shared/types";
import {
  BASE_NAV,
  type NavModel,
  escapeStep,
  isAtStop,
  isPointWalkable,
  stepFree,
  stepToward,
} from "../lib/nav";
import { distance } from "../lib/motion";

export type WalkKind = "route" | "escape";

export type WalkPlan = {
  path: Point[];
  stop: Point;
  kind: WalkKind;
};

export type WalkerHandlers = {
  onPosition?: (p: Point, auto: boolean) => void;
  onArrive?: (stop: Point, kind: WalkKind) => void;
  /** Keyboard input took over from an automatic route. */
  onManual?: () => void;
};

const SPEED = 2.5;
const WAYPOINT_TOLERANCE = 0.14;
const STOP_TOLERANCE = 0.1;

/**
 * Movement for free walking and guided navigation.  Every step goes through
 * the same navigation model the route planner uses, so a temporary hoarding
 * blocks a person exactly as it blocks the planner.
 *
 * Automatic walking is a plan (polyline + final stop).  The walker never
 * teleports: if a hoarding appears underfoot it walks out along legal ground,
 * and if a route becomes impossible its owner replans from the current spot.
 */
export function useWalker(
  nav: NavModel = BASE_NAV,
  handlers: WalkerHandlers = {},
) {
  const navRef = useRef(nav);
  navRef.current = nav;
  const [position, setPosition] = useState<Point>({ x: 3, z: 6.5 });
  const positionRef = useRef(position);
  const keys = useRef(new Set<string>());
  const yaw = useRef(0);
  const plan = useRef<WalkPlan | null>(null);
  const paused = useRef(false);
  const leg = useRef(1);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const isWalkKey = (key: string) =>
      [
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
      ].includes(key);

    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      const key = e.key.toLowerCase();
      if (!isWalkKey(key)) return;
      e.preventDefault();
      const freshBurst = keys.current.size === 0;
      keys.current.add(key);
      if (!freshBurst) return;
      // An automatic route is superseded by direct control.  The caller keeps
      // the route record if it still needs it (e.g. a paused tour).
      if (plan.current && plan.current.kind === "route") plan.current = null;
      paused.current = false;
      handlersRef.current.onManual?.();
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);

    let last = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const activeNav = navRef.current;
      let p = positionRef.current;
      const current = plan.current;
      const publish = (next: Point) => {
        positionRef.current = next;
        setPosition(next);
        handlersRef.current.onPosition?.(next, !!plan.current);
      };

      if (!isPointWalkable(activeNav, p)) {
        // A hoarding landed on the visitor, or the minimum width changed under
        // them.  Step out at walking speed; never jump to the door.
        const next = escapeStep(activeNav, p, dt * SPEED);
        if (distance(next, p) > 1e-5) publish(next);
      } else if (current && !paused.current) {
        if (isAtStop(p, current.stop, STOP_TOLERANCE)) {
          plan.current = null;
          handlersRef.current.onArrive?.(current.stop, current.kind);
          publish(p);
        } else {
          while (
            leg.current < current.path.length &&
            distance(p, current.path[leg.current]) < WAYPOINT_TOLERANCE
          ) {
            leg.current += 1;
          }
          const goal =
            leg.current < current.path.length
              ? current.path[leg.current]
              : current.stop;
          const next = stepToward(activeNav, p, goal, dt * SPEED);
          if (distance(next, p) > 1e-5) publish(next);
        }
      } else if (!paused.current) {
        const k = keys.current;
        const f =
          Number(k.has("w") || k.has("arrowup")) -
          Number(k.has("s") || k.has("arrowdown"));
        const s =
          Number(k.has("d") || k.has("arrowright")) -
          Number(k.has("a") || k.has("arrowleft"));
        if (f || s) {
          const length = Math.hypot(f, s);
          const step = (dt * SPEED) / length;
          const next = stepFree(activeNav, p, {
            x: (s * Math.cos(yaw.current) - f * Math.sin(yaw.current)) * step,
            z: (-f * Math.cos(yaw.current) - s * Math.sin(yaw.current)) * step,
          });
          if (distance(next, p) > 1e-5) publish(next);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const follow = useCallback((next: WalkPlan) => {
    if (!next.path.length) return;
    plan.current = {
      path: next.path.map((p) => ({ ...p })),
      stop: { ...next.stop },
      kind: next.kind,
    };
    leg.current = Math.min(1, Math.max(0, next.path.length - 1));
    paused.current = false;
  }, []);
  const clear = useCallback(() => {
    plan.current = null;
    paused.current = false;
  }, []);
  const pause = useCallback(() => {
    paused.current = true;
  }, []);
  const resume = useCallback(() => {
    paused.current = false;
  }, []);
  const isAutoWalking = useCallback(
    () => !!plan.current && plan.current.kind === "route",
    [],
  );
  const place = useCallback((p: Point) => {
    positionRef.current = p;
    setPosition(p);
    handlersRef.current.onPosition?.(p, false);
  }, []);

  return useMemo(
    () => ({
      position,
      positionRef,
      yaw,
      follow,
      clear,
      stop: clear,
      pause,
      resume,
      isAutoWalking,
      place,
    }),
    [position, follow, clear, pause, resume, isAutoWalking, place],
  );
}

export type Walker = ReturnType<typeof useWalker>;
