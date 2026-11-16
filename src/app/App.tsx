import { useState } from "react";
import {
  ArrowUpRight,
  Heart,
  Maximize,
  MapPin,
  Volume2,
  Compass,
  Move,
  Info,
  X,
  Navigation,
  Flag,
} from "lucide-react";
import { Viewport, Map, NavControls } from "../features/space";
import { ArtworkList, ArtworkDetail } from "../features/catalog";
import { TourPanel } from "../features/tours";
import { AudioPlayer } from "../features/narration";
import { CollectionPanel } from "../features/collection";
import { artworks, artworkById } from "../shared/catalog";
import { useGallery } from "./useGallery";

const SIDE_TEXT = { front: "正面", left: "左侧", right: "右侧" } as const;

export default function App() {
  const g = useGallery();
  const [tab, setTab] = useState("explore");
  const [mapOpen, setMapOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [side, setSide] = useState("works");
  const a = artworkById(g.catalog.active);

  const st = g.status;
  const routing = st.kind === "routing" ? st : null;
  const unreachable = st.kind === "unreachable" ? st : null;
  const displaced = st.kind === "displaced" ? st : null;
  const arrived = st.kind === "arrived" ? st : null;
  const focused = artworkById(g.catalog.focus);
  const routeBlocked = !!unreachable || !!displaced;

  const statusText = routing
    ? `正在前往 · ${artworkById(routing.artworkId)?.title} · ${
        SIDE_TEXT[routing.side]
      }停靠`
    : unreachable
      ? `暂不可达 · ${artworkById(unreachable.artworkId)?.title}`
      : displaced
        ? "正在移出围挡"
        : arrived
          ? `已到达 · ${artworkById(arrived.artworkId)?.title} · ${
              SIDE_TEXT[arrived.side]
            }`
          : "";

  const canListen =
    !!g.catalog.active && g.catalog.nearby === g.catalog.active;
  const tourPanel = (
    <TourPanel
      state={g.tour.state}
      notice={g.tour.notice}
      progress={
        g.route && g.route.source === "tour" ? g.progress : tourFallback(g)
      }
      waitingReason={
        g.tour.state.phase === "waiting" ? g.tour.state.reason : undefined
      }
      onStart={(id) => {
        g.startTour(id);
        setTab("journeys");
      }}
      onPause={g.pauseTour}
      onResume={g.resumeTour}
      onStop={g.stopTour}
      onNext={g.nextTour}
      onRetry={() => g.tour.retry()}
    />
  );

  return (
    <div className="app">
      <header>
        <a className="brand" href="#">
          <span className="brand-mark">余</span>
          <span>
            余境<small>YUJING ART SPACE</small>
          </span>
        </a>
        <nav>
          <button
            className={tab === "explore" ? "selected" : ""}
            onClick={() => setTab("explore")}
          >
            探索展馆
          </button>
          <button
            className={tab === "journeys" ? "selected" : ""}
            onClick={() => setTab("journeys")}
          >
            主题导览
          </button>
          <button
            className={tab === "collection" ? "selected" : ""}
            onClick={() => setTab("collection")}
          >
            我的收藏{" "}
            <span className="count">
              {g.collection.document.favorites.length}
            </span>
          </button>
        </nav>
        <div className="header-meta">
          <span className="live-dot" />
          线上展览 · 全天开放
          <button
            className="icon-button"
            aria-label="操作帮助"
            onClick={() => setHelp(true)}
          >
            <Info size={18} />
          </button>
        </div>
      </header>
      <main>
        <aside className="left-sidebar">
          <div className="exhibition-intro">
            <div className="eyebrow">
              CURRENT EXHIBITION <span>展览 001</span>
            </div>
            <h1>万物之间</h1>
            <p className="english-title">BETWEEN ALL THINGS</p>
            <p className="intro-text">
              当自然、空间与想象相遇
              <br />
              一场不受边界限制的艺术漫游。
            </p>
            <div className="exhibition-meta">
              <span>6 件作品</span>
              <span>6 位艺术家</span>
              <span>约 12 分钟</span>
            </div>
          </div>
          <div className="sidebar-tabs">
            <button
              className={side === "works" ? "active" : ""}
              onClick={() => setSide("works")}
            >
              展出作品 <small>06</small>
            </button>
            <button
              className={side === "map" ? "active" : ""}
              onClick={() => setSide("map")}
            >
              空间地图
            </button>
          </div>
          {side === "works" ? (
            <ArtworkList active={g.catalog.active} onSelect={g.go} />
          ) : (
            <Map
              position={g.walker.position}
              active={g.catalog.active}
              nav={g.nav.model}
              route={g.route}
              status={g.status}
              stopSide={g.route?.stopSide || null}
              onSelect={g.go}
              large
            />
          )}
          <NavControls
            settings={g.nav.settings}
            model={g.nav.model}
            barrierCount={g.nav.settings.barriers.length}
            canUndo={g.nav.canUndo}
            onToggleBarrier={g.nav.toggleBarrier}
            onMinWidth={g.nav.setMinWidth}
            onOneWay={g.nav.setOneWay}
            onUndo={g.nav.undo}
            onPlaceUnderfoot={() =>
              g.nav.placeBarrier(g.walker.position.x, g.walker.position.z)
            }
          />
          {tourPanel}
          <div className="sidebar-footer">
            <Compass size={15} />
            <span>慢下来，遇见艺术的另一面。</span>
          </div>
        </aside>
        <section className="center">
          <div className="view-heading">
            <div>
              <span className="eyebrow">THE VIRTUAL GALLERY</span>
              <h2>
                步入一场艺术的漫游<span>01 / 主展厅</span>
              </h2>
            </div>
            <button className="text-button" onClick={() => setHelp(true)}>
              参观指南
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="scene-wrap">
            <Viewport
              position={g.walker.positionRef}
              yaw={g.walker.yaw}
              nav={g.nav.model}
              path={g.route?.path || []}
              stop={g.route?.stop || null}
              blocked={routeBlocked}
              onSelect={g.go}
            />
            <div className="scene-top">
              <span>
                <span className="live-dot" />
                {g.tour.state.phase === "listening"
                  ? "讲解中"
                  : routing
                    ? "导航中"
                    : "自由探索中"}
              </span>
              <button
                className="glass-button"
                aria-label="全屏展馆"
                onClick={() => {
                  const el = document.querySelector(".scene-wrap");
                  if (document.fullscreenElement)
                    void document.exitFullscreen();
                  else void el?.requestFullscreen();
                }}
              >
                <Maximize size={16} />
              </button>
            </div>
            <div className="center-cross">+</div>
            <div className="scene-location">
              <MapPin size={15} />
              {g.catalog.nearby ? a?.title : "万物之间 · 主展厅"}
              <small>
                {g.catalog.nearby
                  ? `靠近作品 · ${SIDE_TEXT[g.catalog.nearbySide || "front"]}可收听讲解`
                  : "拖动视角，发现你的下一次共鸣"}
              </small>
            </div>

            {statusText && (
              <div
                className={`nav-banner ${unreachable ? "warn" : displaced ? "warn" : routing ? "go" : "ok"}`}
                role="status"
                aria-live="polite"
              >
                <Navigation size={14} />
                <span>{statusText}</span>
                {routing && (
                  <>
                    <span className="nav-progress">
                      <i style={{ width: `${Math.round(g.progress * 100)}%` }} />
                    </span>
                    <small>{g.distanceLeft.toFixed(1)} 米</small>
                  </>
                )}
                {unreachable && (
                  <button className="banner-action" onClick={() => g.tour.state.phase !== "idle" && g.stopTour()}>
                    结束导览
                  </button>
                )}
              </div>
            )}
            {focused && !routing && !arrived && !unreachable && (
              <div className="nav-banner go" role="status">
                <Flag size={14} />
                <span>目标 · {focused.title}</span>
              </div>
            )}

            <div
              className="mini-map"
              onClick={() => setMapOpen(true)}
              role="button"
              tabIndex={0}
              aria-label="展开地图"
              onKeyDown={(e) => {
                if (e.key === "Enter") setMapOpen(true);
              }}
            >
              <span>空间导航 ↗</span>
              <Map
                position={g.walker.position}
                active={g.catalog.active}
                nav={g.nav.model}
                route={g.route}
                status={g.status}
                stopSide={g.route?.stopSide || null}
                onSelect={g.go}
              />
            </div>
            <div className="scene-controls">
              <span>
                <kbd>W</kbd>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd> 行走
              </span>
              <span>
                <Move size={14} />
                拖动切换视角
              </span>
              <span>
                <Heart size={14} />
                收藏所见
              </span>
            </div>
          </div>
          {unreachable && (
            <div className="nav-reason" role="alert">
              {unreachable.reason}
            </div>
          )}
          {displaced && (
            <div className="nav-reason" role="status">
              {displaced.reason}
            </div>
          )}
          <div className="scene-caption">
            <span>让每一次停留，都成为一次发现。</span>
            <span>
              沉浸式三维艺术体验 <Volume2 size={14} />
            </span>
          </div>
          <div className="discover-strip">
            <div>
              <span className="eyebrow">A MOMENT OF DISCOVERY</span>
              <h3>不止于观看，更在于感受。</h3>
              <p>走近一件作品，听一段故事。让艺术与此刻的你，产生连接。</p>
            </div>
            <button
              onClick={() => {
                g.startTour("nature");
                setTab("journeys");
              }}
            >
              开启主题之旅 <ArrowUpRight size={19} />
            </button>
          </div>
          <div className="art-tags">
            {artworks.slice(0, 3).map((art, i) => (
              <button key={art.id} onClick={() => g.go(art.id)}>
                <span style={{ background: art.color }} />0{i + 1} · {art.title}
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
        </section>
        <aside className="right-sidebar">
          {tab === "collection" ? (
            <CollectionPanel
              document={g.collection.document}
              onSelect={g.go}
              onNote={g.collection.note}
              onToggle={g.collection.toggle}
            />
          ) : tab === "journeys" ? (
            <>
              <div className="journey-intro">
                <div className="eyebrow">FOLLOW YOUR CURIOSITY</div>
                <h2>沿着共鸣，出发。</h2>
                <p>选择一条路线，空间导航与作品讲解将陪伴你完成这段旅程。</p>
              </div>
              {tourPanel}
            </>
          ) : (
            <ArtworkDetail
              id={g.catalog.active}
              saved={g.collection.document.favorites.includes(
                g.catalog.active || "",
              )}
              canListen={canListen}
              listenHint={
                routing
                  ? "到达作品前不会开始讲解，避免在围挡外提前播放。"
                  : unreachable
                    ? unreachable.reason
                    : "走近作品后才会开始讲解，隔墙或围挡之外不会提前播放。"
              }
              onFavorite={() => {
                if (g.catalog.active) g.collection.toggle(g.catalog.active);
              }}
              onListen={() => {
                if (canListen && g.catalog.active)
                  g.narration.play(g.catalog.active);
              }}
              onGo={() => {
                if (g.catalog.active) g.go(g.catalog.active);
              }}
            />
          )}
          <div className="right-bottom">
            <span className="quote-mark">“</span>
            <p>
              艺术不是你看到的东西，
              <br />
              而是你让别人看到的东西。
            </p>
            <small>— 埃德加 · 德加</small>
          </div>
        </aside>
      </main>
      {g.collection.storageError && (
        <div className="storage-error">
          浏览器存储已满，本次更改暂未保存，请下载回顾。
        </div>
      )}
      <AudioPlayer
        state={g.narration.state}
        caption={g.narration.caption}
        supported={g.narration.supported}
        onToggle={g.narration.toggle}
        onSeek={g.narration.seek}
        onRate={g.narration.rate}
      />
      {(mapOpen || help) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setMapOpen(false);
            setHelp(false);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={help ? "参观指南" : "空间导航"}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label="关闭弹窗"
              className="icon-button modal-close"
              onClick={() => {
                setMapOpen(false);
                setHelp(false);
              }}
            >
              <X size={20} />
            </button>
            <div className="eyebrow">YUJING ART SPACE</div>
            <h2>{help ? "按照自己的节奏，探索。" : "你在这里。"}</h2>
            {help ? (
              <>
                <p>使用 W / A / S / D 或方向键自由行走；拖动画面转动视角。</p>
                <p>
                  点击画中的作品或左侧列表，导航会绕开中央展台，停靠在作品正面或侧面；地图上显示的是实际行走的路径。
                </p>
                <p>
                  作品介绍只在真正走到作品前、并且视线没有被围挡遮挡时切换；在隔墙旁边不会提前开始讲解。
                </p>
                <p>
                  “临时通行条件”可以布置围挡、调整最小通行宽度和单向通道。条件改变后导航会从你脚下重新规划，不会把你送回入口；目标变得不可达时会说明原因。
                </p>
                <p>
                  讲解由设备的中文语音合成播放；没有中文语音时仍可阅读同步字幕。
                </p>
              </>
            ) : (
              <Map
                position={g.walker.position}
                active={g.catalog.active}
                nav={g.nav.model}
                route={g.route}
                status={g.status}
                stopSide={g.route?.stopSide || null}
                onSelect={(id) => {
                  g.go(id);
                  setMapOpen(false);
                }}
                large
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function tourFallback(g: ReturnType<typeof useGallery>) {
  const r = g.tour.route;
  if (!r) return 0;
  if (g.tour.state.phase === "done") return 1;
  return Math.min(1, g.tour.state.step / r.stops.length);
}
