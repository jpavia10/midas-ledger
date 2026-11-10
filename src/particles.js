/* Lightweight HUD grid. No Three.js — the old particle bundle was ~519KB. */

export function focusField() {}

export function releaseField() {}

export function startField(canvas) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let frame = 0;

  function draw(time) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const gap = 56;
    const drift = reduce ? 0 : (time / 90) % gap;
    const css = getComputedStyle(document.body);
    const accent = (css.getPropertyValue("--accent") || "#e9d7a8").trim();
    const accent2 = (css.getPropertyValue("--accent-2") || "#9fd4e6").trim();
    ctx.strokeStyle = accent2;
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -gap + drift; x < w + gap; x += gap) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h * 0.08, h);
    }
    for (let y = -gap; y < h + gap; y += gap) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    const glow = ctx.createRadialGradient(w * 0.72, h * 0.16, 8, w * 0.72, h * 0.16, Math.max(w, h) * 0.55);
    glow.addColorStop(0, accent);
    glow.addColorStop(0.08, accent);
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    if (!reduce) frame = requestAnimationFrame(draw);
  }

  document.documentElement.classList.add("has-grid");
  frame = requestAnimationFrame(draw);
  window.addEventListener("resize", () => {
    if (reduce) draw(0);
  });
  return () => cancelAnimationFrame(frame);
}
