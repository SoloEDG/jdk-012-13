import * as THREE from "three";
import { artworks } from "../../../shared/catalog";
import type { Point } from "../../../shared/types";
import { artTexture } from "./artTexture";
import type { Barrier, NavModel } from "./nav";

export type SceneHandle = {
  scene: THREE.Scene;
  frames: THREE.Mesh[];
  sculpture: THREE.Mesh;
  /** Rebuilds temporary hoardings and the one-way floor marking. */
  updateNav: (nav: NavModel) => void;
  /** Rebuilds the green guidance line on the floor. */
  updateRoute: (path: Point[], stop: Point | null, blocked: boolean) => void;
};

export function buildScene(): SceneHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#d7d5ce");
  scene.fog = new THREE.Fog("#d7d5ce", 14, 32);
  scene.add(new THREE.HemisphereLight("#fff8e8", "#74675a", 2.2));
  const sun = new THREE.DirectionalLight("#fff2d7", 3);
  sun.position.set(3, 9, 4);
  scene.add(sun);
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: string,
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.82 }),
    );
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  };
  box(12, 0.15, 16, 0, -0.08, 0, "#b4b0a7");
  box(0.3, 5.8, 16, -6, 2.9, 0, "#e2ded4");
  box(0.3, 5.8, 16, 6, 2.9, 0, "#e2ded4");
  box(12, 5.8, 0.3, 0, 2.9, -8, "#d7d5cb");
  box(12, 5.8, 0.3, 0, 2.9, 8, "#e2ded4");
  for (let z = -8; z <= 8; z += 2) {
    box(12, 0.012, 0.018, 0, 0.01, z, "#9d9b93");
  }
  for (let x = -6; x <= 6; x += 2) box(0.018, 0.012, 16, x, 0.01, 0, "#9d9b93");
  for (let z = -5; z <= 5; z += 5) {
    box(10, 0.16, 0.2, 0, 5.1, z, "#b7b4aa");
    box(7, 0.03, 0.12, 0, 5, z, "#fff6d9");
  }
  box(1.8, 0.7, 1.5, 0, 0.35, -0.3, "#d3cfc4");
  const sculpture = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.65, 0.14, 100, 16),
    new THREE.MeshStandardMaterial({
      color: "#81765f",
      metalness: 0.72,
      roughness: 0.25,
    }),
  );
  sculpture.position.set(0, 1.7, -0.3);
  scene.add(sculpture);

  const frames: THREE.Mesh[] = [];
  for (const a of artworks) {
    const group = new THREE.Group();
    group.position.set(a.position.x, 2.45, a.position.z);
    group.rotation.y = a.facing;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 2.9, 0.12),
      new THREE.MeshStandardMaterial({ color: "#423e35" }),
    );
    group.add(frame);
    const image = new THREE.Mesh(
      new THREE.PlaneGeometry(2.13, 2.73),
      new THREE.MeshBasicMaterial({ map: artTexture(a) }),
    );
    image.position.z = 0.07;
    image.userData.artworkId = a.id;
    group.add(image);
    frames.push(image);
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.13),
      new THREE.MeshBasicMaterial({ color: "#f2eee3" }),
    );
    plaque.position.set(0.7, -1.66, 0.08);
    group.add(plaque);
    scene.add(group);
  }

  const navGroup = new THREE.Group();
  scene.add(navGroup);
  const routeGroup = new THREE.Group();
  scene.add(routeGroup);

  const disposable: THREE.Object3D[] = [];

  const clearGroup = (group: THREE.Group) => {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            for (const v of Object.values(m))
              if (v instanceof THREE.Texture) v.dispose();
            m.dispose();
          }
        }
      });
    }
  };
  void disposable;

  const hoarding = (b: Barrier) => {
    const group = new THREE.Group();
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, 1.05, Math.max(0.06, b.d)),
      new THREE.MeshStandardMaterial({ color: "#9d4a3a", roughness: 0.7 }),
    );
    panel.position.y = 0.55;
    group.add(panel);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, 0.1, Math.max(0.07, b.d + 0.01)),
      new THREE.MeshStandardMaterial({ color: "#f0e7cf", roughness: 0.6 }),
    );
    stripe.position.y = 1.0;
    group.add(stripe);
    // Feet make the physical footprint readable at floor level.
    for (const sx of [-1, 1]) {
      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.06, Math.max(0.4, b.d)),
        new THREE.MeshStandardMaterial({ color: "#6e5d4e" }),
      );
      foot.position.set((sx * b.w) / 2 - sx * 0.08, 0.03, 0);
      group.add(foot);
    }
    group.position.set(b.x, 0, b.z);
    return group;
  };

  const floormark = (nav: NavModel) => {
    const group = new THREE.Group();
    const aisle = nav.oneWay;
    if (!aisle) return group;
    const mat = new THREE.MeshBasicMaterial({
      color: "#c8ae62",
      transparent: true,
      opacity: 0.35,
    });
    const bed = new THREE.Mesh(
      new THREE.PlaneGeometry(aisle.w, aisle.d),
      mat,
    );
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(aisle.x, 0.012, aisle.z);
    group.add(bed);
    const arrowMat = new THREE.MeshBasicMaterial({ color: "#7d6526" });
    for (let i = -1; i <= 1; i++) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.24);
      shape.lineTo(0.18, -0.06);
      shape.lineTo(0, 0.03);
      shape.lineTo(-0.18, -0.06);
      shape.closePath();
      const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), arrowMat);
      arrow.rotation.x = Math.PI / 2;
      arrow.rotation.z = Math.PI;
      arrow.position.set(aisle.x, 0.016, aisle.z + i * (aisle.d / 3));
      group.add(arrow);
    }
    return group;
  };

  const updateNav = (nav: NavModel) => {
    clearGroup(navGroup);
    for (const barrier of nav.activeBarriers) navGroup.add(hoarding(barrier));
    navGroup.add(floormark(nav));
  };

  const updateRoute = (
    path: Point[],
    stop: Point | null,
    blocked: boolean,
  ) => {
    clearGroup(routeGroup);
    if (path.length > 1) {
      const points = path.map((p) => new THREE.Vector3(p.x, 0.02, p.z));
      const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.2);
      const geometry = new THREE.TubeGeometry(curve, 80, 0.035, 6, false);
      const material = new THREE.MeshBasicMaterial({
        color: blocked ? "#a4503f" : "#3f7d5c",
        transparent: true,
        opacity: 0.85,
      });
      routeGroup.add(new THREE.Mesh(geometry, material));
    }
    if (stop) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.24, 0.3, 40),
        new THREE.MeshBasicMaterial({
          color: blocked ? "#a4503f" : "#3f7d5c",
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(stop.x, 0.022, stop.z);
      routeGroup.add(ring);
    }
  };

  return { scene, frames, sculpture, updateNav, updateRoute };
}

export function disposeScene(scene: THREE.Scene) {
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const v of Object.values(m))
          if (v instanceof THREE.Texture) v.dispose();
        m.dispose();
      }
    }
  });
}
