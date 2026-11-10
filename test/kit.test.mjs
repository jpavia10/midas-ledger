import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the book links the hub kit and the midas accent", () => {
  const kit = readFileSync(new URL("../kit/prometheus.css", import.meta.url), "utf8");
  assert.match(kit, /--bg: #05070e; --bg-2: #0a0f1c;/);
  assert.match(kit, /--ink: #f4f7fb; --muted: #b7c4d6;/);
  assert.match(kit, /--cyan: #9fd4e6; --lavender: #c9b8ea; --good: #9fe6c2; --warn: #f0d29a; --bad: #f2a7a7;/);
  assert.match(kit, /--sans: "Outfit"/);
  assert.match(kit, /body\[data-pillar="midas"\]\s*\{\s*--accent: #e9d7a8; --accent-2: #9fd4e6;\s*\}/);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /data-pillar="midas"/);
  assert.match(html, /kit\/prometheus\.css/);
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /--magenta/);
  assert.doesNotMatch(css, /--gold:\s*#/);
  assert.doesNotMatch(css, /JetBrains|Orbitron|Rajdhani/);
});
