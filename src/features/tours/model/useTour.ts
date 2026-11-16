import { useState } from "react";
import type { TourState } from "../../../shared/types";
import { routes } from "../../../shared/catalog";
import { tourTarget, tourRoute } from "../lib/routeProgress";

const initial: TourState = { routeId: null, step: 0, phase: "idle" };

export type TourNotice = { kind: "info" | "warning"; text: string } | null;

/**
 * Guided-tour state machine.  Phases:
 *
 * - walking: on the way to `step`; narration must not start yet.
 * - listening: physically arrived, narration running.
 * - paused: user paused; walker and narration also pause.
 * - waiting: current stop is unreachable; position and step are preserved.
 * - done: all stops visited.
 */
export function useTour() {
  const [state, setState] = useState<TourState>(initial);
  const [notice, setNotice] = useState<TourNotice>(null);

  return {
    state,
    notice,
    setNotice,
    target: tourTarget(state),
    route: tourRoute(state),
    start: (id: string) => {
      if (!routes.some((r) => r.id === id)) return;
      setNotice(null);
      setState({ routeId: id, step: 0, phase: "walking" });
    },
    /** Only valid while walking; keeps `step` untouched otherwise. */
    arrive: () =>
      setState((t) =>
        t.phase === "walking" ? { ...t, phase: "listening" } : t,
      ),
    /** Called when the current stop truly completes. */
    next: () =>
      setState((t) => {
        const r = tourRoute(t);
        if (!r || t.phase === "idle") return t;
        return t.step + 1 >= r.stops.length
          ? { ...t, phase: "done", resumePhase: undefined, reason: undefined }
          : {
              ...t,
              step: t.step + 1,
              phase: "walking",
              resumePhase: undefined,
              reason: undefined,
            };
      }),
    /** Keep the current step and position while a stop is unreachable. */
    wait: (reason: string) =>
      setState((t) =>
        t.phase === "idle" || t.phase === "done"
          ? t
          : { ...t, phase: "waiting", reason },
      ),
    /** Retry the current stop after the rules change again. */
    retry: () =>
      setState((t) =>
        t.phase === "waiting"
          ? { ...t, phase: "walking", reason: undefined }
          : t,
      ),
    pause: () =>
      setState((t) =>
        t.phase === "walking" || t.phase === "listening"
          ? { ...t, phase: "paused", resumePhase: t.phase }
          : t,
      ),
    /**
     * Resume to the phase the tour was in: a walking tour keeps walking to the
     * same stop; a listening tour resumes narration in place.
     */
    resume: () =>
      setState((t) =>
        t.phase === "paused"
          ? { ...t, phase: t.resumePhase || "walking", resumePhase: undefined }
          : t,
      ),
    stop: () => {
      setNotice(null);
      setState(initial);
    },
  };
}

export type Tour = ReturnType<typeof useTour>;
