import type { Point } from "../../../shared/types";
import { artworks } from "../../../shared/catalog";
import type { ActiveRoute } from "../lib/route";
import {
  ONE_WAY_AISLE,
  WALKABLE_BOUNDS,
  type Barrier,
  type NavModel,
  type StopSide,
} from "../lib/nav";

const SCALE = 8;
const ORIGIN_X = 80;
const ORIGIN_Z = 95;

const sx = (x: number) => ORIGIN_X + x * SCALE;
const sz = (z: number) => ORIGIN_Z + z * SCALE;

const ROOM = {
  x: sx(-6),
  y: sz(-8),
  w: 12 * SCALE,
  h: 16 * SCALE,
};

const WALK = {
  x: sx(WALKABLE_BOUNDS.minX),
  y: sz(WALKABLE_BOUNDS.minZ),
  w: (WALKABLE_BOUNDS.maxX - WALKABLE_BOUNDS.minX) * SCALE,
  h: (WALKABLE_BOUNDS.maxZ - WALKABLE_BOUNDS.minZ) * SCALE,
};

export type MapStatus = {
  kind: "idle" | "routing" | "arrived" | "unreachable" | "displaced";
  reason?: string;
};

function pathD(points: Point[]): string {
  return points
    .map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)} ${sz(p.z).toFixed(1)}`)
    .join(" ");
}

function rectProps(r: Barrier) {
  return {
    x: sx(r.x - r.w / 2),
    y: sz(r.z - r.d / 2),
    width: Math.max(2, r.w * SCALE),
    height: Math.max(2, r.d * SCALE),
  };
}

export function Map({
  position,
  active,
  nav,
  route,
  status,
  stopSide,
  onSelect,
  large = false,
}: {
  position: Point;
  active: string | null;
  nav: NavModel;
  route?: ActiveRoute | null;
  status?: MapStatus;
  stopSide?: StopSide | null;
  onSelect: (id: string) => void;
  large?: boolean;
}) {
  const isBlocked = status?.kind === "unreachable";
  const routePoints = route?.path || [];
  return (
    <svg
      className={large ? "map large" : "map"}
      viewBox="0 0 160 190"
      aria-label="展馆平面导航"
      role="img"
    >
      <rect
        x={ROOM.x}
        y={ROOM.y}
        width={ROOM.w}
        height={ROOM.h}
        rx="2"
        fill="#e6e2d7"
      />
      <rect
        x={WALK.x}
        y={WALK.y}
        width={WALK.w}
        height={WALK.h}
        fill="none"
        stroke="#cdc8bb"
        strokeDasharray="2 3"
      />
      <path
        d={`M${sx(6)} ${sz(-8)}V${sz(8)}M${sx(-6)} ${sz(8)}H${sx(6)}`}
        stroke="#c9c4b6"
        fill="none"
      />

      {nav.oneWay ? (
        <g aria-label={nav.oneWay.label}>
          <rect
            x={sx(nav.oneWay.x - nav.oneWay.w / 2)}
            y={sz(nav.oneWay.z - nav.oneWay.d / 2)}
            width={nav.oneWay.w * SCALE}
            height={nav.oneWay.d * SCALE}
            fill="#c9b46d"
            opacity="0.3"
            stroke="#a78f4d"
            strokeDasharray="3 2"
          />
          {[0.22, 0.5, 0.78].map((t) => {
            const z = nav.oneWay!.z - nav.oneWay!.d / 2 + nav.oneWay!.d * t;
            const x = nav.oneWay!.x;
            return (
              <path
                key={t}
                d={`M${sx(x)} ${sz(z + 0.16)}L${sx(x)} ${sz(z - 0.16)}M${sx(x - 0.12)} ${sz(z - 0.04)}L${sx(x)} ${sz(z - 0.17)}L${sx(x + 0.12)} ${sz(z - 0.04)}`}
                stroke="#8d7736"
                strokeWidth="1"
                fill="none"
              />
            );
          })}
        </g>
      ) : (
        <rect
          x={sx(ONE_WAY_AISLE.x - ONE_WAY_AISLE.w / 2)}
          y={sz(ONE_WAY_AISLE.z - ONE_WAY_AISLE.d / 2)}
          width={ONE_WAY_AISLE.w * SCALE}
          height={ONE_WAY_AISLE.d * SCALE}
          fill="none"
          stroke="#b9b4a3"
          strokeDasharray="2 3"
        />
      )}

      <rect x={sx(-0.9)} y={sz(-1.05)} width={1.8 * SCALE} height={1.5 * SCALE} fill="#b8ad94" />

      {nav.activeBarriers.map((b) => (
        <g key={b.id}>
          <rect {...rectProps(b)} fill="#a4503f" rx="1" />
          <title>{b.label}</title>
        </g>
      ))}

      {routePoints.length > 1 && (
        <path
          d={pathD(routePoints)}
          fill="none"
          stroke={isBlocked ? "#a4503f" : "#2f6b4f"}
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={isBlocked ? "4 3" : undefined}
          opacity="0.85"
        />
      )}

      {route?.stop && (
        <g aria-label={`停靠点 · ${route.stopLabel}`}>
          <circle
            cx={sx(route.stop.x)}
            cy={sz(route.stop.z)}
            r="4.5"
            fill="none"
            stroke="#2f6b4f"
            strokeWidth="1.2"
            strokeDasharray={isBlocked ? "2 2" : undefined}
          />
          <circle cx={sx(route.stop.x)} cy={sz(route.stop.z)} r="1.4" fill="#2f6b4f" />
        </g>
      )}

      {artworks.map((a, i) => {
        const at = route?.artworkId === a.id;
        return (
          <g
            key={a.id}
            onClick={() => onSelect(a.id)}
            role="button"
            tabIndex={0}
            aria-label={"前往" + a.title}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(a.id);
              }
            }}
          >
            <circle
              cx={sx(a.position.x)}
              cy={sz(a.position.z)}
              r={active === a.id ? 8 : 6.5}
              fill={active === a.id ? "#c5a66d" : at ? "#4c7558" : "#797c72"}
            />
            <text
              x={sx(a.position.x)}
              y={sz(a.position.z) + 2.8}
              textAnchor="middle"
              fill="white"
              fontSize="7.5"
            >
              {i + 1}
            </text>
          </g>
        );
      })}

      <circle
        data-testid="map-position"
        cx={sx(position.x)}
        cy={sz(position.z)}
        r="4.2"
        fill={isBlocked ? "#a4503f" : "#282c26"}
        stroke="white"
        strokeWidth="1.7"
      />

      <text x="80" y="169" textAnchor="middle" fontSize="8" fill="#77796d">
        南入口 · SOUTH ENTRANCE
      </text>
      {large && (
        <g fontSize="7" fill="#6f7566">
          <rect x="33" y="173" width="7" height="4" fill="#a4503f" />
          <text x="43" y="177">临时围挡</text>
          <path d="M87 175h9" stroke="#2f6b4f" strokeWidth="1.5" />
          <text x="100" y="177">导航路径</text>
        </g>
      )}
      {stopSide && route && (
        <text x="80" y="185" textAnchor="middle" fontSize="7" fill="#4c7558">
          停靠 · {route.stopLabel}侧
        </text>
      )}
    </svg>
  );
}
