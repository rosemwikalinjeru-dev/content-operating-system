/**
 * Draws one frame of a slide plan on a 2D canvas (browser). Uses the same plan the PNG renderer
 * uses, so the video matches the still slides. Fonts are the bundled brand fonts, registered as
 * "display", "body" and "mono".
 */
import type { ElementState, SlidePlan, TextEl } from "@contentos/visual";

const LINE_HEIGHT = { display: 1.1, body: 1.35, mono: 1.35 } as const;

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Split a line into plain and highlighted runs (same rule as the PNG renderer). */
function runs(line: string, emphasis: string[]): Array<{ text: string; em: boolean }> {
  if (!emphasis.length) return [{ text: line, em: false }];
  const targets = new Set(emphasis.flatMap((e) => e.toLowerCase().split(/\s+/)));
  const out: Array<{ text: string; em: boolean }> = [];
  for (const token of line.split(/(\s+)/)) {
    if (!token) continue;
    const isSpace = /^\s+$/.test(token);
    const em = !isSpace && targets.has(token.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, ""));
    const last = out[out.length - 1];
    if (last && (isSpace || last.em === em)) last.text += token;
    else out.push({ text: token, em });
  }
  return out;
}

function drawText(ctx: Ctx, el: TextEl, s: ElementState): void {
  ctx.font = `${el.weight} ${el.size}px ${el.font}`;
  ctx.textBaseline = "middle";
  const lh = el.size * LINE_HEIGHT[el.font];
  const block = el.lines.length * lh;
  const centred = el.part.startsWith("node_") || el.part === "placeholder";
  const top = el.y + s.dy + (centred ? (el.h - block) / 2 : 0);
  el.lines.forEach((line, i) => {
    const parts = runs(line, el.emphasis);
    const width = parts.reduce((w, p) => w + ctx.measureText(p.text).width, 0);
    let x = el.align === "center" ? el.x + (el.w - width) / 2 : el.align === "right" ? el.x + el.w - width : el.x;
    const y = top + i * lh + lh / 2;
    for (const p of parts) {
      ctx.fillStyle = p.em && s.emphasisOn ? el.emphasisColor : el.color;
      ctx.fillText(p.text, x, y);
      x += ctx.measureText(p.text).width;
    }
  });
}

export function drawFrame(
  ctx: Ctx,
  plan: SlidePlan,
  frame: { states: ElementState[]; fade: number },
  images: Record<string, CanvasImageSource>,
  nextBg?: string,
): void {
  // Behind the fading slide sits the next slide's background, so slides dissolve into each other.
  ctx.globalAlpha = 1;
  ctx.fillStyle = nextBg ?? plan.bg;
  ctx.fillRect(0, 0, plan.width, plan.height);
  ctx.globalAlpha = frame.fade;
  ctx.fillStyle = plan.bg;
  ctx.fillRect(0, 0, plan.width, plan.height);

  plan.elements.forEach((el, i) => {
    const s = frame.states[i]!;
    if (s.opacity <= 0) return;
    ctx.globalAlpha = frame.fade * s.opacity;
    if (el.kind === "text") drawText(ctx, el, s);
    else if (el.kind === "rect") {
      ctx.beginPath();
      ctx.roundRect(el.x, el.y + s.dy, el.w, el.h, el.radius);
      ctx.fillStyle = el.fill;
      ctx.fill();
      if (el.stroke) {
        ctx.setLineDash([12, 10]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = el.stroke;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (el.kind === "arrow") {
      const h = el.y2 - el.y1;
      const head = Math.min(16, h / 2);
      const drawn = h * s.progress;
      ctx.strokeStyle = el.color;
      ctx.fillStyle = el.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(el.x, el.y1);
      ctx.lineTo(el.x, el.y1 + Math.max(0, Math.min(drawn, h - head)));
      ctx.stroke();
      if (s.progress >= 1) {
        ctx.beginPath();
        ctx.moveTo(el.x - 12, el.y2 - head);
        ctx.lineTo(el.x + 12, el.y2 - head);
        ctx.lineTo(el.x, el.y2);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      const img = images[el.mediaId];
      if (!img) return;
      const iw = (img as { width: number }).width;
      const ih = (img as { height: number }).height;
      const scale = Math.min(el.w / iw, el.h / ih);
      const w = iw * scale;
      const h = ih * scale;
      ctx.drawImage(img, el.x + (el.w - w) / 2, el.y + s.dy + (el.h - h) / 2, w, h);
    }
  });
  ctx.globalAlpha = 1;
}
