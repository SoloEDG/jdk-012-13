export type Point = { x: number; z: number };
export type Artwork = {
  id: string;
  title: string;
  en: string;
  artist: string;
  year: string;
  medium: string;
  color: string;
  position: Point;
  facing: number;
  description: string;
  transcript: string[];
  duration: number;
};
export type Route = {
  id: string;
  name: string;
  subtitle: string;
  stops: string[];
};
export type Visit = { id: string; seconds: number; at: number };
export type GalleryDocument = {
  favorites: string[];
  visits: Visit[];
  notes: Record<string, string>;
};
export type TourState = {
  routeId: string | null;
  step: number;
  phase:
    | "idle"
    | "walking"
    | "listening"
    | "paused"
    | "waiting"
    | "done";
  /** Phase to return to when a paused tour resumes. */
  resumePhase?: "walking" | "listening";
  /** Why the tour is waiting, shown in the panel. */
  reason?: string;
};
export type AudioState = {
  artworkId: string | null;
  elapsed: number;
  playing: boolean;
  rate: number;
};
export type Command =
  { type: "focus"; id: string } | { type: "favorite"; id: string };
