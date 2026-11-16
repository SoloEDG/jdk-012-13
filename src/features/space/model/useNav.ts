import { useCallback, useMemo, useRef, useState } from "react";
import {
  type Barrier,
  type NavModel,
  type NavSettings,
  PRESET_BARRIERS,
  normaliseSettings,
  makeNavModel,
  presetBarrier,
} from "../lib/nav";

const DEFAULT: NavSettings = { minWidth: 0.4, barriers: [], oneWay: true };
const HISTORY_LIMIT = 20;

let sequence = 0;

type NavState = { settings: NavSettings; version: number };

/**
 * Owns the temporary walking rules (hoardings, minimum passage width, one-way
 * aisle).  Every change produces a new model with a monotonically increasing
 * version, so an in-flight route can tell whether it was planned against the
 * rules currently in force.
 *
 * All mutations are functional updates: two rule changes made in the same
 * event (e.g. "deploy hoarding B" then "raise minimum width") must compose,
 * never overwrite one another.
 *
 * Barrier edits keep a short undo history: revoking the hoarding that broke a
 * route restores the exact previous rule set, and the route is then replanned
 * from wherever the visitor currently stands.
 */
export function useNav() {
  const [state, setState] = useState<NavState>({
    settings: DEFAULT,
    version: 0,
  });
  const history = useRef<NavSettings[]>([]);
  const [historySize, setHistorySize] = useState(0);

  const model = useMemo(
    () => makeNavModel(state.settings, state.version),
    [state],
  );

  /** Apply a rule change, optionally remembering the previous set for undo. */
  const change = useCallback(
    (patch: (s: NavSettings) => Partial<NavSettings>, remember: boolean) => {
      setState((current) => {
        if (remember) {
          history.current = [...history.current, current.settings].slice(
            -HISTORY_LIMIT,
          );
          setHistorySize(history.current.length);
        }
        return {
          settings: normaliseSettings({ ...current.settings, ...patch(current.settings) }),
          version: current.version + 1,
        };
      });
    },
    [],
  );

  const toggleBarrier = useCallback(
    (id: string) => {
      const def = presetBarrier(id);
      if (!def) return;
      change((s) => ({
        barriers: s.barriers.some((b) => b.id === id)
          ? s.barriers.filter((b) => b.id !== id)
          : [...s.barriers, def],
      }), true);
    },
    [change],
  );

  const removeBarrier = useCallback(
    (id: string) => {
      change(
        (s) => ({ barriers: s.barriers.filter((b) => b.id !== id) }),
        true,
      );
    },
    [change],
  );

  /** Drop a hoarding centred on the given point. */
  const placeBarrier = useCallback(
    (x: number, z: number, w = 0.9, d = 0.16) => {
      sequence += 1;
      const barrier: Barrier = {
        id: `custom-${Date.now().toString(36)}-${sequence}`,
        label: `临时围挡 ${sequence}`,
        x,
        z,
        w,
        d,
      };
      change((s) => ({ barriers: [...s.barriers, barrier] }), true);
      return barrier;
    },
    [change],
  );

  const undo = useCallback(() => {
    const previous = history.current[history.current.length - 1];
    if (!previous) return;
    history.current = history.current.slice(0, -1);
    setHistorySize(history.current.length);
    setState((current) => ({
      settings: previous,
      version: current.version + 1,
    }));
  }, []);

  return {
    settings: state.settings,
    model,
    version: state.version,
    presets: PRESET_BARRIERS,
    canUndo: historySize > 0,
    isActive: (id: string) =>
      state.settings.barriers.some((b) => b.id === id),
    toggleBarrier,
    placeBarrier,
    removeBarrier,
    undo,
    setMinWidth: useCallback(
      (minWidth: number) => change(() => ({ minWidth }), false),
      [change],
    ),
    setOneWay: useCallback(
      (oneWay: boolean) => change(() => ({ oneWay }), false),
      [change],
    ),
    reset: useCallback(() => change(() => DEFAULT, false), [change]),
  };
}

export type NavController = ReturnType<typeof useNav>;
export type { NavModel };
