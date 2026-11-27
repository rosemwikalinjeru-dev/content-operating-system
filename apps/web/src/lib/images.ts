/** Detect PNG/JPEG from the file's own bytes, never from its name or declared type. */
export function sniffImage(bytes: Uint8Array): { mime: "image/png" | "image/jpeg"; width: number | null; height: number | null } | null {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const v = new DataView(bytes.buffer, bytes.byteOffset);
    return { mime: "image/png", width: v.getUint32(16), height: v.getUint32(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", width: null, height: null };
  return null;
}
