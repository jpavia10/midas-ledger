import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");

const bg = [5, 6, 10, 255];
const fg = [232, 240, 248, 255];

function paint(size, insetFrac, strokeFrac) {
  const png = new PNG({ width: size, height: size });
  const inset = Math.round(size * insetFrac);
  const stroke = Math.max(1, Math.round(size * strokeFrac));
  const right = size - inset;
  const bottom = size - inset;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (size * y + x) << 2;
      const inside = x >= inset && x < right && y >= inset && y < bottom;
      const inner = x >= inset + stroke && x < right - stroke && y >= inset + stroke && y < bottom - stroke;
      const on = inside && !inner;
      const c = on ? fg : bg;
      png.data[i] = c[0];
      png.data[i + 1] = c[1];
      png.data[i + 2] = c[2];
      png.data[i + 3] = c[3];
    }
  }
  return PNG.sync.write(png);
}

const dir = path.resolve("icons");
fs.mkdirSync(dir, { recursive: true });

const regular = { inset: 7.5 / 32, stroke: 1.4 / 32 };
const maskable = { inset: 0.3, stroke: 1.4 / 32 };

const files = [
  ["icons/favicon-32.png", 32, regular],
  ["icons/apple-touch-icon.png", 180, regular],
  ["icons/icon-192.png", 192, regular],
  ["icons/icon-512.png", 512, regular],
  ["icons/icon-maskable-512.png", 512, maskable],
  ["icon.png", 512, regular]
];

for (const [file, size, box] of files) {
  fs.writeFileSync(path.resolve(file), paint(size, box.inset, box.stroke));
  console.log(file, size);
}
