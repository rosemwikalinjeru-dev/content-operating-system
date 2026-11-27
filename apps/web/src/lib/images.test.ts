import { describe, expect, it } from "vitest";
import { sniffImage } from "./images";

describe("upload sniffing", () => {
  it("trusts bytes, not names", () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 1200);
    new DataView(png.buffer).setUint32(20, 800);
    expect(sniffImage(png)).toEqual({ mime: "image/png", width: 1200, height: 800 });
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))?.mime).toBe("image/jpeg");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});
