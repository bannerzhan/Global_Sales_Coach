// 生成 PWA 图标（纯 Node，无依赖）：teal 实色方块 + 白色 "G" 字形（极简像素字）。
// 用法：node scripts/gen-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "..", "public");

// ---- CRC32 ----
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function makePng(size, getPixel) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // raw scanlines: each row prefixed with filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = getPixel(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = a;
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// teal 背景 + 白色 "G"（用圆形近似 + 简单几何，保证可识别）
const TEAL = [13, 148, 136];
const WHITE = [255, 255, 255];
function roundedBg(x, y, s) {
  const m = Math.floor(s * 0.12); // 圆角边距
  const inCircle = (cx, cy, r) => Math.hypot(x - cx, y - cy) <= r;
  if (inCircle(s / 2, s / 2, s / 2 - 1) && !inCircle(s / 2, s / 2, m)) {
    // 圆角方块：挖去四角
    const corner = Math.floor(s * 0.18);
    const inCorner =
      (x < corner && y < corner) ||
      (x > s - corner && y < corner) ||
      (x < corner && y > s - corner) ||
      (x > s - corner && y > s - corner);
    if (inCorner) return [0, 0, 0, 0];
    return TEAL;
  }
  return [0, 0, 0, 0];
}
// 极简 "G"：用环形 + 右侧开口近似（白）
function letterG(x, y, s) {
  const cx = s / 2;
  const cy = s / 2;
  const r = s * 0.26;
  const thickness = s * 0.09;
  const d = Math.hypot(x - cx, y - cy);
  if (d >= r - thickness && d <= r + thickness) {
    // 开口：右侧偏下不画（模拟 G 的横杠开口）
    const ang = Math.atan2(y - cy, x - cx); // -PI..PI
    if (ang > -0.5 && ang < 1.0) return false; // 开口区间
    return true;
  }
  // G 内侧横杠
  if (d < r && x > cx && y > cy - thickness && y < cy + thickness && Math.abs(x - cx) < r * 0.8) {
    return true;
  }
  return false;
}
function pixel(size) {
  return (x, y) => {
    const bg = roundedBg(x, y, size);
    if (bg[3] === 0) return [0, 0, 0, 0];
    if (letterG(x, y, size)) return [...WHITE, 255];
    return [...TEAL, 255];
  };
}

mkdirSync(PUBLIC, { recursive: true });
writeFileSync(join(PUBLIC, "icon-192.png"), makePng(192, pixel(192)));
writeFileSync(join(PUBLIC, "icon-512.png"), makePng(512, pixel(512)));
writeFileSync(join(PUBLIC, "apple-touch-icon.png"), makePng(180, pixel(180)));
console.log("icons generated: icon-192.png, icon-512.png, apple-touch-icon.png");
