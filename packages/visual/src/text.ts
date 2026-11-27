/**
 * Text fitting without a browser. Widths are estimated per font with deliberately generous
 * average character widths, so the renderer never needs to wrap a line further than planned:
 * what the readability check measures is what gets drawn.
 */
export type FontRole = "display" | "body" | "mono";

/** Average glyph width as a fraction of font size (high side of each font's real average). */
export const CHAR_WIDTH: Record<FontRole, number> = { display: 0.5, body: 0.58, mono: 0.62 };
export const LINE_HEIGHT: Record<FontRole, number> = { display: 1.1, body: 1.35, mono: 1.35 };

export function textWidth(text: string, size: number, role: FontRole): number {
  let units = 0;
  for (const ch of text) units += /[A-Z@#%&MW]/.test(ch) ? 1.2 : /[il.,;:'!|]/.test(ch) ? 0.5 : ch === " " ? 0.55 : 1;
  return units * CHAR_WIDTH[role] * size;
}

/** Greedy word wrap. A single word wider than the box is reported, never split. */
export function wrap(text: string, size: number, width: number, role: FontRole): { lines: string[]; tooWide: boolean } {
  const lines: string[] = [];
  let tooWide = false;
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (textWidth(word, size, role) > width) tooWide = true;
      const next = line ? `${line} ${word}` : word;
      if (line && textWidth(next, size, role) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return { lines, tooWide };
}

export interface FitResult {
  size: number;
  lines: string[];
  fits: boolean;
}

/** Largest size between min and max at which the text fits the box. */
export function fitText(text: string, box: { w: number; h: number }, role: FontRole, max: number, min: number): FitResult {
  for (let size = max; size >= min; size -= 2) {
    const { lines, tooWide } = wrap(text, size, box.w, role);
    if (!tooWide && lines.length * size * LINE_HEIGHT[role] <= box.h) return { size, lines, fits: true };
  }
  const { lines } = wrap(text, min, box.w, role);
  return { size: min, lines, fits: false };
}

export function wordCount(text: string | null | undefined): number {
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}
