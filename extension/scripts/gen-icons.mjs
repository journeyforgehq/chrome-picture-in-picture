// template/extension/scripts/gen-icons.mjs
// Deterministic PNG icon generator — no image-processing dependency. Writes
// a solid-accent-colored square at each MV3 icon size (16/48/128) as a valid
// 8-bit RGBA (color type 6) PNG: signature + IHDR + one IDAT (zlib-deflated
// filter-0-prefixed scanlines) + IEND, each chunk CRC32-checksummed.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "src", "static", "icons");
const SIZES = [16, 48, 128];

// Accent color for the placeholder icon glyph — matches the default
// ui-kit accent (src/ui-kit/theme.ts DEFAULT_ACCENT = "#1677ff").
const ACCENT_RGBA = [0x16, 0x77, 0xff, 0xff];

// --- CRC32 (PNG spec Annex D reference implementation) ---
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function buildIHDR(size) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(size, 0); // width
  data.writeUInt32BE(size, 4); // height
  data.writeUInt8(8, 8); // bit depth
  data.writeUInt8(6, 9); // color type 6 = RGBA
  data.writeUInt8(0, 10); // compression method
  data.writeUInt8(0, 11); // filter method
  data.writeUInt8(0, 12); // interlace method
  return chunk("IHDR", data);
}

function buildIDAT(size) {
  // Each scanline is prefixed with a filter-type byte (0 = None), followed
  // by size * 4 (RGBA) bytes of solid accent color.
  const rowBytes = 1 + size * 4;
  const raw = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // filter type None
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      raw[px] = ACCENT_RGBA[0];
      raw[px + 1] = ACCENT_RGBA[1];
      raw[px + 2] = ACCENT_RGBA[2];
      raw[px + 3] = ACCENT_RGBA[3];
    }
  }
  const compressed = deflateSync(raw);
  return chunk("IDAT", compressed);
}

function buildIEND() {
  return chunk("IEND", Buffer.alloc(0));
}

function buildPng(size) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, buildIHDR(size), buildIDAT(size), buildIEND()]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const png = buildPng(size);
  const outFile = path.join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(outFile, png);
  console.log(`wrote ${outFile} (${png.length} bytes)`);
}
