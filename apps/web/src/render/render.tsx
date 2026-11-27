import "server-only";
import type { ArrowEl, ImageEl, RectEl, SlidePlan, TextEl } from "@contentos/visual";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * Draws a slide plan (from @contentos/visual) as a 1080×1350 PNG with next/og. The plan already
 * fixed every font size and line break, so this only places elements; it never re-flows text.
 */

// The app runs from apps/web on Vercel and from the repo root in tests.
// The files themselves are shipped by outputFileTracingIncludes in next.config.ts.
const FONT_DIR =
  [join(/* turbopackIgnore: true */ process.cwd(), "src/render/fonts"), join(/* turbopackIgnore: true */ process.cwd(), "apps/web/src/render/fonts")].find((d) =>
    existsSync(d),
  ) ?? join(/* turbopackIgnore: true */ process.cwd(), "src/render/fonts");
const FONT_FILES = [
  { name: "display", file: "cormorant-garamond-latin-500-normal.woff", weight: 500 },
  { name: "display", file: "cormorant-garamond-latin-600-normal.woff", weight: 600 },
  { name: "body", file: "dm-sans-latin-400-normal.woff", weight: 400 },
  { name: "body", file: "dm-sans-latin-500-normal.woff", weight: 500 },
  { name: "body", file: "dm-sans-latin-700-normal.woff", weight: 700 },
  { name: "mono", file: "ibm-plex-mono-latin-400-normal.woff", weight: 400 },
  { name: "mono", file: "ibm-plex-mono-latin-500-normal.woff", weight: 500 },
] as const;

type Font = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700; style: "normal" };
let fonts: Promise<Font[]> | undefined;

function loadFonts(): Promise<Font[]> {
  fonts ??= Promise.all(
    FONT_FILES.map(async (f) => {
      const buf = await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ FONT_DIR, f.file));
      return { name: f.name, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight: f.weight, style: "normal" as const };
    }),
  );
  return fonts;
}

const LINE_HEIGHT = { display: 1.1, body: 1.35, mono: 1.35 } as const;

/** Split a line into runs of plain and highlighted text (adjacent runs merged, spaces kept inside runs). */
export function runs(line: string, emphasis: string[]): Array<{ text: string; em: boolean }> {
  if (!emphasis.length) return [{ text: line, em: false }];
  const targets = new Set(emphasis.flatMap((e) => e.toLowerCase().split(/\s+/)));
  const out: Array<{ text: string; em: boolean }> = [];
  for (const token of line.split(/(\s+)/)) {
    if (!token) continue;
    const isSpace = /^\s+$/.test(token);
    const em = !isSpace && targets.has(token.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, ""));
    const last = out[out.length - 1];
    // Spaces join the run before them, so a highlighted word never carries a coloured space.
    if (last && (isSpace || last.em === em)) last.text += token;
    else out.push({ text: token, em });
  }
  return out;
}

function Text({ el }: { el: TextEl }) {
  return (
    <div
      style={{
        position: "absolute",
        left: el.x,
        top: el.y,
        width: el.w,
        height: el.h,
        display: "flex",
        flexDirection: "column",
        alignItems: el.align === "center" ? "center" : el.align === "right" ? "flex-end" : "flex-start",
        justifyContent: el.part.startsWith("node_") || el.part === "placeholder" ? "center" : "flex-start",
        fontFamily: el.font,
        fontSize: el.size,
        fontWeight: el.weight,
        lineHeight: LINE_HEIGHT[el.font],
        color: el.color,
      }}
    >
      {el.lines.map((line, i) => (
        <div key={i} style={{ display: "flex", whiteSpace: "pre" }}>
          {runs(line, el.emphasis).map((w, j) => (
            <span key={j} style={w.em ? { color: el.emphasisColor } : {}}>
              {w.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Rect({ el }: { el: RectEl }) {
  return (
    <div
      style={{
        position: "absolute",
        left: el.x,
        top: el.y,
        width: el.w,
        height: el.h,
        backgroundColor: el.fill,
        borderRadius: el.radius,
        ...(el.stroke ? { border: `3px dashed ${el.stroke}` } : {}),
      }}
    />
  );
}

function Arrow({ el }: { el: ArrowEl }) {
  const h = Math.max(12, el.y2 - el.y1);
  const head = Math.min(16, h / 2);
  return (
    <svg width={32} height={h} viewBox={`0 0 32 ${h}`} style={{ position: "absolute", left: el.x - 16, top: el.y1 }}>
      <line x1={16} y1={0} x2={16} y2={h - head} stroke={el.color} strokeWidth={4} />
      <polygon points={`4,${h - head} 28,${h - head} 16,${h}`} fill={el.color} />
    </svg>
  );
}

function Image({ el, src }: { el: ImageEl; src: string | undefined }) {
  if (!src) return null;
  return (
    <img src={src} alt="" width={el.w} height={el.h} style={{ position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h, objectFit: "contain", borderRadius: 20 }} />
  );
}

/** images: media id → data URL (already loaded and ownership-checked by the caller). */
export async function renderSlidePng(plan: SlidePlan, images: Record<string, string> = {}): Promise<Uint8Array> {
  const response = new ImageResponse(
    (
      <div style={{ width: plan.width, height: plan.height, display: "flex", position: "relative", backgroundColor: plan.bg }}>
        {plan.elements.map((el, i) =>
          el.kind === "text" ? (
            <Text key={i} el={el} />
          ) : el.kind === "rect" ? (
            <Rect key={i} el={el} />
          ) : el.kind === "arrow" ? (
            <Arrow key={i} el={el} />
          ) : (
            <Image key={i} el={el} src={images[el.mediaId]} />
          ),
        )}
      </div>
    ),
    { width: plan.width, height: plan.height, fonts: await loadFonts() },
  );
  return new Uint8Array(await response.arrayBuffer());
}
