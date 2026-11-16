import { useState } from "react";
import { Ruler, Undo2 } from "lucide-react";
import {
  MIN_WIDTH_OPTIONS,
  PRESET_BARRIERS,
  type NavModel,
  type NavSettings,
} from "../lib/nav";

export type NavControlsProps = {
  settings: NavSettings;
  model: NavModel;
  onToggleBarrier: (id: string) => void;
  onMinWidth: (width: number) => void;
  onOneWay: (enabled: boolean) => void;
  onPlaceUnderfoot: () => void;
  onUndo: () => void;
  canUndo: boolean;
  barrierCount: number;
};

/**
 * Temporary walking rules.  Everything here is optional; leaving it alone
 * gives the default gallery.  Each change is applied immediately to the shared
 * navigation model, so an in-flight route may be replanned on the spot.
 */
export function NavControls({
  settings,
  model,
  onToggleBarrier,
  onMinWidth,
  onOneWay,
  onPlaceUnderfoot,
  onUndo,
  canUndo,
  barrierCount,
}: NavControlsProps) {
  const [open, setOpen] = useState(false);
  const tight = settings.minWidth >= 0.6;
  return (
    <section className="nav-controls">
      <button
        className="nav-controls-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Ruler size={14} />
        临时通行条件
        <small>
          {barrierCount ? `${barrierCount} 处围挡` : "无围挡"} ·{" "}
          {settings.minWidth.toFixed(1)}米
        </small>
      </button>
      {open && (
        <div className="nav-controls-body">
          <p className="nav-hint">
            改变条件后，导航会从你当前所在的位置重新规划；已经走过的一段不会作废。
          </p>
          <div className="nav-field">
            <span>最小通行宽度</span>
            <div className="segmented">
              {MIN_WIDTH_OPTIONS.map((w) => (
                <button
                  key={w}
                  className={settings.minWidth === w ? "selected" : ""}
                  aria-pressed={settings.minWidth === w}
                  onClick={() => onMinWidth(w)}
                >
                  {w.toFixed(1)} 米
                </button>
              ))}
            </div>
          </div>
          <label className="nav-switch">
            <input
              type="checkbox"
              checked={settings.oneWay}
              onChange={(e) => onOneWay(e.target.checked)}
            />
            <span>
              启用单向通道
              <small>展台东侧通道仅可向北通行</small>
            </span>
          </label>
          <div className="nav-field">
            <span>预设围挡</span>
            <div className="nav-buttons">
              {PRESET_BARRIERS.map((p) => {
                const active = settings.barriers.some((b) => b.id === p.id);
                return (
                  <button
                    key={p.id}
                    className={active ? "chip active" : "chip"}
                    aria-pressed={active}
                    onClick={() => onToggleBarrier(p.id)}
                  >
                    {p.label}
                    <small>{active ? "已启用" : "启用"}</small>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="nav-buttons">
            <button className="chip" onClick={onPlaceUnderfoot}>
              在我脚下放置围挡
            </button>
            <button
              className="chip"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="撤销最近一次围挡"
            >
              <Undo2 size={13} />
              撤销
            </button>
          </div>
          {tight && (
            <p className="nav-warning">
              当前宽度下，展台东侧的窄缝可能无法通行；需要时可调回 0.4 米。
            </p>
          )}
        </div>
      )}
    </section>
  );
}
