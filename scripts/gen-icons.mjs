// Generates PWA icons (192, 512, maskable-512) as PNGs in the Alpine Editorial
// palette: glacier field, paper snowflake, ink accents. Zero dependencies.
// Run: node scripts/gen-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const TAU = Math.PI * 2;

function drawIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2;

  // Background: true black #0a0b0d with a faint cold vignette toward edges.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = (x - cx) / R;
      const dy = (y - cy) / R;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const t = Math.min(1, Math.max(0, dist));
      // center #0d0f13 -> edge #05060a
      const r = Math.round(13 - 8 * t);
      const g = Math.round(15 - 9 * t);
      const b = Math.round(19 - 9 * t);
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }

  // Snowflake: 6 arms with branches, paper color.
  const armLen = maskable ? size * 0.3 : size * 0.36;
  const lineW = Math.max(2, size * 0.03);
  const branchW = lineW * 0.75;
  const branchLen = armLen * 0.45;
  const branchDist = armLen * 0.55;

  function drawSeg(x0, y0, x1, y1, w) {
    const [r, g, b] = [242, 245, 247]; // ice #f2f5f7
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(len * 2);
    const rad = w / 2;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = x0 + (x1 - x0) * t;
      const py = y0 + (y1 - y0) * t;
      const xMin = Math.max(0, Math.floor(px - rad - 1));
      const xMax = Math.min(size - 1, Math.ceil(px + rad + 1));
      const yMin = Math.max(0, Math.floor(py - rad - 1));
      const yMax = Math.min(size - 1, Math.ceil(py + rad + 1));
      for (let y = yMin; y <= yMax; y++) {
        for (let x = xMin; x <= xMax; x++) {
          const i = (y * size + x) * 4;
          const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
          if (d <= rad) {
            rgba[i] = r;
            rgba[i + 1] = g;
            rgba[i + 2] = b;
            rgba[i + 3] = 255;
          } else if (d <= rad + 1) {
            const a = 1 - (d - rad);
            rgba[i] = Math.round(r * a + rgba[i] * (1 - a));
            rgba[i + 1] = Math.round(g * a + rgba[i + 1] * (1 - a));
            rgba[i + 2] = Math.round(b * a + rgba[i + 2] * (1 - a));
            rgba[i + 3] = 255;
          }
        }
      }
    }
  }

  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * TAU - Math.PI / 2;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    drawSeg(cx, cy, cx + ca * armLen, cy + sa * armLen, lineW);
    for (const dir of [-1, 1]) {
      const bang = ang + (dir * Math.PI) / 4;
      const bx = cx + ca * branchDist;
      const by = cy + sa * branchDist;
      drawSeg(bx, by, bx + Math.cos(bang) * branchLen, by + Math.sin(bang) * branchLen, branchW);
    }
  }
  // Center dot — ember
  const dotR = lineW * 1.4;
  for (let y = Math.floor(cy - dotR - 1); y <= Math.ceil(cy + dotR + 1); y++) {
    for (let x = Math.floor(cx - dotR - 1); x <= Math.ceil(cx + dotR + 1); x++) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const i = (y * size + x) * 4;
      rgba[i] = 255;
      rgba[i + 1] = 74;
      rgba[i + 2] = 31;
      rgba[i + 3] = 255;
    }
  }

  return png(size, size, rgba);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", drawIcon(192));
writeFileSync("public/icons/icon-512.png", drawIcon(512));
writeFileSync("public/icons/icon-maskable-512.png", drawIcon(512, { maskable: true }));
console.log("icons written to public/icons/");
