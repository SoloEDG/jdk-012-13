import { Pause, Play, RotateCcw, X } from "lucide-react";
import { routes, artworkById } from "../../../shared/catalog";
import type { TourState } from "../../../shared/types";

export function TourPanel({
  state,
  notice,
  progress,
  waitingReason,
  onStart,
  onPause,
  onResume,
  onStop,
  onNext,
  onRetry,
}: {
  state: TourState;
  notice?: { kind: "info" | "warning"; text: string } | null;
  progress: number;
  waitingReason?: string;
  onStart: (id: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onNext: () => void;
  onRetry: () => void;
}) {
  const current = routes.find((r) => r.id === state.routeId);
  const active = !!current && state.phase !== "idle";
  const stopTitle = current
    ? artworkById(current.stops[state.step])?.title || ""
    : "";
  return (
    <section className="tour-panel">
      <div className="section-title">
        <span>主题导览</span>
        <small>CURATED JOURNEYS</small>
      </div>
      {active && current ? (
        <div className="current-tour">
          <span className="eyebrow">
            {state.phase === "done"
              ? "已完成"
              : state.phase === "waiting"
                ? "暂停等待"
                : `${state.step + 1} / ${current.stops.length}`}
          </span>
          <h3>{current.name}</h3>
          <progress value={state.phase === "done" ? 1 : progress} max="1" />
          <p role="status">
            {state.phase === "done"
              ? "这段旅程已完成，收藏你的所见。"
              : state.phase === "waiting"
                ? `${stopTitle} 暂时不可达：${waitingReason || "请调整通行条件。"}`
                : state.phase === "paused"
                  ? `已暂停 · ${stopTitle}`
                  : state.phase === "listening"
                    ? `正在讲述 · ${stopTitle}`
                    : `正在前往 · ${stopTitle}`}
          </p>
          {notice && (
            <p className={`tour-notice ${notice.kind}`}>{notice.text}</p>
          )}
          <div className="tour-controls">
            {state.phase === "waiting" ? (
              <button onClick={onRetry}>
                <RotateCcw size={14} />
                重试本段
              </button>
            ) : state.phase !== "done" ? (
              <button onClick={state.phase === "paused" ? onResume : onPause}>
                {state.phase === "paused" ? (
                  <Play size={14} />
                ) : (
                  <Pause size={14} />
                )}{" "}
                {state.phase === "paused" ? "继续" : "暂停"}
              </button>
            ) : null}
            {state.phase !== "done" && state.phase !== "waiting" && (
              <button onClick={onNext}>
                下一站
              </button>
            )}
            <button aria-label="结束导览" onClick={onStop}>
              <X size={14} />
            </button>
          </div>
        </div>
      ) : (
        routes.map((r, i) => (
          <button
            className={"route-card route-" + i}
            key={r.id}
            onClick={() => onStart(r.id)}
          >
            <span>
              JOURNEY 0{i + 1} <span>约 {i ? 3 : 2} 分钟 · 3 件作品</span>
            </span>
            <h3>
              {r.name}
              <span className="round-arrow">↗</span>
            </h3>
            <p>{r.subtitle}</p>
          </button>
        ))
      )}
    </section>
  );
}
