/**
 * Browser-side MP4 export (owner choice 2026-11-28): frames are drawn on a canvas and encoded
 * with WebCodecs (H.264), then packed into an MP4 with mp4-muxer. Nothing is uploaded; the
 * owner's computer does the work. Works in Chrome, Edge and Safari (WebCodecs + H.264).
 */
import { frameState, schedule, FPS, type SlidePlan } from "@contentos/visual";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { drawFrame } from "./draw";

const FONTS = [
  { family: "display", file: "cormorant-garamond-latin-500-normal.woff", weight: "500" },
  { family: "display", file: "cormorant-garamond-latin-600-normal.woff", weight: "600" },
  { family: "body", file: "dm-sans-latin-400-normal.woff", weight: "400" },
  { family: "body", file: "dm-sans-latin-500-normal.woff", weight: "500" },
  { family: "body", file: "dm-sans-latin-700-normal.woff", weight: "700" },
  { family: "mono", file: "ibm-plex-mono-latin-400-normal.woff", weight: "400" },
  { family: "mono", file: "ibm-plex-mono-latin-500-normal.woff", weight: "500" },
];

let fontsReady: Promise<void> | undefined;

export function loadFonts(base = "/fonts"): Promise<void> {
  fontsReady ??= Promise.all(
    FONTS.map(async (f) => {
      const face = new FontFace(f.family, `url(${base}/${f.file})`, { weight: f.weight });
      await face.load();
      document.fonts.add(face);
    }),
  ).then(() => undefined);
  return fontsReady;
}

export function videoSupported(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoFrame" in window;
}

const CODECS = ["avc1.640028", "avc1.4d0028", "avc1.42e028"];

async function pickCodec(width: number, height: number): Promise<string> {
  for (const codec of CODECS) {
    const support = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: 6_000_000, framerate: FPS });
    if (support.supported) return codec;
  }
  throw new Error("This browser cannot make MP4 video. Use Chrome, Edge or Safari on a computer.");
}

/** Load images for screenshot slides (media id → URL served by the app). */
export async function loadImages(urls: Record<string, string>): Promise<Record<string, ImageBitmap>> {
  const out: Record<string, ImageBitmap> = {};
  for (const [id, url] of Object.entries(urls)) {
    const res = await fetch(url, { credentials: "same-origin" });
    if (res.ok) out[id] = await createImageBitmap(await res.blob());
  }
  return out;
}

export async function encodeCarousel(
  plans: SlidePlan[],
  opts: { images?: Record<string, CanvasImageSource>; onProgress?: (done: number, total: number) => void; fontBase?: string } = {},
): Promise<Blob> {
  if (!plans.length) throw new Error("Nothing to export.");
  if (!videoSupported()) throw new Error("This browser cannot make MP4 video. Use Chrome, Edge or Safari on a computer.");
  await loadFonts(opts.fontBase);
  const { width, height } = plans[0]!;
  const codec = await pickCodec(width, height);
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: "avc", width, height, frameRate: FPS }, fastStart: "in-memory" });
  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      failure = e instanceof Error ? e : new Error(String(e));
    },
  });
  encoder.configure({ codec, width, height, bitrate: 6_000_000, framerate: FPS, avc: { format: "avc" } });

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  const frames = schedule(plans);
  for (const [i, f] of frames.entries()) {
    if (failure) throw failure;
    const plan = plans[f.slide]!;
    drawFrame(ctx, plan, frameState(plan, f.t), opts.images ?? {}, plans[f.slide + 1]?.bg);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1_000_000) / FPS), duration: Math.round(1_000_000 / FPS) });
    // A keyframe at every slide start (and every 2 seconds) keeps seeking smooth.
    encoder.encode(frame, { keyFrame: f.t === 0 || i % (FPS * 2) === 0 });
    frame.close();
    // Let the encoder drain so memory stays flat on long carousels.
    if (encoder.encodeQueueSize > 30) await new Promise<void>((r) => encoder.addEventListener("dequeue", () => r(), { once: true }));
    if (i % 10 === 0) opts.onProgress?.(i, frames.length);
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  muxer.finalize();
  opts.onProgress?.(frames.length, frames.length);
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}
