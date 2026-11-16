import type { Artwork, Point } from "../../../shared/types";

/**
 * Shared navigation model for the gallery.
 *
 * Free walking, guided tours and the map all read the same clearance rules,
 * temporary hoardings and one-way aisle.  Anything that changes the rules
 * produces a new model with a higher `version`, which lets in-flight routes
 * decide whether they are still legal.
 */

export type Rect = { x: number; z: number; w: number; d: number };

export type Barrier = Rect & {
  id: string;
  label: string;
  /** Preset hoardings can be toggled from the side panel. */
  preset?: boolean;
};

export type OneWayDef = Rect & {
  dir: Point;
  label: string;
};

export type NavSettings = {
  /** Minimum clear passage width, in metres. */
  minWidth: number;
  /** Temporary hoardings currently deployed, in placement order. */
  barriers: Barrier[];
  /** Whether the marked aisle may only be walked in its arrow direction. */
  oneWay: boolean;
};

export type NavModel = {
  settings: NavSettings;
  version: number;
  obstacles: Rect[];
  activeBarriers: Barrier[];
  oneWay: OneWayDef | null;
  grid: NavGrid;
};

export type NavGrid = {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  res: number;
  cols: number;
  rows: number;
  walkable: Uint8Array;
  clearance: Float32Array;
};

export const WALKABLE_BOUNDS = {
  minX: -4.8,
  maxX: 4.8,
  minZ: -6.8,
  maxZ: 6.8,
};

export const MIN_WIDTH_OPTIONS = [0.4, 0.6, 0.9] as const;

export const DEFAULT_NAV_SETTINGS: NavSettings = {
  minWidth: 0.4,
  barriers: [],
  oneWay: true,
};

/** The solid plinth in the middle of the room. */
export const PODIUM: Rect = { x: 0, z: -0.3, w: 1.8, d: 1.5 };

/**
 * Preset hoardings.  A seals the whole west aisle.  B seals the east aisle but
 * leaves a 0.56 m slot beside the plinth, which is the only northbound way
 * through.  That slot is what makes both the one-way rule and the minimum
 * width setting observable: it is passable at 0.4 m and impassable at 0.6 m.
 */
export const PRESET_BARRIERS: Barrier[] = [
  {
    id: "barrier-west",
    label: "西侧围挡 A",
    preset: true,
    x: -2.85,
    z: 0.4,
    w: 3.9,
    d: 0.16,
  },
  {
    id: "barrier-east",
    label: "东侧围挡 B",
    preset: true,
    x: 3.13,
    z: 0.4,
    w: 3.34,
    d: 0.16,
  },
];

/**
 * The marked slot beside the plinth.  While hoarding B narrows the east aisle
 * this is the only crossing between the south entrance and the north wall, and
 * the floor arrows make it northbound only (north is -z).
 */
export const ONE_WAY_AISLE: OneWayDef = {
  x: 1.18,
  z: 0.4,
  w: 0.56,
  d: 2.2,
  dir: { x: 0, z: -1 },
  label: "单向通道 · 仅向北",
};

const NAV_RES = 0.05;
const EPS = 1e-7;
const SIDES = ["front", "left", "right"] as const;

export type StopSide = (typeof SIDES)[number];

export function presetBarrier(id: string): Barrier | null {
  const found = PRESET_BARRIERS.find((b) => b.id === id);
  return found ? { ...found } : null;
}

function finite(n: unknown, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function sanitiseBarrier(raw: unknown): Barrier | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Partial<Barrier>;
  if (typeof b.id !== "string" || !b.id) return null;
  const w = finite(b.w, 0);
  const d = finite(b.d, 0);
  if (w <= 0.05 || d <= 0.05) return null;
  return {
    id: b.id,
    label: typeof b.label === "string" && b.label ? b.label : "临时围挡",
    preset: b.preset === true,
    x: Math.max(-20, Math.min(20, finite(b.x, 0))),
    z: Math.max(-20, Math.min(20, finite(b.z, 0))),
    w: Math.min(20, w),
    d: Math.min(20, d),
  };
}

export function normaliseSettings(raw: Partial<NavSettings>): NavSettings {
  const minWidth = Math.max(0.2, Math.min(2, finite(raw.minWidth, 0.4)));
  const seen = new Set<string>();
  const barriers: Barrier[] = [];
  for (const item of Array.isArray(raw.barriers) ? raw.barriers : []) {
    const b = sanitiseBarrier(item);
    if (b && !seen.has(b.id)) {
      seen.add(b.id);
      barriers.push(b);
    }
  }
  return { minWidth, barriers, oneWay: raw.oneWay !== false };
}

function barrierRect(b: Barrier): Rect {
  return { x: b.x, z: b.z, w: b.w, d: b.d };
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

function rectDistance(p: Point, r: Rect): number {
  const dx = Math.max(r.x - r.w / 2 - p.x, 0, p.x - (r.x + r.w / 2));
  const dz = Math.max(r.z - r.d / 2 - p.z, 0, p.z - (r.z + r.d / 2));
  return Math.hypot(dx, dz);
}

function insideRect(p: Point, r: Rect, margin = 0): boolean {
  return (
    p.x >= r.x - r.w / 2 - margin &&
    p.x <= r.x + r.w / 2 + margin &&
    p.z >= r.z - r.d / 2 - margin &&
    p.z <= r.z + r.d / 2 + margin
  );
}

export function rectContains(r: Rect, p: Point, margin = 0): boolean {
  return insideRect(p, r, margin);
}

function rectCorners(r: Rect): Point[] {
  return [
    { x: r.x - r.w / 2, z: r.z - r.d / 2 },
    { x: r.x + r.w / 2, z: r.z - r.d / 2 },
    { x: r.x + r.w / 2, z: r.z + r.d / 2 },
    { x: r.x - r.w / 2, z: r.z + r.d / 2 },
  ];
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return (
    ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
    ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
  );
}

/** True when the segment a→b intersects the rectangle. */
export function segmentHitsRect(
  a: Point,
  b: Point,
  r: Rect,
  margin = 0,
): boolean {
  const padded: Rect = {
    x: r.x,
    z: r.z,
    w: r.w + margin * 2,
    d: r.d + margin * 2,
  };
  if (insideRect(a, padded) || insideRect(b, padded)) return true;
  const corners = rectCorners(padded);
  for (let i = 0; i < 4; i++) {
    if (segmentsCross(a, b, corners[i], corners[(i + 1) % 4])) return true;
  }
  return false;
}

export function inBounds(p: Point): boolean {
  return (
    p.x >= WALKABLE_BOUNDS.minX - EPS &&
    p.x <= WALKABLE_BOUNDS.maxX + EPS &&
    p.z >= WALKABLE_BOUNDS.minZ - EPS &&
    p.z <= WALKABLE_BOUNDS.maxZ + EPS
  );
}

export function clearanceAgainst(p: Point, obstacles: Rect[]): number {
  const edge = Math.min(
    p.x - WALKABLE_BOUNDS.minX,
    WALKABLE_BOUNDS.maxX - p.x,
    p.z - WALKABLE_BOUNDS.minZ,
    WALKABLE_BOUNDS.maxZ - p.z,
  );
  let c = edge;
  for (const r of obstacles) c = Math.min(c, rectDistance(p, r));
  return c;
}

export function clearanceAt(nav: NavModel, p: Point): number {
  return clearanceAgainst(p, nav.obstacles);
}

/**
 * Whether a person may stand at this exact point under the current rules.
 * Clearance is the distance to the nearest obstruction; half the required
 * passage width must fit on either side of the point.
 */
export function isPointWalkable(nav: NavModel, p: Point): boolean {
  return (
    inBounds(p) && clearanceAt(nav, p) + EPS >= nav.settings.minWidth / 2
  );
}

/** True if the point is inside a temporary hoarding (for diagnostics / UX). */
export function insideBarrier(nav: NavModel, p: Point): Barrier | null {
  for (const b of nav.activeBarriers) {
    if (insideRect(p, barrierRect(b))) return b;
  }
  return null;
}

export type PointBlock =
  | { code: "inside-barrier"; barrier: Barrier }
  | { code: "narrow"; clearance: number }
  | { code: "out-of-bounds" };

/** Why a particular point may not be stood on (null when it is legal). */
export function whyBlocked(nav: NavModel, p: Point): PointBlock | null {
  if (!inBounds(p)) return { code: "out-of-bounds" };
  const c = clearanceAt(nav, p);
  if (c + EPS >= nav.settings.minWidth / 2) return null;
  const barrier = insideBarrier(nav, p);
  if (barrier) return { code: "inside-barrier", barrier };
  return { code: "narrow", clearance: c };
}

export function pointInOneWay(nav: NavModel, p: Point): boolean {
  return !!nav.oneWay && insideRect(p, nav.oneWay);
}

function directionAllowed(nav: NavModel, a: Point, b: Point): boolean {
  if (!nav.oneWay) return true;
  const inZone = pointInOneWay(nav, a) || pointInOneWay(nav, b);
  if (!inZone) return true;
  const dot = (b.x - a.x) * nav.oneWay.dir.x + (b.z - a.z) * nav.oneWay.dir.z;
  return dot >= -EPS;
}

/** Line of sight, used so an artwork is never "seen" through a hoarding. */
export function hasLineOfSight(nav: NavModel, a: Point, b: Point): boolean {
  for (const r of nav.obstacles) {
    if (segmentHitsRect(a, b, r, 0.02)) return false;
  }
  return true;
}

/** Exact segment check shared by walking and route smoothing. */
export function isSegmentWalkable(nav: NavModel, a: Point, b: Point): boolean {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  if (d < EPS) return isPointWalkable(nav, a);
  const steps = Math.max(1, Math.ceil(d / 0.06));
  let prev = a;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    if (!isPointWalkable(nav, p)) return false;
    for (const r of nav.obstacles) {
      if (segmentHitsRect(prev, p, r)) return false;
    }
    if (!directionAllowed(nav, prev, p)) return false;
    prev = p;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Navigation model                                                    */
/* ------------------------------------------------------------------ */

function buildGrid(settings: NavSettings, obstacles: Rect[]): NavGrid {
  const { minX, maxX, minZ, maxZ } = WALKABLE_BOUNDS;
  const cols = Math.floor((maxX - minX) / NAV_RES) + 1;
  const rows = Math.floor((maxZ - minZ) / NAV_RES) + 1;
  const walkable = new Uint8Array(cols * rows);
  const clearance = new Float32Array(cols * rows);
  // A small safety margin keeps cells that are exactly on the minimum width
  // from being chosen, which would make the walker clip the obstruction.
  const need = settings.minWidth / 2 + 0.01;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const p = { x: minX + col * NAV_RES, z: minZ + row * NAV_RES };
      const c = clearanceAgainst(p, obstacles);
      const idx = row * cols + col;
      clearance[idx] = c;
      walkable[idx] = c + EPS >= need ? 1 : 0;
    }
  }
  return {
    minX,
    minZ,
    maxX,
    maxZ,
    res: NAV_RES,
    cols,
    rows,
    walkable,
    clearance,
  };
}

export function makeNavModel(
  raw: Partial<NavSettings>,
  version = 0,
): NavModel {
  const settings = normaliseSettings(raw);
  const obstacles = [PODIUM, ...settings.barriers.map(barrierRect)];
  return {
    settings,
    version,
    obstacles,
    activeBarriers: settings.barriers.map((b) => ({ ...b })),
    oneWay: settings.oneWay ? ONE_WAY_AISLE : null,
    grid: buildGrid(settings, obstacles),
  };
}

/** Rules with no temporary obstructions; useful before live state is ready. */
export const BASE_NAV: NavModel = makeNavModel(DEFAULT_NAV_SETTINGS, 0);

/* ------------------------------------------------------------------ */
/* Grid helpers                                                        */
/* ------------------------------------------------------------------ */

function cellPoint(grid: NavGrid, idx: number): Point {
  const row = Math.floor(idx / grid.cols);
  const col = idx % grid.cols;
  return { x: grid.minX + col * grid.res, z: grid.minZ + row * grid.res };
}

function pointIndex(grid: NavGrid, p: Point): number {
  const col = Math.max(
    0,
    Math.min(grid.cols - 1, Math.round((p.x - grid.minX) / grid.res)),
  );
  const row = Math.max(
    0,
    Math.min(grid.rows - 1, Math.round((p.z - grid.minZ) / grid.res)),
  );
  return row * grid.cols + col;
}

function nearestWalkableIdx(
  nav: NavModel,
  p: Point,
  maxRadius = 6,
): number | null {
  const grid = nav.grid;
  const guess = pointIndex(grid, p);
  if (grid.walkable[guess]) return guess;
  const col0 = guess % grid.cols;
  const row0 = Math.floor(guess / grid.cols);
  const rings = Math.ceil(maxRadius / grid.res);
  let best: number | null = null;
  let bestD = Infinity;
  for (let radius = 1; radius <= rings; radius++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const col = col0 + dx;
        const row = row0 + dz;
        if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows)
          continue;
        const idx = row * grid.cols + col;
        if (!grid.walkable[idx]) continue;
        const q = cellPoint(grid, idx);
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < bestD && d <= maxRadius) {
          bestD = d;
          best = idx;
        }
      }
    }
    if (best !== null) break;
  }
  return best;
}

/** Nearest legal standing point; lets someone inside a hoarding step out. */
export function nearestWalkablePoint(nav: NavModel, p: Point): Point | null {
  const idx = nearestWalkableIdx(nav, p, 8);
  return idx === null ? null : cellPoint(nav.grid, idx);
}

type HeapItem = { idx: number; score: number };

class MinHeap {
  private items: HeapItem[] = [];
  get size() {
    return this.items.length;
  }
  push(item: HeapItem) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].score <= a[i].score) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop(): HeapItem | undefined {
    const a = this.items;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < a.length && a[l].score < a[smallest].score) smallest = l;
        if (r < a.length && a[r].score < a[smallest].score) smallest = r;
        if (smallest === i) break;
        [a[i], a[smallest]] = [a[smallest], a[i]];
        i = smallest;
      }
    }
    return top;
  }
}

const DIRS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function edgeOpen(nav: NavModel, aIdx: number, bIdx: number): boolean {
  const grid = nav.grid;
  if (!grid.walkable[aIdx] || !grid.walkable[bIdx]) return false;
  const a = cellPoint(grid, aIdx);
  const b = cellPoint(grid, bIdx);
  if (!directionAllowed(nav, a, b)) return false;
  for (const r of nav.obstacles) {
    if (segmentHitsRect(a, b, r)) return false;
  }
  return true;
}

function undirectedReachable(
  nav: NavModel,
  startIdx: number,
  goalIdx: number,
): boolean {
  const grid = nav.grid;
  const seen = new Uint8Array(grid.walkable.length);
  const queue = [startIdx];
  seen[startIdx] = 1;
  while (queue.length) {
    const idx = queue.shift()!;
    if (idx === goalIdx) return true;
    const col = idx % grid.cols;
    const row = Math.floor(idx / grid.cols);
    for (const [dx, dz] of DIRS) {
      const c = col + dx;
      const r = row + dz;
      if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) continue;
      const n = r * grid.cols + c;
      if (seen[n] || !grid.walkable[n]) continue;
      if (dx && dz) {
        if (
          !grid.walkable[row * grid.cols + c] ||
          !grid.walkable[r * grid.cols + col]
        )
          continue;
      }
      const a = cellPoint(grid, idx);
      const b = cellPoint(grid, n);
      let hits = false;
      for (const rect of nav.obstacles) {
        if (segmentHitsRect(a, b, rect)) {
          hits = true;
          break;
        }
      }
      if (hits) continue;
      // Direction is intentionally ignored: if this succeeds while A* fails,
      // the one-way aisle is the reason.
      seen[n] = 1;
      queue.push(n);
    }
  }
  return false;
}

export type PathResult = {
  ok: boolean;
  path: Point[];
  distance: number;
  /** True when a path exists if the one-way aisle is ignored. */
  directed?: boolean;
};

/** A* over the shared walkable grid, including the one-way aisle. */
export function findPath(nav: NavModel, from: Point, to: Point): PathResult {
  const grid = nav.grid;
  const startIdx = nearestWalkableIdx(nav, from);
  const goalIdx = nearestWalkableIdx(nav, to, 1.5);
  if (startIdx === null || goalIdx === null) {
    return { ok: false, path: [], distance: Infinity };
  }
  const goal = cellPoint(grid, goalIdx);
  const size = grid.walkable.length;
  const gScore = new Float64Array(size).fill(Infinity);
  const came = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const heap = new MinHeap();
  const heuristic = (idx: number) => {
    const p = cellPoint(grid, idx);
    return Math.hypot(p.x - goal.x, p.z - goal.z);
  };
  gScore[startIdx] = 0;
  heap.push({ idx: startIdx, score: heuristic(startIdx) });
  let found = false;
  while (heap.size) {
    const cur = heap.pop()!;
    if (closed[cur.idx]) continue;
    closed[cur.idx] = 1;
    if (cur.idx === goalIdx) {
      found = true;
      break;
    }
    const col = cur.idx % grid.cols;
    const row = Math.floor(cur.idx / grid.cols);
    for (const [dx, dz] of DIRS) {
      const c = col + dx;
      const r = row + dz;
      if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) continue;
      const n = r * grid.cols + c;
      if (closed[n] || !grid.walkable[n]) continue;
      if (dx && dz) {
        if (
          !grid.walkable[row * grid.cols + c] ||
          !grid.walkable[r * grid.cols + col]
        )
          continue;
      }
      if (!edgeOpen(nav, cur.idx, n)) continue;
      const step = Math.hypot(dx, dz) * grid.res;
      const tentative = gScore[cur.idx] + step;
      if (tentative + EPS < gScore[n]) {
        gScore[n] = tentative;
        came[n] = cur.idx;
        heap.push({ idx: n, score: tentative + heuristic(n) });
      }
    }
  }
  if (!found) {
    return {
      ok: false,
      path: [],
      distance: Infinity,
      directed: undirectedReachable(nav, startIdx, goalIdx),
    };
  }
  const indices: number[] = [];
  for (let at = goalIdx; at !== -1; at = came[at]) {
    indices.push(at);
    if (at === startIdx) break;
  }
  indices.reverse();
  const cells = indices.map((i) => cellPoint(grid, i));
  const raw = dedupePoints([from, ...cells, to]);
  const path = smoothPath(nav, raw);
  return { ok: true, path, distance: pathLength(path) };
}

function dedupePoints(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.z - prev.z) > 0.01) out.push(p);
  }
  return out;
}

function smoothPath(nav: NavModel, raw: Point[]): Point[] {
  if (raw.length < 3) return raw.slice();
  const startWalkable = isPointWalkable(nav, raw[0]);
  const head = startWalkable ? [] : [raw[0]];
  const body = startWalkable ? raw : raw.slice(1);
  if (body.length < 3) return [...head, ...body];
  const out = [body[0]];
  let i = 0;
  while (i < body.length - 1) {
    let j = body.length - 1;
    while (j > i + 1 && !isSegmentWalkable(nav, body[i], body[j])) j--;
    out.push(body[j]);
    i = j;
  }
  return [...head, ...out];
}

export function pathLength(path: Point[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  }
  return total;
}

/** Progress along a polyline (0..1), tolerant of small position noise. */
export function pathProgress(path: Point[], p: Point): number {
  if (path.length < 2) return 0;
  let best = { d: Infinity, along: 0 };
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz;
    const len = Math.sqrt(len2);
    const t =
      len2 < EPS
        ? 0
        : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2));
    const q = { x: a.x + vx * t, z: a.z + vz * t };
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    if (d < best.d) best = { d, along: acc + len * t };
    acc += len;
  }
  return acc <= EPS ? 0 : Math.max(0, Math.min(1, best.along / acc));
}

/* ------------------------------------------------------------------ */
/* Stop-side selection                                                 */
/* ------------------------------------------------------------------ */

export type StopCandidate = {
  point: Point;
  side: StopSide;
  label: string;
  /** Angle between the viewing direction and the artwork normal. */
  offset: number;
};

const SIDE_LABELS: Record<StopSide, string> = {
  front: "正面",
  left: "左侧",
  right: "右侧",
};

const SIDE_OFFSETS: Record<StopSide, number> = {
  front: 0,
  left: 0.62,
  right: -0.62,
};

const SIDE_DISTANCE = 2.0;

export function stopCandidates(a: Artwork): StopCandidate[] {
  return SIDES.map((side) => {
    const offset = SIDE_OFFSETS[side];
    const angle = a.facing + offset;
    return {
      point: {
        x: a.position.x + Math.sin(angle) * SIDE_DISTANCE,
        z: a.position.z + Math.cos(angle) * SIDE_DISTANCE,
      },
      side,
      label: SIDE_LABELS[side],
      offset,
    };
  });
}

/** Camera yaw that faces the artwork from a given stop side. */
export function stopYaw(a: Artwork, side: StopSide): number {
  return a.facing + SIDE_OFFSETS[side];
}

/** Conventional viewing point, kept for external callers. */
export function viewingPoint(p: Point, facing: number): Point {
  return { x: p.x + Math.sin(facing) * 2, z: p.z + Math.cos(facing) * 2 };
}

export type FailureCode = "narrow" | "barrier" | "oneway" | "view" | "blocked";

export type ArtworkRoutePlan = {
  ok: boolean;
  stop: Point | null;
  stopSide: StopSide | null;
  stopLabel: string | null;
  path: Point[];
  distance: number;
  code?: FailureCode;
  reason?: string;
};

function candidateVisible(nav: NavModel, point: Point, a: Artwork) {
  return hasLineOfSight(nav, point, a.position);
}

function reachableToAny(
  model: NavModel,
  from: Point,
  candidates: StopCandidate[],
): boolean {
  return candidates.some(
    (c) => isPointWalkable(model, c.point) && findPath(model, from, c.point).ok,
  );
}

function diagnose(
  nav: NavModel,
  from: Point,
  artwork: Artwork,
  candidates: StopCandidate[],
): { code: FailureCode; reason: string } {
  const sighted = candidates.filter((c) => candidateVisible(nav, c.point, artwork));
  if (!sighted.length) {
    return {
      code: "view",
      reason: "围挡遮挡了这件作品，暂时没有可看到作品的停靠位置。",
    };
  }
  if (nav.settings.minWidth > 0.21) {
    const loose = makeNavModel({ ...nav.settings, minWidth: 0.2 }, nav.version);
    if (reachableToAny(loose, from, sighted)) {
      return {
        code: "narrow",
        reason: `通向作品的通道窄于当前最小通行宽度 ${nav.settings.minWidth.toFixed(1)} 米。`,
      };
    }
  }
  if (nav.oneWay) {
    // Test the counterfactual in priority order: if removing only the
    // one-way rule (or only the hoardings) opens a path, that is the cause.
    const both = makeNavModel(
      { ...nav.settings, oneWay: false },
      nav.version,
    );
    if (reachableToAny(both, from, sighted)) {
      return {
        code: "oneway",
        reason: "单向通道方向受限，按当前走向无法到达这件作品。",
      };
    }
  }
  if (nav.activeBarriers.length) {
    const open = makeNavModel(
      { ...nav.settings, barriers: [] },
      nav.version,
    );
    if (reachableToAny(open, from, sighted)) {
      return {
        code: "barrier",
        reason: "临时围挡阻断了前往这件作品的通道，可撤销围挡后重试。",
      };
    }
  }
  if (sighted.some((c) => !isPointWalkable(nav, c.point))) {
    return {
      code: "narrow",
      reason: `作品前的停靠区域过窄，小于当前最小通行宽度 ${nav.settings.minWidth.toFixed(1)} 米。`,
    };
  }
  return {
    code: "blocked",
    reason: "当前位置与作品之间没有可通行的路线。",
  };
}

export function planArtworkRoute(
  nav: NavModel,
  from: Point,
  artwork: Artwork,
): ArtworkRoutePlan {
  const candidates = stopCandidates(artwork);
  const viable: Array<{
    candidate: StopCandidate;
    path: Point[];
    distance: number;
    score: number;
  }> = [];

  for (const candidate of candidates) {
    // A stop only makes sense when the artwork is actually visible from it.
    if (!candidateVisible(nav, candidate.point, artwork)) continue;
    if (!isPointWalkable(nav, candidate.point)) continue;
    const result = findPath(nav, from, candidate.point);
    if (!result.ok) continue;
    // Prefer the conventional front view; the other sides are fallbacks.
    const sidePenalty = candidate.side === "front" ? 0 : 0.7;
    viable.push({
      candidate,
      path: result.path,
      distance: result.distance,
      score: result.distance + sidePenalty,
    });
  }

  if (!viable.length) {
    const { code, reason } = diagnose(nav, from, artwork, candidates);
    return {
      ok: false,
      stop: null,
      stopSide: null,
      stopLabel: null,
      path: [],
      distance: Infinity,
      code,
      reason,
    };
  }

  viable.sort((a, b) => a.score - b.score);
  const best = viable[0];
  return {
    ok: true,
    stop: { ...best.candidate.point },
    stopSide: best.candidate.side,
    stopLabel: best.candidate.label,
    path: best.path,
    distance: best.distance,
  };
}

/** Whether an existing route is still legal from the current position. */
export function validateRoute(
  nav: NavModel,
  from: Point,
  route: { stop: Point; path: Point[] },
): boolean {
  if (!route.path.length) return false;
  if (!isPointWalkable(nav, route.stop)) return false;
  let start = 0;
  if (!isPointWalkable(nav, from)) {
    start = route.path.findIndex((p) => isPointWalkable(nav, p));
    if (start < 0) return false;
  }
  for (let i = start + 1; i < route.path.length; i++) {
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

export function nearestPathIndex(path: Point[], p: Point): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = Math.hypot(path[i].x - p.x, path[i].z - p.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Arrival                                                             */
/* ------------------------------------------------------------------ */

/**
 * Whether the visitor has really reached an artwork: inside one of its
 * viewing zones, on legal ground, with an unobstructed view.  Plain Euclidean
 * distance is not enough because a hoarding may stand between the two.
 */
export function arrivedAtArtwork(
  nav: NavModel,
  p: Point,
  artwork: Artwork,
  tolerance = 1.05,
): StopCandidate | null {
  if (!isPointWalkable(nav, p)) return null;
  let best: { candidate: StopCandidate; d: number } | null = null;
  for (const candidate of stopCandidates(artwork)) {
    if (!candidateVisible(nav, candidate.point, artwork)) continue;
    const d = Math.hypot(p.x - candidate.point.x, p.z - candidate.point.z);
    if (d > tolerance) continue;
    if (!hasLineOfSight(nav, p, artwork.position)) continue;
    if (!best || d < best.d) best = { candidate, d };
  }
  return best?.candidate || null;
}

/* ------------------------------------------------------------------ */
/* Walking primitives                                                  */
/* ------------------------------------------------------------------ */

function clampToBounds(p: Point): Point {
  return {
    x: Math.max(WALKABLE_BOUNDS.minX, Math.min(WALKABLE_BOUNDS.maxX, p.x)),
    z: Math.max(WALKABLE_BOUNDS.minZ, Math.min(WALKABLE_BOUNDS.maxZ, p.z)),
  };
}

function approachEscape(nav: NavModel, from: Point, maxStep: number): Point {
  const exit = nearestWalkablePoint(nav, from);
  if (!exit) return from;
  const d = Math.hypot(exit.x - from.x, exit.z - from.z);
  if (d < EPS) return exit;
  const k = Math.min(d, maxStep) / d;
  return clampToBounds({
    x: from.x + (exit.x - from.x) * k,
    z: from.z + (exit.z - from.z) * k,
  });
}

/**
 * Move along the floor with sliding.  If a hoarding appeared under the
 * visitor, motion towards the nearest legal point is still allowed, so nobody
 * is trapped and nobody is teleported.
 */
export function stepFree(nav: NavModel, from: Point, delta: Point): Point {
  if (!isPointWalkable(nav, from)) {
    return approachEscape(
      nav,
      from,
      Math.max(0.001, Math.hypot(delta.x, delta.z)),
    );
  }
  const tryPoint = (candidate: Point): Point | null => {
    const q = clampToBounds(candidate);
    if (!inBounds(q)) return null;
    if (!isSegmentWalkable(nav, from, q)) return null;
    return q;
  };
  const full = tryPoint({ x: from.x + delta.x, z: from.z + delta.z });
  if (full) return full;
  const axisX = tryPoint({ x: from.x + delta.x, z: from.z });
  if (axisX) return axisX;
  const axisZ = tryPoint({ x: from.x, z: from.z + delta.z });
  if (axisZ) return axisZ;
  return from;
}

/**
 * One small step out of an illegal spot (e.g. a hoarding deployed on top of
 * the visitor).  This deliberately never jumps: it moves at walking speed
 * towards the nearest legal point and stops as soon as it is legal.
 */
export function escapeStep(nav: NavModel, from: Point, maxStep: number): Point {
  if (isPointWalkable(nav, from)) return from;
  const exit = nearestWalkablePoint(nav, from);
  if (!exit) return from;
  return approachEscape(nav, from, Math.max(0.001, maxStep));
}

/** Move towards a waypoint, used by keyboard walking and route following. */
export function stepToward(
  nav: NavModel,
  from: Point,
  target: Point,
  maxStep: number,
): Point {
  const d = Math.hypot(target.x - from.x, target.z - from.z);
  if (d < EPS) return from;
  const k = Math.min(d, maxStep) / d;
  return stepFree(nav, from, {
    x: (target.x - from.x) * k,
    z: (target.z - from.z) * k,
  });
}

export function isAtStop(p: Point, stop: Point, tolerance = 0.3): boolean {
  return Math.hypot(p.x - stop.x, p.z - stop.z) <= tolerance;
}

/** Arrow positions drawn on the map/floor for the one-way aisle. */
export function oneWayArrows(nav: NavModel): Array<{ point: Point; dir: Point }> {
  if (!nav.oneWay) return [];
  const { x, z, d, dir } = nav.oneWay;
  const out: Array<{ point: Point; dir: Point }> = [];
  for (let i = -1; i <= 1; i++) {
    out.push({ point: { x, z: z + i * (d / 3.4) }, dir });
  }
  return out;
}
