import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const iconsDir = path.resolve(__dirname, '../public/icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Master SVG: Dark slate rounded container, audio waves, red record dot
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#161b22"/>
      <stop offset="100%" stop-color="#0d1117"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#f85149" flood-opacity="0.6"/>
    </filter>
  </defs>

  <!-- Extension container with subtle border -->
  <rect x="8" y="8" width="112" height="112" rx="28" fill="url(#bg)" stroke="#30363d" stroke-width="4"/>
  
  <!-- Audio wave bars -->
  <rect x="28" y="52" width="8" height="24" rx="4" fill="#8b949e"/>
  <rect x="42" y="38" width="8" height="52" rx="4" fill="#c9d1d9"/>
  <rect x="56" y="24" width="8" height="80" rx="4" fill="#f0f6fc"/>
  <rect x="70" y="38" width="8" height="52" rx="4" fill="#c9d1d9"/>
  
  <!-- Red recording indicator dot with glow -->
  <circle cx="94" cy="40" r="12" fill="#f85149" filter="url(#glow)"/>
  <circle cx="94" cy="40" r="6" fill="#ff7b72"/>
</svg>`;

fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgContent, 'utf8');
console.log('Saved public/icons/icon.svg');

/**
 * Creates an uncompressed/deflated raw RGBA PNG buffer in pure Node.js
 */
function createPng(width, height, pixelFn) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = createChunk('IHDR', ihdr);

  // Raw image data with filter byte 0 at start of each scanline
  const scanlineLength = width * 4 + 1;
  const rawData = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x / width, y / height, x, y);
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(len + 12);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, len + 8));
  chunk.writeInt32BE(crc, len + 8);
  return chunk;
}

// CRC-32 table and calculation
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc ^ -1;
}

// Color painter for Tab Recorder icon
function renderIconPixel(u, v) {
  // Center is (0.5, 0.5)
  // Distance from center for rounded container
  const cx = u - 0.5;
  const cy = v - 0.5;

  // Background rounded box bounds
  const inBox = Math.abs(cx) < 0.44 && Math.abs(cy) < 0.44;
  if (!inBox) {
    return [0, 0, 0, 0];
  }

  // Red recording dot at top right (u ~ 0.73, v ~ 0.31)
  const dotDist = Math.hypot(u - 0.73, v - 0.31);
  if (dotDist < 0.1) {
    if (dotDist < 0.05) return [255, 123, 114, 255]; // bright red center
    return [248, 81, 73, 255]; // vivid red
  }

  // Audio wave bars (4 vertical bars)
  const inBar = (bx, minV, maxV) => Math.abs(u - bx) < 0.035 && v >= minV && v <= maxV;

  if (inBar(0.25, 0.40, 0.60)) return [139, 148, 158, 255]; // outer wave
  if (inBar(0.36, 0.30, 0.70)) return [201, 209, 217, 255]; // mid wave
  if (inBar(0.47, 0.20, 0.80)) return [240, 246, 252, 255]; // tall center wave
  if (inBar(0.58, 0.30, 0.70)) return [201, 209, 217, 255]; // mid wave

  // Dark slate background
  return [22, 27, 34, 255];
}

const sizes = [16, 32, 48, 128];
for (const size of sizes) {
  const pngBuf = createPng(size, size, (u, v) => renderIconPixel(u, v));
  const filename = `icon-${size}.png`;
  fs.writeFileSync(path.join(iconsDir, filename), pngBuf);
  console.log(`Generated public/icons/${filename}`);
}
