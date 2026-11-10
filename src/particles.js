/* Starfield for the command desk. Canvas only. No Three.js. */

export function focusField() {}

export function releaseField() {}

export function startField(canvas) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const count = Math.min(220, Math.round((window.innerWidth * window.innerHeight) / 9000));
  const stars = Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() < 0.07 ? 1.5 : 0.4 + Math.random() * 0.9,
    a: 0.2 + Math.random() * 0.75,
    tw: Math.random() * Math.PI * 2,
    tone: Math.random()
  }));
  let frame = 0;

  function color(tone) {
    if (tone > 0.94) return "#e9d7a8";
    if (tone > 0.78) return "#c9b8ea";
    if (tone > 0.58) return "#9fd4e6";
    return "#f4f7fb";
  }

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
    const drift = reduce ? 0 : (time / 90000) % 1;
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      const twinkle = reduce ? 1 : 0.62 + 0.38 * Math.sin(time / 1400 + star.tw);
      const y = (star.y + drift * (0.02 + (i % 5) * 0.008)) % 1;
      ctx.globalAlpha = star.a * twinkle;
      ctx.fillStyle = color(star.tone);
      ctx.beginPath();
      ctx.arc(star.x * w, y * h, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!reduce) frame = requestAnimationFrame(draw);
  }

  document.documentElement.classList.add("has-grid");
  frame = requestAnimationFrame(draw);
  window.addEventListener("resize", () => {
    if (reduce) draw(0);
  });
  return () => cancelAnimationFrame(frame);
}
