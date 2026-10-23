// Вся сцена — один фрагментный шейдер: небо, облака, звёзды, сияние,
// дальний берег и прозрачный лёд с трещинами и пузырями метана.

export const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const FRAG = `
precision highp float;

uniform vec2  uRes;
uniform float uAspect;
uniform float uTime;
uniform float uHour;
uniform vec2  uSun;      // положение солнца в координатах сцены
uniform float uElev;     // высота солнца над горизонтом (≈ радианы)
uniform float uNight;    // 0..1 — насколько темно для звёзд
uniform float uAurora;   // 0..1 — сила сияния
uniform vec2  uMouse;    // курсор в координатах сцены
uniform float uMouseOn;
uniform vec4  uCrack[4]; // xy — точка удара, z — время удара

varying vec2 vUv;

#define H 0.36
#define C(r,g,b) (vec3(r,g,b) / 255.0)

/* ---------- шум ---------- */

float hash(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash2(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ v += a * noise(p); p = ROT * p; a *= 0.5; }
  return v;
}
float fbm3(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++){ v += a * noise(p); p = ROT * p; a *= 0.5; }
  return v;
}

/* ---------- палитра неба по высоте солнца ---------- */

vec3 key(float e, vec3 n, vec3 a, vec3 b, vec3 c, vec3 d, vec3 g, vec3 f){
  vec3 col = n;
  col = mix(col, a, smoothstep(-0.35, -0.16, e));
  col = mix(col, b, smoothstep(-0.16, -0.07, e));
  col = mix(col, c, smoothstep(-0.07, -0.02, e));
  col = mix(col, d, smoothstep(-0.02,  0.02, e));
  col = mix(col, g, smoothstep( 0.02,  0.10, e));
  col = mix(col, f, smoothstep( 0.10,  0.30, e));
  return col;
}
vec3 zenithC(float e){ return key(e, C(4,8,22),  C(10,20,48), C(28,46,90),   C(52,80,126),  C(74,106,152), C(79,127,184), C(52,112,196)); }
vec3 antiC(float e){   return key(e, C(12,19,40), C(20,33,63), C(59,74,120),  C(150,122,156),C(201,165,154),C(214,210,204),C(188,211,230)); }
vec3 glowC(float e){   return key(e, C(12,19,40), C(27,38,72), C(110,84,112), C(228,128,90), C(255,154,74), C(255,214,160),C(255,244,224)); }
vec3 deepC(float e){   return key(e, C(4,7,14),  C(7,13,28),  C(16,27,51),   C(38,46,74),   C(58,58,80),   C(74,90,114),  C(92,117,144)); }
vec3 sunC(float e){    return mix(C(255,90,31), C(255,246,224), smoothstep(-0.01, 0.25, e)); }

/* ---------- небо ---------- */

vec3 horizonAt(float x, float e){
  float side = exp(-abs(x - uSun.x) * 1.3) * smoothstep(-0.30, -0.05, e);
  return mix(antiC(e), glowC(e), side);
}

vec3 skyBase(vec2 p){
  float e = uElev;
  float a = max(p.y - H, 0.0);
  float g = pow(clamp(a / 0.6, 0.0, 1.0), 0.5);
  vec3 col = mix(horizonAt(p.x, e), zenithC(e), g);

  // Пояс Венеры и тень Земли напротив солнца
  float side = exp(-abs(p.x - uSun.x) * 1.3);
  float belt = smoothstep(-0.10, -0.03, e) * smoothstep(0.04, -0.005, e) * (1.0 - side);
  col = mix(col, C(40,52,92), belt * smoothstep(0.045, 0.0, a) * 0.8);
  col = mix(col, C(214,150,170), belt * exp(-pow((a - 0.075) / 0.035, 2.0)) * 0.55);

  // ореол и диск солнца
  vec3 sc = sunC(e);
  float d = length(p - uSun);
  float dayA = smoothstep(-0.14, 0.0, e);
  float wide = 0.12 * (1.0 - 0.65 * smoothstep(0.1, 0.4, e));
  col += sc * (0.30 * exp(-d * 9.0) + wide * exp(-d * 2.8)) * dayA;
  float disk = smoothstep(0.030, 0.026, d) * step(H, p.y) * smoothstep(-0.03, 0.0, e);
  col = mix(col, sc * 1.6 + 0.2, disk);
  return col;
}

vec3 aurora(vec2 p){
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 5; i++){
    float fi = float(i);
    float x = p.x * (1.2 + fi * 0.15) + fi * 1.7;
    float base = H + 0.08 + fi * 0.03 + 0.10 * (fbm3(vec2(x * 0.9 + uTime * 0.02, fi * 3.0)) - 0.5);
    float md = p.x - uMouse.x;
    base += uMouseOn * 0.035 * exp(-md * md * 14.0) * sin(uTime * 1.6 - md * 22.0 + fi);
    float d = p.y - base;
    if (d < -0.02) continue;
    float bottom = smoothstep(-0.012, 0.004, d);
    float up = exp(-max(d, 0.0) * (3.2 + fi * 1.2));
    float rays = 0.45 + 0.55 * noise(vec2(x * 38.0 + fi * 10.0, uTime * 0.25 + fi));
    rays *= 0.6 + 0.4 * noise(vec2(x * 7.0, uTime * 0.12));
    float fold = smoothstep(0.18, 0.62, fbm3(vec2(x * 1.6 - uTime * 0.04, fi * 1.3)));
    vec3 c = mix(C(60,255,170), C(120,90,255), smoothstep(0.04, 0.32, d));
    c = mix(c, C(255,80,140), smoothstep(0.26, 0.5, d) * 0.6);
    acc += c * bottom * up * rays * fold * (0.7 - fi * 0.1);
  }
  return acc * uAurora;
}

vec3 stars(vec2 p, float milky){
  vec3 s = vec3(0.0);
  for (int k = 0; k < 2; k++){
    float fk = float(k);
    float scale = mix(90.0, 210.0, fk);
    float thr = mix(0.95, 0.90, fk) - milky * 0.07;
    vec2 q = p * scale + vec2(uHour * 0.6, 0.0);
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = hash(cell + fk * 17.0);
    if (h > thr){
      vec2 o = (hash2(cell) - 0.5) * 0.6;
      float b = (h - thr) / (1.0 - thr);
      float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 4.0) + h * 80.0);
      vec3 tint = mix(C(170,190,255), C(255,220,190), hash(cell + 3.0));
      s += tint * smoothstep(0.12 * (0.6 + b), 0.0, length(f - o)) * (0.4 + 1.6 * b) * tw;
    }
  }
  return s;
}

vec3 clouds(vec2 p, vec3 col){
  float e = uElev;
  float a = p.y - H;
  float cy = a + 0.025;
  vec2 cp = vec2(p.x / cy, 1.0 / cy) * 0.18 + vec2(uTime * 0.004 + uHour * 0.35, 0.0);
  float n = fbm(cp * vec2(1.0, 1.8));
  float cov = smoothstep(0.52, 0.80, n) * smoothstep(0.0, 0.08, a) * 0.85;
  if (cov <= 0.0) return col;
  float th = smoothstep(0.52, 0.95, n);
  vec3 lit = mix(glowC(e) * 1.05, vec3(1.0), smoothstep(0.05, 0.35, e));
  lit *= 0.15 + 0.85 * smoothstep(-0.12, 0.08, e);
  vec3 shade = mix(deepC(e) * 1.1, zenithC(e) * 0.85 + 0.08, smoothstep(-0.05, 0.3, e));
  vec3 cc = mix(lit, shade, th * 0.7);
  cc += sunC(e) * exp(-length(p - uSun) * 5.0) * 0.4 * smoothstep(-0.14, 0.0, e) * (1.0 - th);
  return mix(col, cc, cov);
}

vec3 skyFull(vec2 p){
  vec3 col = skyBase(p);
  if (uNight > 0.001){
    vec2 q = p - vec2(0.0, 0.72);
    q = mat2(0.88, -0.47, 0.47, 0.88) * q;
    float band = exp(-q.y * q.y * 22.0);
    float lanes = smoothstep(0.55, 0.7, fbm(q * 9.0 + 5.0));
    float fade = smoothstep(0.0, 0.12, p.y - H);
    vec3 dust = mix(C(140,155,215), C(235,205,175), smoothstep(0.35, 0.7, fbm(q * 2.5 + 9.0)));
    col += dust * band * (0.35 + fbm(q * 6.0)) * 0.46 * uNight * fade;
    col -= band * lanes * 0.09 * uNight;
    col += stars(p, band) * uNight * fade;

    // месяц
    vec2 mp = vec2(min(0.62, uAspect * 0.5 * 0.72), H + 0.40);
    float r = 0.022;
    float moon = smoothstep(r, r * 0.9, length(p - mp)) - smoothstep(r, r * 0.9, length(p - mp - vec2(0.009, 0.004)));
    float mA = uNight * (1.0 - uAurora * 0.6);
    col = mix(col, C(255,246,228) * 1.1, clamp(moon, 0.0, 1.0) * mA);
    col += C(150,170,220) * exp(-length(p - mp) * 14.0) * 0.12 * mA;
  }
  if (uAurora > 0.001) col += aurora(p);
  col = clouds(p, col);

  // солнце пробивает тонкие облака
  float sd = length(p - uSun);
  float disk = smoothstep(0.030, 0.026, sd) * step(H, p.y) * smoothstep(-0.03, 0.0, uElev);
  col = mix(col, sunC(uElev) * 1.6 + 0.2, disk * 0.85);
  col += sunC(uElev) * exp(-sd * 18.0) * 0.25 * smoothstep(-0.02, 0.05, uElev);
  return col;
}

/* ---------- дальний берег ---------- */

vec3 shore(vec2 p, vec3 col){
  float e = uElev;
  float x = p.x;
  float dayL = smoothstep(-0.05, 0.2, e);
  float rFar = H + 0.006 + 0.075 * pow(fbm3(vec2(x * 1.6 + 11.3, 2.0)), 1.6) * (0.55 + 0.45 * sin(x * 1.3 + 1.0))
             + 0.006 * noise(vec2(x * 30.0, 1.0));
  float rNear = H + 0.004 + 0.11 * smoothstep(-0.25, -1.1, x) * (0.55 + 0.45 * fbm3(vec2(x * 3.0 + 4.0, 7.0)));

  vec3 hz = horizonAt(x, e);
  vec3 deep = deepC(e);
  vec3 far = mix(hz, deep, 0.6);
  float snow = smoothstep(0.018, 0.0, rFar - p.y - 0.01 * noise(vec2(x * 40.0, p.y * 80.0)));
  far = mix(far, mix(far * 1.2, sunC(e), 0.5) * (0.6 + 0.5 * dayL), snow * 0.6 * dayL);
  far = mix(far, hz, smoothstep(0.03, 0.0, abs(p.y - H)) * 0.5);
  col = mix(col, far, smoothstep(0.0, 0.0015, rFar - p.y));

  vec3 near = deep * 0.55 + sunC(e) * 0.04 * dayL;
  col = mix(col, near, smoothstep(0.0, 0.0015, rNear - p.y));
  return col;
}

/* ---------- лёд ---------- */

// расстояние до ближайшей границы ячеек Вороного
float voronoiEdge(vec2 x){
  vec2 n = floor(x), f = fract(x);
  vec2 mg, mr;
  float md = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++){
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + hash2(n + g) - f;
    float d = dot(r, r);
    if (d < md){ md = d; mr = r; mg = g; }
  }
  md = 8.0;
  for (int j = -2; j <= 2; j++)
  for (int i = -2; i <= 2; i++){
    vec2 g = mg + vec2(float(i), float(j));
    vec2 r = g + hash2(n + g) - f;
    if (dot(mr - r, mr - r) > 0.00001)
      md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return md;
}

// пузыри метана: собраны в «стайки», внутри стайки разного размера
float bubbles(vec2 bw, float seed){
  vec2 cell = floor(bw);
  vec2 f = fract(bw);
  float cluster = smoothstep(0.55, 0.75, noise(cell * 0.18 + seed * 7.0));
  if (hash(cell + seed) > cluster * 0.9) return 0.0;
  vec2 h = hash2(cell + seed * 3.1);
  float r = 0.05 + 0.12 * h.x * h.x;
  vec2 c = 0.5 + (h - 0.5) * 0.6;
  float d = length(f - c);
  return smoothstep(r, r * 0.55, d) * 0.55 + smoothstep(r, r * 0.85, d) * smoothstep(r * 0.6, r, d) * 0.5;
}

vec3 ice(vec2 p){
  float e = uElev;
  float dz = H - p.y;
  float z = 0.06 / (dz + 0.002);
  vec2 w = vec2(p.x * z, z) * 10.0;

  float L = 0.1 + 0.9 * smoothstep(-0.25, 0.25, e);
  float dayL = smoothstep(-0.05, 0.2, e);
  vec3 zen = zenithC(e);
  vec3 sc = sunC(e);

  // отражение неба и берега в полированном льду
  vec2 pm = vec2(p.x + (noise(w * 0.3) - 0.5) * 0.01, H + dz);
  vec3 refl = shore(pm, skyBase(pm));
  if (uAurora > 0.001) refl += aurora(pm) * 0.6;

  // тело льда: байкальская синева в глубине, местами почти чёрная
  vec3 body = mix(C(4,22,36), C(14,72,98), L) * (0.3 + 0.7 * L);
  body = mix(body, zen * 0.45, 0.25);
  body *= 0.7 + 0.6 * fbm3(w * 0.045 + 2.0);

  // курсор как лупа: подо льдом проступают трещины
  vec2 mq = (p - uMouse) * vec2(1.0, 1.5);
  float below = uMouseOn * step(uMouse.y, H + 0.02);
  float lensR = length(mq);
  float lens = smoothstep(0.21, 0.11, lensR) * below;
  float rim = exp(-abs(lensR - 0.19) * 110.0) * below;

  float fade = smoothstep(3.5, 0.4, z);
  float px = 1.0 / uRes.y;
  float cw = px * 0.6 / (dz * dz + 0.0004);
  // трещины: ячейки Вороного, изогнутые шумом; видна лишь часть граней
  vec2 warp = vec2(fbm3(w * 0.32), fbm3(w * 0.32 + 7.3)) - 0.5;
  vec2 wc = w * 0.55 + warp * 1.4;
  float edge = voronoiEdge(wc);
  float show = smoothstep(0.38, 0.62, noise(wc * 0.9 + 4.0));
  float crack = (smoothstep(cw * 0.9, 0.0, edge) * 0.9 + 0.22 * smoothstep(cw * 6.0, 0.0, edge)) * show;
  vec2 wd = w * 0.38 + warp * 2.2 + vec2(3.7, 1.3 + z * 0.8);
  float edge2 = voronoiEdge(wd);
  float deepCrack = smoothstep(cw * 2.5, 0.0, edge2) * smoothstep(0.45, 0.7, noise(wd * 1.3)) * 0.4;

  float bub = bubbles(w * 2.6, 1.0) + 0.6 * bubbles(w * 4.1 + 11.0, 2.0);
  bub *= smoothstep(1.2, 0.15, z);

  vec3 crackCol = mix(C(170,205,222), C(235,246,250), dayL) * (0.2 + 0.8 * L);
  vec3 base = body;
  base += crackCol * (crack * 0.5 + deepCrack * 0.45) * fade;
  base += C(215,236,255) * bub * (0.12 + 0.3 * L);

  // под линзой лёд прозрачнее и трещины светятся
  base = mix(base, C(6,62,92) * (0.55 + 0.45 * L), lens * 0.75);
  base += C(150,240,255) * (crack * 1.4 + deepCrack * 2.0) * lens * fade;
  base += C(200,240,255) * bub * lens * 0.9;

  float fres = 0.08 + 0.9 * pow(1.0 - clamp(dz / 0.4, 0.0, 1.0), 5.0);
  float snowMask = smoothstep(0.58, 0.70, fbm(w * vec2(0.05, 0.14) + vec2(3.0, 0.0))) * (1.0 - lens * 0.85);
  vec3 col = mix(base, refl, fres * (1.0 - snowMask) * (1.0 - lens * 0.85));
  col += C(220,245,255) * rim * 0.22;

  vec3 snowCol = mix(zen, vec3(1.0), 0.65) * (0.22 + 0.78 * L) + sc * 0.25 * dayL;
  col = mix(col, snowCol, snowMask * 0.92);

  // солнечная дорожка и блёстки
  float path = exp(-abs(p.x - uSun.x) * (6.0 + 40.0 * dz)) * smoothstep(-0.03, 0.04, e);
  vec2 sq = gl_FragCoord.xy / max(2.0, uRes.y / 380.0);
  float spark = step(0.985, hash(floor(sq) + floor(uTime * 7.0))) * smoothstep(0.5, 0.2, length(fract(sq) - 0.5));
  col += sc * path * (0.25 + spark * 2.5) * (1.0 - snowMask * 0.5);

  // лунная дорожка
  float moonX = min(0.62, uAspect * 0.5 * 0.72);
  float mA = uNight * (1.0 - uAurora * 0.6);
  float mPath = exp(-abs(p.x - moonX) * (14.0 + 70.0 * dz));
  col += C(190,205,235) * mPath * (0.12 + spark * 0.8) * mA * (1.0 - snowMask * 0.5);

  // удары по льду: из точки разбегаются трещины
  for (int i = 0; i < 4; i++){
    vec4 k = uCrack[i];
    float age = uTime - k.z;
    if (age < 0.0 || age > 7.0) continue;
    vec2 q = (p - k.xy) * vec2(1.0, 2.6);
    float r = length(q);
    float ang = atan(q.y, q.x);
    float fa = ang * 7.0 / 6.2831853 + hash(k.xy) + 0.35 * (noise(vec2(r * 16.0, k.x * 10.0 + k.z)) - 0.5);
    float id = floor(fa);
    float u = abs(fract(fa) - 0.5);
    float dist = u * 0.9 * r;
    float rays = smoothstep(0.0035, 0.0, dist) + 0.3 * smoothstep(0.014, 0.0, dist);
    float reach = (0.05 + 0.34 * (1.0 - exp(-age * 2.2))) * (0.3 + 0.7 * hash(vec2(id, k.z)));
    float grow = smoothstep(reach, reach - 0.03, r);
    float life = 1.0 - smoothstep(3.5, 7.0, age);
    float ring = exp(-abs(r - age * 0.45) * 50.0) * (1.0 - smoothstep(0.0, 1.2, age));
    col += C(190,240,255) * (rays * grow * 0.9 + ring * 0.45) * life * (0.4 + 0.6 * L + 0.5 * lens);
  }
  return col;
}

void main(){
  vec2 uv = vUv;
  vec2 p = vec2((uv.x - 0.5) * uAspect, uv.y);

  vec3 col;
  if (p.y >= H) col = shore(p, skyFull(p));
  else col = ice(p);

  // дымка на линии горизонта
  col = mix(col, horizonAt(p.x, uElev), exp(-abs(p.y - H) * 160.0) * 0.22);

  col *= 0.86 + 0.14 * smoothstep(1.25, 0.25, length((uv - 0.5) * vec2(1.0, 1.2)));
  col += (hash(uv * uRes + fract(uTime) * 61.0) - 0.5) * (3.0 / 255.0);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
