/* Midas field. Same simulation as Prometheus Hub (MisterPrada/morph-particles):
   float textures, scroll morph, pointer pull. Shapes here are the finance wing:
   nebula, coin, ledger, ring. */
import * as THREE from "three";
import {
  simulationVert,
  simulationFrag,
  pointsVert,
  pointsFrag,
  starVert,
  starFrag
} from "./shaders.js";

const SIZE = 192;

let fieldFocus = null;
let holdPointer = false;

export function focusField(spec) {
  fieldFocus = spec || null;
  holdPointer = !!spec;
}

export function releaseField() {
  fieldFocus = null;
  holdPointer = false;
}

function gauss() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

function makeTexture(fill) {
  const data = new Float32Array(SIZE * SIZE * 4);
  const count = SIZE * SIZE;
  for (let i = 0; i < count; i++) {
    const p = fill(i, count);
    data[i * 4] = p[0];
    data[i * 4 + 1] = p[1];
    data[i * 4 + 2] = p[2];
    data[i * 4 + 3] = 1;
  }
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.flipY = false;
  if ("colorSpace" in texture && THREE.NoColorSpace) texture.colorSpace = THREE.NoColorSpace;
  else if ("colorSpace" in texture) texture.colorSpace = THREE.LinearSRGBColorSpace;
  return texture;
}

function nebula() {
  const halo = Math.random() < 0.18;
  const scale = halo ? 1.55 : 0.92;
  const x = gauss() * 0.78 * scale;
  const y = gauss() * 0.52 * scale;
  const z = gauss() * 0.42 * scale;
  return [x * 1.15 + y * 0.28, y * 1.05 - x * 0.06, z];
}

function ring() {
  const major = 1.28;
  const tube = 0.36;
  const u = Math.random() * Math.PI * 2;
  const v = Math.random() * Math.PI * 2;
  const radius = major + tube * Math.cos(v);
  const x = radius * Math.cos(u);
  const y = tube * Math.sin(v) * 1.05;
  const z = radius * Math.sin(u);
  const tilt = 0.85;
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  return [x, y * c - z * s, y * s + z * c];
}

function ledger() {
  const ruled = Math.random() < 0.78;
  const x = (Math.random() - 0.5) * 2.45;
  const curl = x * x * 0.07;
  if (!ruled) {
    const y = (Math.random() - 0.5) * 1.72;
    return [x, y + curl * 0.12, gauss() * 0.02 + curl * 0.35];
  }
  const lines = 9;
  const line = Math.floor(Math.random() * lines);
  const y = (line / (lines - 1) - 0.5) * 1.72;
  return [x, y + curl * 0.12, gauss() * 0.03 + curl * 0.45];
}

function coin() {
  const rim = Math.random() < 0.46;
  const angle = Math.random() * Math.PI * 2;
  const radius = rim ? 0.96 + Math.random() * 0.08 : Math.pow(Math.random(), 0.55) * 0.9;
  return [
    Math.cos(angle) * radius,
    Math.sin(angle) * radius * 0.96,
    (Math.random() - 0.5) * (rim ? 0.14 : 0.045)
  ];
}

export function startField(canvas) {
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance"
  });
  renderer.setClearColor(0x05060a, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
  camera.position.set(0, 0.12, 4.35);
  camera.lookAt(0, 0.05, 0);

  const simScene = new THREE.Scene();
  const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  simCamera.position.z = 1;

  const textures = {
    uA: { value: makeTexture(nebula) },
    uB: { value: makeTexture(coin) },
    uC: { value: makeTexture(ledger) },
    uD: { value: makeTexture(ring) }
  };

  const simUniforms = {
    ...textures,
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uPointer: { value: new THREE.Vector2(0, 0) },
    uPull: { value: reduce ? 0 : 0.34 }
  };

  const simMaterial = new THREE.ShaderMaterial({
    uniforms: simUniforms,
    vertexShader: simulationVert,
    fragmentShader: simulationFrag,
    depthTest: false,
    depthWrite: false
  });
  simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMaterial));

  const target = new THREE.WebGLRenderTarget(SIZE, SIZE, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    depthBuffer: false,
    stencilBuffer: false
  });
  target.texture.flipY = false;
  if (THREE.NoColorSpace) target.texture.colorSpace = THREE.NoColorSpace;
  else target.texture.colorSpace = THREE.LinearSRGBColorSpace;

  const positions = new Float32Array(SIZE * SIZE * 3);
  for (let i = 0; i < SIZE * SIZE; i++) {
    positions[i * 3] = (i % SIZE) / SIZE;
    positions[i * 3 + 1] = Math.floor(i / SIZE) / SIZE;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const pointUniforms = {
    uPositions: { value: target.texture },
    uSize: { value: 7.2 },
    uResolution: { value: new THREE.Vector2(1, 1) }
  };
  const pointMaterial = new THREE.ShaderMaterial({
    uniforms: pointUniforms,
    vertexShader: pointsVert,
    fragmentShader: pointsFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const points = new THREE.Points(geometry, pointMaterial);
  scene.add(points);

  const starCount = 90;
  const starPositions = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.4 + Math.random() * 4.8;
    starPositions[i * 3] = Math.cos(angle) * radius * (0.7 + Math.random() * 0.6);
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 5.2;
    starPositions[i * 3 + 2] = (Math.random() - 0.5) * 3.5;
    starSizes[i] = Math.random() < 0.12 ? 3.2 + Math.random() * 2.4 : 0.8 + Math.random() * 1.6;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute("aSize", new THREE.BufferAttribute(starSizes, 1));
  const starUniforms = { uTime: { value: 0 } };
  const stars = new THREE.Points(
    starGeometry,
    new THREE.ShaderMaterial({
      uniforms: starUniforms,
      vertexShader: starVert,
      fragmentShader: starFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  scene.add(stars);

  const pointer = { x: 0, y: 0 };
  const pointerTarget = { x: 0, y: 0 };
  let scrollCurrent = 0;
  let shiftCurrent = 0;
  const clock = new THREE.Clock();

  function onPointer(event) {
    if (holdPointer) return;
    const x = event.clientX / Math.max(1, window.innerWidth);
    const y = event.clientY / Math.max(1, window.innerHeight);
    pointerTarget.x = x * 2 - 1;
    pointerTarget.y = -(y * 2 - 1);
  }
  window.addEventListener("pointermove", onPointer, { passive: true });

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    pointUniforms.uResolution.value.set(width, height);
    pointUniforms.uSize.value = width < 720 ? 6.0 : 7.2;
  }
  window.addEventListener("resize", resize);
  resize();

  function sectionShift() {
    if (window.innerWidth < 860) return 0;
    const panels = document.querySelectorAll("[data-shift]");
    if (!panels.length) return 0;
    const y = window.scrollY + window.innerHeight * 0.45;
    let shift = 0;
    panels.forEach(function (panel) {
      if (panel.closest("[hidden]")) return;
      if (panel.offsetTop <= y) {
        const next = Number(panel.getAttribute("data-shift"));
        if (Number.isFinite(next)) shift = next;
      }
    });
    return shift;
  }

  let running = true;
  let pullCurrent = reduce ? 0 : 0.34;
  let scaleCurrent = 1;
  let zCurrent = 4.35;
  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
    if (running) clock.getDelta();
  });

  function frame() {
    requestAnimationFrame(frame);
    if (!running) return;

    const delta = Math.min(0.05, clock.getDelta());
    const elapsed = reduce ? 0 : clock.elapsedTime;
    const spec = fieldFocus;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const scrollTarget = spec ? spec.scroll : window.scrollY / maxScroll;
    const follow = reduce ? 1 : 1 - Math.pow(0.0012, delta);
    if (holdPointer) {
      pointerTarget.x *= 0.86;
      pointerTarget.y *= 0.86;
    }
    scrollCurrent += (scrollTarget - scrollCurrent) * (reduce ? 1 : follow);
    pointer.x += (pointerTarget.x - pointer.x) * (reduce ? 1 : 0.08);
    pointer.y += (pointerTarget.y - pointer.y) * (reduce ? 1 : 0.08);

    const pullTarget = spec ? (spec.pull == null ? 0.16 : spec.pull) : (reduce ? 0 : 0.34);
    const scaleTarget = spec ? (spec.scale == null ? 1.18 : spec.scale) : 1;
    const zTarget = spec ? (spec.z == null ? 3.25 : spec.z) : 4.35;
    const ease = reduce ? 1 : 0.07;
    pullCurrent += (pullTarget - pullCurrent) * (reduce ? 1 : ease);
    scaleCurrent += (scaleTarget - scaleCurrent) * (reduce ? 1 : ease);
    zCurrent += (zTarget - zCurrent) * (reduce ? 1 : 0.055);

    simUniforms.uTime.value = elapsed;
    simUniforms.uScroll.value = scrollCurrent;
    simUniforms.uPull.value = pullCurrent;
    simUniforms.uPointer.value.set(pointer.x, pointer.y);
    starUniforms.uTime.value = elapsed;

    const previous = renderer.outputColorSpace;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(simScene, simCamera);
    renderer.setRenderTarget(null);
    renderer.outputColorSpace = previous;

    const shiftTarget = spec ? (spec.shift == null ? 0 : spec.shift) : sectionShift();
    shiftCurrent += (shiftTarget - shiftCurrent) * (reduce ? 1 : 0.06);
    points.position.x = shiftCurrent;
    points.scale.setScalar(scaleCurrent);
    const lift = window.innerWidth < 720 ? 0.35 : 0.62;
    points.position.y = spec ? lift * 0.72 : lift;
    const camX = reduce ? 0 : pointer.x * (spec ? 0.18 : 0.42);
    const camY = reduce ? 0.05 : 0.05 + pointer.y * (spec ? 0.12 : 0.28);
    camera.position.x += (camX - camera.position.x) * 0.08;
    camera.position.y += (camY - camera.position.y) * 0.08;
    camera.position.z = zCurrent;
    camera.lookAt(shiftCurrent * (spec ? 0.12 : 0.35), spec ? 0.08 : 0.02, 0);

    renderer.render(scene, camera);
  }

  frame();

  return {
    destroy() {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", resize);
      running = false;
      geometry.dispose();
      pointMaterial.dispose();
      starGeometry.dispose();
      stars.material.dispose();
      simMaterial.dispose();
      target.dispose();
      Object.keys(textures).forEach(function (key) { textures[key].value.dispose(); });
      renderer.dispose();
    }
  };
}
