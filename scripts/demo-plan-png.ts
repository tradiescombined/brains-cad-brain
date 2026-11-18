/**
 * Tiny dependency-free PNG canvas used by the demo seed to draw a simple floor plan.
 * RGB 8-bit, filter 0, zlib deflate via node:zlib, CRC32 computed here.
 */
import { deflateSync } from "node:zlib";

export type RGB = [number, number, number];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** 5x7 bitmap glyphs (rows top→bottom). */
const FONT: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
  "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

export class Canvas {
  readonly px: Uint8Array;
  constructor(readonly width: number, readonly height: number, bg: RGB = [255, 255, 255]) {
    this.px = new Uint8Array(width * height * 3);
    for (let i = 0; i < width * height; i++) this.px.set(bg, i * 3);
  }
  set(x: number, y: number, c: RGB) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.px.set(c, (y * this.width + x) * 3);
  }
  fillRect(x0: number, y0: number, x1: number, y1: number, c: RGB) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c);
  }
  /** Line with square pen of the given thickness; dash = [on, off] in px. */
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, thick = 1, dash?: [number, number]) {
    const len = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    const h = Math.floor(thick / 2);
    for (let i = 0; i <= len; i++) {
      if (dash && i % (dash[0] + dash[1]) >= dash[0]) continue;
      const x = x0 + ((x1 - x0) * i) / len, y = y0 + ((y1 - y0) * i) / len;
      this.fillRect(Math.round(x) - h, Math.round(y) - h, Math.round(x) - h + thick - 1, Math.round(y) - h + thick - 1, c);
    }
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: RGB, thick = 1, dash?: [number, number]) {
    this.line(x0, y0, x1, y0, c, thick, dash);
    this.line(x1, y0, x1, y1, c, thick, dash);
    this.line(x1, y1, x0, y1, c, thick, dash);
    this.line(x0, y1, x0, y0, c, thick, dash);
  }
  circle(cx: number, cy: number, r: number, c: RGB, fill = true) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y);
      if (fill ? d <= r : Math.abs(d - r) < 0.8) this.set(cx + x, cy + y, c);
    }
  }
  text(x: number, y: number, s: string, c: RGB, scale = 2) {
    let cx = x;
    for (const ch of s.toUpperCase()) {
      const g = FONT[ch] ?? FONT[" "];
      g.forEach((row, ry) => [...row].forEach((b, rx) => {
        if (b === "#") this.fillRect(cx + rx * scale, y + ry * scale, cx + rx * scale + scale - 1, y + ry * scale + scale - 1, c);
      }));
      cx += 6 * scale;
    }
  }
  textWidth(s: string, scale = 2) {
    return s.length * 6 * scale - scale;
  }
  toPng(): Buffer {
    const { width: w, height: h } = this;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) {
      raw[y * (w * 3 + 1)] = 0;
      Buffer.from(this.px.buffer, this.px.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

/**
 * Draws the demo "rear extension & deck" ground floor plan at 10 mm per pixel (1400 x 1000 px = 14 x 10 m).
 * Geometry matches the takeoff measurements created by seed-demo.ts.
 */
export function drawExtensionPlan(): { png: Buffer; width: number; height: number; mmPerPx: number } {
  const W = 1400, H = 1000;
  const cv = new Canvas(W, H, [252, 252, 250]);
  const grid: RGB = [228, 234, 240], wall: RGB = [40, 44, 52], faint: RGB = [150, 150, 150];
  const deckBoard: RGB = [176, 128, 82], deckFill: RGB = [244, 230, 212], dim: RGB = [200, 60, 50], ink: RGB = [30, 30, 30];
  // 1 m grid
  for (let x = 0; x < W; x += 100) cv.line(x, 0, x, H - 1, grid);
  for (let y = 0; y < H; y += 100) cv.line(0, y, W - 1, y, grid);

  // Existing dwelling (dashed)
  cv.fillRect(100, 90, 1300, 330, [238, 238, 236]);
  cv.rect(100, 90, 1300, 330, faint, 4, [18, 10]);
  cv.text(560, 190, "EXISTING DWELLING", faint, 3);

  // Deck (drawn first so walls sit on top)
  cv.fillRect(990, 330, 1350, 930, deckFill);
  for (let y = 344; y < 930; y += 14) cv.line(992, y, 1348, y, deckBoard);
  cv.rect(990, 330, 1350, 930, deckBoard, 4);
  cv.fillRect(1100, 600, 1250, 640, deckFill);
  cv.text(1110, 608, "NEW DECK", ink, 3);

  // Extension slab + walls
  cv.fillRect(150, 330, 990, 810, [255, 255, 255]);
  const t = 14; // ~140 mm external wall
  cv.line(150, 330, 150, 810, wall, t);
  cv.line(150, 810, 990, 810, wall, t);
  cv.line(990, 330, 990, 500, wall, t);
  cv.line(990, 680, 990, 810, wall, t);
  // sliding door to deck
  cv.line(990, 500, 990, 680, [90, 140, 200], 4);
  cv.line(980, 500, 980, 600, [90, 140, 200], 2);
  // internal wall with door opening
  cv.line(600, 330, 600, 690, wall, 9);
  cv.line(600, 690, 690, 600, faint, 2);
  // windows on south wall
  for (const [a, b] of [[260, 480], [720, 900]]) {
    cv.fillRect(a, 803, b, 817, [255, 255, 255]);
    cv.rect(a, 803, b, 817, [90, 140, 200], 2);
  }
  cv.text(300, 520, "BED 4", ink, 4);
  cv.text(700, 520, "FAMILY", ink, 4);
  // downlights (8)
  for (const [x, y] of [[280, 440], [470, 440], [280, 700], [470, 700], [700, 440], [880, 440], [700, 700], [880, 700]]) {
    cv.circle(x, y, 9, [230, 170, 20]);
    cv.circle(x, y, 9, ink, false);
  }

  // Dimensions
  const dimH = (x0: number, x1: number, y: number, label: string) => {
    cv.line(x0, y, x1, y, dim, 2);
    cv.line(x0, y - 12, x0, y + 12, dim, 2);
    cv.line(x1, y - 12, x1, y + 12, dim, 2);
    const w = cv.textWidth(label, 3);
    cv.fillRect((x0 + x1) / 2 - w / 2 - 6, y - 30, (x0 + x1) / 2 + w / 2 + 6, y - 6, [252, 252, 250]);
    cv.text((x0 + x1) / 2 - w / 2, y - 27, label, dim, 3);
  };
  const dimV = (y0: number, y1: number, x: number, label: string) => {
    cv.line(x, y0, x, y1, dim, 2);
    cv.line(x - 12, y0, x + 12, y0, dim, 2);
    cv.line(x - 12, y1, x + 12, y1, dim, 2);
    cv.text(x - cv.textWidth(label, 3) - 10, (y0 + y1) / 2 - 10, label, dim, 3);
  };
  dimH(150, 990, 870, "8400");
  dimH(990, 1350, 965, "3600");
  dimV(330, 810, 110, "4800");
  dimV(330, 930, 1385, "");
  cv.text(1290, 640, "6000", dim, 2);

  // Title block
  cv.fillRect(0, 0, W - 1, 60, [24, 64, 72]);
  cv.text(24, 18, "PROPOSED REAR EXTENSION & DECK - GROUND FLOOR", [255, 255, 255], 4);
  cv.text(24, 905, "DEMO PLAN - NOT FOR CONSTRUCTION", faint, 2);
  cv.text(24, 935, "SCALE 1:100 AT 10MM/PX - DIMENSIONS IN MM", faint, 2);
  // scale bar 0-5 m
  for (let i = 0; i < 5; i++) cv.fillRect(24 + i * 100, 965, 24 + i * 100 + 99, 975, i % 2 ? [255, 255, 255] : ink);
  cv.rect(24, 965, 524, 975, ink, 1);
  cv.text(24, 980, "0", ink, 2);
  cv.text(512, 980, "5M", ink, 2);

  return { png: cv.toPng(), width: W, height: H, mmPerPx: 10 };
}
