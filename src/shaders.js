/* Particle shaders for Prometheus Hub.
   Technique adapted from MisterPrada/morph-particles:
   https://github.com/MisterPrada/morph-particles
   Positions live in float data textures. A simulation pass mixes four
   shapes with a staggered scroll, then points are drawn additively.
   Cursor pull is added here; the original demo moves the camera. */

export const simulationVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const simulationFrag = /* glsl */ `
precision highp float;

uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uC;
uniform sampler2D uD;
uniform float uTime;
uniform float uScroll;
uniform vec2 uPointer;
uniform float uPull;

varying vec2 vUv;

mat3 rotX(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
}

mat3 rotY(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

float rand(vec2 st) {
  return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123);
}

float remap(float value, float inMin, float inMax, float outMin, float outMax) {
  return outMin + (outMax - outMin) * (value - inMin) / max(0.0001, inMax - inMin);
}

float ease(float t) {
  t = clamp(t, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

void main() {
  float range = 1.0 / 3.0;
  float wobble = uTime;

  vec3 A = rotX(sin(wobble * 0.17) * 0.22) * rotY(wobble * 0.05) * texture2D(uA, vUv).xyz;
  vec3 B = rotY(wobble * 0.13) * texture2D(uB, vUv).xyz;
  vec3 C = rotY(-wobble * 0.11 + 0.4) * texture2D(uC, vUv).xyz;
  vec3 D = rotX(0.35 + sin(wobble * 0.2) * 0.08) * rotY(wobble * 0.09) * texture2D(uD, vUv).xyz;

  float stagger = rand(vUv) * 0.16;
  vec3 pos;

  if (uScroll < range) {
    float t = ease(remap(clamp(uScroll - stagger * 0.45, 0.0, range - stagger), 0.0, range - stagger, 0.0, 1.0));
    pos = mix(A, B, t);
  } else if (uScroll < range * 2.0) {
    float t = ease(remap(clamp(uScroll - stagger * 0.45, range, range * 2.0 - stagger), range, range * 2.0 - stagger, 0.0, 1.0));
    pos = mix(B, C, t);
  } else {
    float t = ease(remap(clamp(uScroll - stagger * 0.45, range * 2.0, 1.0 - stagger), range * 2.0, 1.0 - stagger, 0.0, 1.0));
    pos = mix(C, D, t);
  }

  float breath = sin(wobble * 0.65 + vUv.x * 16.0) * cos(wobble * 0.5 + vUv.y * 13.0);
  pos += breath * 0.018;

  vec2 aim = uPointer * vec2(2.15, 1.25);
  vec2 delta = aim - pos.xy;
  float dist = length(delta);
  float influence = smoothstep(2.05, 0.02, dist);
  pos.xy += delta * influence * uPull;
  pos.z += influence * uPull * 0.35;

  gl_FragColor = vec4(pos, 1.0);
}
`;

export const pointsVert = /* glsl */ `
uniform sampler2D uPositions;
uniform float uSize;
uniform vec2 uResolution;

varying float vSpark;
varying float vRadius;

void main() {
  vec3 pos = texture2D(uPositions, position.xy).xyz;
  vec4 mvPosition = viewMatrix * modelMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float spark = fract(sin(dot(position.xy, vec2(127.1, 311.7))) * 43758.5453);
  vSpark = spark;
  float dist = length(pos.xy);
  vRadius = dist;

  float size = uSize * mix(0.72, 1.55, spark);
  float viewZ = max(0.45, -mvPosition.z);
  gl_PointSize = size * uResolution.y * 0.0084 / viewZ;
  gl_PointSize = clamp(gl_PointSize, 1.5, 56.0);
}
`;

export const pointsFrag = /* glsl */ `
precision highp float;

varying float vSpark;
varying float vRadius;

void main() {
  vec2 p = gl_PointCoord - vec2(0.5);
  float d = length(p);
  if (d > 0.5) discard;

  float strength = clamp(0.038 / max(d, 0.02) - 0.08, 0.0, 0.72);
  float dust = smoothstep(0.5, 0.02, d) * 0.28;
  float alpha = max(strength, dust);
  if (alpha < 0.02) discard;

  vec3 ember = vec3(1.0, 0.48, 0.14);
  vec3 gold = vec3(1.0, 0.76, 0.36);
  vec3 white = vec3(1.0, 0.94, 0.82);
  vec3 color = mix(ember, gold, smoothstep(0.0, 0.55, strength));
  color = mix(color, white, smoothstep(0.5, 0.72, strength) * 0.45);
  color = mix(color, vec3(1.0, 0.84, 0.55), vSpark * 0.28);

  float edgeFade = smoothstep(3.1, 0.2, vRadius);
  alpha *= mix(0.78, 1.0, edgeFade);

  gl_FragColor = vec4(color * alpha, alpha);
}
`;

export const starVert = /* glsl */ `
uniform float uTime;
attribute float aSize;
varying float vSize;
void main() {
  vec3 pos = position;
  pos.x += sin(uTime * 0.15 + position.y) * 0.04;
  pos.y += cos(uTime * 0.12 + position.x) * 0.03;
  vec4 mv = viewMatrix * modelMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  vSize = aSize;
  gl_PointSize = aSize * (180.0 / max(0.4, -mv.z));
  gl_PointSize = clamp(gl_PointSize, 1.0, 14.0);
}
`;

export const starFrag = /* glsl */ `
precision highp float;
varying float vSize;
void main() {
  float d = distance(gl_PointCoord, vec2(0.5));
  if (d > 0.5) discard;
  float alpha = smoothstep(0.5, 0.0, d);
  alpha *= alpha;
  vec3 color = mix(vec3(1.0, 0.72, 0.4), vec3(1.0, 0.95, 0.86), smoothstep(1.0, 4.5, vSize));
  gl_FragColor = vec4(color * alpha, alpha * 0.85);
}
`;
