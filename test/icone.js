/* Genera le icone PWA disegnando la R con primitive geometriche
 * (niente font: il risultato dev'essere identico ovunque). */
const zlib = require('zlib');
const fs = require('fs');

const OLIVA = [0x20, 0x2B, 0x22];
const ORO = [0xFF, 0xD8, 0x5F];
const FONDO = [0x15, 0x1C, 0x17];

function crc32(buf) {
  let c, tavola = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    tavola[n] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = tavola[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(tipo, dati) {
  const lung = Buffer.alloc(4); lung.writeUInt32BE(dati.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dati]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([lung, corpo, crc]);
}

function png(larg, alt, rgba) {
  const righe = Buffer.alloc((larg * 4 + 1) * alt);
  for (let y = 0; y < alt; y++) {
    righe[y * (larg * 4 + 1)] = 0;
    rgba.copy(righe, y * (larg * 4 + 1) + 1, y * larg * 4, (y + 1) * larg * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(larg, 0); ihdr.writeUInt32BE(alt, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(righe, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* --- geometria della R, in coordinate 0..1 --- */
function dentroSegmento(px, py, ax, ay, bx, by, spessore) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy) <= spessore / 2;
}

function dentroR(x, y) {
  const s = 0.093;                                   // spessore dei tratti
  if (dentroSegmento(x, y, 0.335, 0.215, 0.335, 0.795, s)) return true;   // asta
  // occhiello: semianello a destra dell'asta
  const cx = 0.395, cy = 0.365, ro = 0.185, ri = ro - s;
  const d = Math.hypot(x - cx, y - cy);
  if (x >= cx && d <= ro && d >= ri) return true;
  if (dentroSegmento(x, y, 0.335, 0.515, 0.575, 0.515, s)) return true;   // chiusura occhiello
  if (dentroSegmento(x, y, 0.435, 0.505, 0.675, 0.795, s)) return true;   // gamba
  return false;
}

function angoloTondo(x, y, r) {
  const d = (a, b) => Math.hypot(a, b);
  if (x < r && y < r) return d(r - x, r - y) <= r;
  if (x > 1 - r && y < r) return d(x - (1 - r), r - y) <= r;
  if (x < r && y > 1 - r) return d(r - x, y - (1 - r)) <= r;
  if (x > 1 - r && y > 1 - r) return d(x - (1 - r), y - (1 - r)) <= r;
  return true;
}

function disegna(lato, raggio, margine) {
  const rgba = Buffer.alloc(lato * lato * 4);
  const CAMPIONI = 4;
  for (let y = 0; y < lato; y++) {
    for (let x = 0; x < lato; x++) {
      let dentro = 0, sfondo = 0;
      for (let sy = 0; sy < CAMPIONI; sy++) {
        for (let sx = 0; sx < CAMPIONI; sx++) {
          const u = (x + (sx + 0.5) / CAMPIONI) / lato;
          const v = (y + (sy + 0.5) / CAMPIONI) / lato;
          if (!angoloTondo(u, v, raggio)) continue;
          sfondo++;
          // la lettera vive dentro un riquadro rientrato di 'margine'
          const lu = (u - margine) / (1 - 2 * margine);
          const lv = (v - margine) / (1 - 2 * margine);
          if (lu >= 0 && lu <= 1 && lv >= 0 && lv <= 1 && dentroR(lu, lv)) dentro++;
        }
      }
      const tot = CAMPIONI * CAMPIONI;
      const aSfondo = sfondo / tot, aLettera = dentro / tot;
      const i = (y * lato + x) * 4;
      if (aSfondo === 0) { rgba[i + 3] = 0; continue; }
      const base = OLIVA, glifo = ORO;
      const m = aLettera / Math.max(aSfondo, 1e-6);
      rgba[i]     = Math.round(base[0] * (1 - m) + glifo[0] * m);
      rgba[i + 1] = Math.round(base[1] * (1 - m) + glifo[1] * m);
      rgba[i + 2] = Math.round(base[2] * (1 - m) + glifo[2] * m);
      rgba[i + 3] = Math.round(255 * aSfondo);
    }
  }
  return png(lato, lato, rgba);
}

fs.writeFileSync('assets/icona-192.png', disegna(192, 0.22, 0.14));
fs.writeFileSync('assets/icona-512.png', disegna(512, 0.22, 0.14));
fs.writeFileSync('assets/icona-512-mask.png', disegna(512, 0.5, 0.26));  // maskable: tutto nella zona sicura
console.log('icone generate');
