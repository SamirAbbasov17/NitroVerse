import * as THREE from 'three';
// ————— ƏFSANƏVİ ÖRTÜKLƏR —————
// Hər effektin öz MƏKAN naxışı var (yalnız parlaqlıq yandırıb-söndürmək deyil):
// alov dilləri gövdə boyunca qalxır, buz kristalları sayrışır, cərəyan qövsləri
// axır, spektr sürüşür, boşluq/qalaktika fresnel kənar işığı verir.
//
// SAHƏ: örtük YALNIZ boyanın toxunduğu piksellərə düşür (maska `ModelLibrary`-də
// boya prosesində hazırlanır) — şüşə, farlar, bufer və şassi öz rəngində qalır.
//
// PRİNSİP: heç bir binar "strob" yoxdur və zirvə parlaqlıqları məhduddur —
// uzun oyunda göz yormasın. Keçidlər smoothstep/sinus ilə yumşaqdır, temporal
// tezliklər aşağıdır.
//
// Naxışlar modelin ölçüsündən asılı olmasın deyə lokal koordinat sərhəd
// sferasının radiusuna bölünür (uFxS) — bütün 10 modeldə eyni görünür.

// Yer işığının paylaşılan həndəsəsi və yumşaq dairə teksturası
let _gGeo = null, _gTex = null;
function _glowGeo() {
  if (!_gGeo) { _gGeo = new THREE.PlaneGeometry(1, 1); _gGeo.userData = { shared: true }; }
  return _gGeo;
}
function _glowTex() {
  if (_gTex) return _gTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const cx = cv.getContext('2d');
  const g = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = g;
  cx.fillRect(0, 0, 64, 64);
  _gTex = new THREE.CanvasTexture(cv);
  _gTex.userData = { shared: true };
  return _gTex;
}

const HEAD = `
uniform float uFxT;
varying vec3 vFxPos;
float fxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

// Fresnel: kənarlarda güclənən işıq — "premium" görünüşün əsasıdır
const FRESNEL = 'pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), ';

// Hər blok təyin edir: `fxEmis` (emissiya), `fxDark` (gövdə rənginin vurucusu) və `fxBase`
// (rgb = gövdənin yeni əsas rəngi, a = ona nə qədər keçilir). Maska ilə qarışdırma aşağıda ortaqdır.
//
// HƏR ÖRTÜYÜN ÖZ MATERİALI VAR (2026-10-07, istifadəçi: "eyni şeyin fərqli formaları olmasınlar").
// Əvvəl altısı da "tünd gövdə + rəngli parıltı" idi: buz və elektrik (mavi kənar işığı), boşluq
// və qalaktika (bənövşəyi kənar işığı) oyun məsafəsində demək olar seçilmirdi. İndi:
//   fire   — kömür kimi qara qabıq, çatlardan ərimiş lava közərir
//   ice    — AÇIQ, şaxtalı ağ-mavi gövdə, üzləri sayrışan kristal
//   volt   — qara gövdə üstündə qaçan nazik ildırım qolları
//   holo   — güzgü-xrom, rəng baxış bucağına görə dəyişir (yağ ləkəsi kimi)
//   void   — işığı udan mütləq qara, gövdə boyu keçən hadisə üfüqü halqası
//   galaxy — dumanlıq və ulduzlar, hərdən axan ulduz
const BODY = {
  fire: `
    float t = uFxT;
    // çat şəbəkəsi: iki miqyaslı hüceyrə sərhədləri (kənara yaxın = çat)
    vec3 q = vFxPos * 5.2;
    vec2 c1 = fract(q.xz + q.y * 0.7) - 0.5;
    vec2 c2 = fract(q.zy * 1.7 + q.x * 0.9 + 0.31) - 0.5;
    float edge = min(min(abs(c1.x), abs(c1.y)), min(abs(c2.x), abs(c2.y)));
    float crack = 1.0 - smoothstep(0.0, 0.07, edge);
    float heat = 0.62 + 0.38 * sin(t * 1.6 + q.x * 0.9 + q.z * 0.6);       // lava çatlarda yavaş nəbz vurur
    float rise = smoothstep(0.55, -0.35, vFxPos.y);                          // aşağı hissə daha isti
    vec3 lava = mix(vec3(1.0, 0.22, 0.02), vec3(1.0, 0.78, 0.22), heat * rise);
    vec3 fxEmis = lava * crack * (0.55 + 0.75 * heat) + vec3(0.30, 0.05, 0.0) * rise * 0.22;
    float fxDark = 1.0;
    vec4 fxBase = vec4(0.045, 0.035, 0.035, 0.94);
  `,
  ice: `
    float t = uFxT;
    float fres = ${FRESNEL}2.2);
    vec3 cellv = floor(vFxPos * 7.0 + vec3(0.0, 0.0, vFxPos.x * 1.3));
    float h = fxHash(cellv.xy + cellv.z * 7.31);
    float facet = 0.55 + 0.65 * h;                                           // kristal üzləri: hər biri öz tonunda
    float glint = smoothstep(0.86, 0.99, h) * (0.5 + 0.5 * sin(t * 1.3 + h * 40.0));
    vec3 fxEmis = vec3(0.55, 0.85, 1.0) * (glint * 0.9 + fres * 0.18);
    float fxDark = 1.0;
    vec4 fxBase = vec4(vec3(0.30, 0.62, 0.92) * facet, 0.94);
  `,
  volt: `
    float t = uFxT;
    // ildırım qolu: sinuslarla əyilən nazik xətt, gövdə boyu qaçır; üçü fərqli sürətdə
    float bolt = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float ph = t * (1.7 + fi * 0.9) + fi * 2.1;
      float path = sin(vFxPos.z * (5.0 + fi * 2.0) + ph) * 0.16 + sin(vFxPos.z * 13.0 - ph * 1.7) * 0.05;
      float d = abs(vFxPos.y - (fi * 0.22 - 0.2) - path);
      float gate = smoothstep(0.35, 0.9, 0.5 + 0.5 * sin(vFxPos.z * 1.4 - ph * 1.3));   // qol gövdə boyu "sürüşür"
      bolt += (1.0 - smoothstep(0.0, 0.05, d)) * gate;
    }
    float fres = ${FRESNEL}3.2);
    vec3 fxEmis = vec3(0.55, 0.92, 1.0) * min(bolt, 1.4) * 1.7 + vec3(0.05, 0.35, 0.9) * fres * 0.12;
    float fxDark = 1.0;
    vec4 fxBase = vec4(0.012, 0.016, 0.03, 0.97);
  `,
  holo: `
    float t = uFxT;
    float ndv = abs(dot(normalize(normal), normalize(vViewPosition)));
    // rəng baxış bucağından asılıdır: maşın döndükcə və kamera hərəkət etdikcə spektr sürüşür
    float band = ndv * 1.25 + vFxPos.z * 0.22 + vFxPos.y * 0.30 + t * 0.05;
    vec3 spectrum = 0.5 + 0.5 * cos(6.28318 * (band + vec3(0.0, 0.33, 0.67)));
    vec3 fxEmis = spectrum * (0.16 + (1.0 - ndv) * 0.55);
    float fxDark = 1.0;
    vec4 fxBase = vec4(mix(vec3(0.78, 0.80, 0.86), spectrum, 0.55), 0.93);
  `,
  void: `
    float t = uFxT;
    float fres = ${FRESNEL}6.0);
    // hadisə üfüqü: burundan arxaya keçən nazik parlaq halqa (4 s-də bir)
    float ring = fract(t * 0.25);
    float d = abs(fract(vFxPos.z * 0.36 + 0.5) - ring);
    d = min(d, 1.0 - d);
    float horizon = 1.0 - smoothstep(0.0, 0.03, d);
    vec3 fxEmis = vec3(0.50, 0.12, 0.95) * fres * 1.1 + vec3(0.85, 0.55, 1.0) * horizon * 1.0;
    float fxDark = 1.0;
    vec4 fxBase = vec4(0.004, 0.002, 0.012, 0.985);
  `,
  galaxy: `
    float t = uFxT;
    vec3 cellv = floor(vFxPos * 21.0);
    float sh = fxHash(cellv.xy + cellv.z * 19.7);
    float tw = 0.5 + 0.5 * sin(t * 1.05 + sh * 6.283);
    float star = smoothstep(0.974, 0.997, sh) * (0.45 + 0.55 * tw);
    float neb = 0.5 + 0.5 * sin(vFxPos.z * 1.6 + vFxPos.x * 1.0 + t * 0.18);
    float neb2 = 0.5 + 0.5 * sin(vFxPos.y * 2.3 - vFxPos.z * 0.9 - t * 0.11);
    vec3 nebula = mix(vec3(0.04, 0.05, 0.30), vec3(0.50, 0.10, 0.46), neb) + vec3(0.0, 0.16, 0.22) * neb2;
    // axan ulduz: 5 s-də bir gövdə boyu keçən qısa iz
    float sp = fract(t * 0.2);
    float along = vFxPos.z * 0.4 + 0.5 - sp * 1.6 + 0.3;
    float trail = smoothstep(0.0, 0.02, along) * (1.0 - smoothstep(0.02, 0.26, along))
                * (1.0 - smoothstep(0.0, 0.035, abs(vFxPos.y - 0.12 + vFxPos.z * 0.12)));
    float fres = ${FRESNEL}2.6);
    vec3 fxEmis = nebula * (0.30 + fres * 0.9) + (star * 1.5 + trail * 1.3) * vec3(0.95, 0.92, 1.0);
    float fxDark = 1.0;
    vec4 fxBase = vec4(0.02, 0.015, 0.07, 0.9);
  `,
};

// ————— ƏFSANƏVİ DƏST —————
// Örtük təkcə gövdə rəngi deyil: hər birinin öz yer işığı (maşının altında), arxada qalan izi
// və drift tüstüsünün rəngi var — oyunçunun onu almaq və taxmaq üçün səbəbi olsun.
//   glow  — yer işığının və izin rəngi          smoke — drift tüstüsü
//   trail — iz növü (bax fxTrail)
export const LEGENDARY_SET = {
  fire: { glow: 0xff6a1a, smoke: 0xff8a3a, trail: 'ember' },
  ice: { glow: 0x9fe2ff, smoke: 0xd8f2ff, trail: 'frost' },
  volt: { glow: 0x35e0ff, smoke: 0x7fe9ff, trail: 'spark' },
  holo: { glow: 0xff5df0, smoke: 0xc9a6ff, trail: 'prism' },
  void: { glow: 0x7a3cff, smoke: 0x2a1648, trail: 'shade' },
  galaxy: { glow: 0xb48cff, smoke: 0x6a55c8, trail: 'star' },
};
const PRISM = [0xff4d6d, 0xffb02e, 0xf5e642, 0x3ddc84, 0x35c8ff, 0xb46bff];
const _tp = { x: 0, y: 0, z: 0 };

// Əfsanəvi örtüklü maşının arxasında qalan iz. Səhnə hər kadr çağırır (yalnız örtüyü olan
// maşınlarda iş görür); hissəciklər səhnənin ortaq hovuzundandır (Effects) — yeni obyekt yaranmır.
export function fxTrail(car, effects, dt) {
  const kind = car?._fx?.kind;
  const set = kind && LEGENDARY_SET[kind];
  if (!set || !effects || car.root.visible === false) return;
  const speed = Math.abs(car.vF || 0);
  if (speed < 9) return;
  car._fxTrailT = (car._fxTrailT || 0) - dt;
  if (car._fxTrailT > 0) return;
  const fast = Math.min(1, speed / 38);
  car._fxTrailT = 0.11 - 0.05 * fast;
  const s = Math.sin(car.heading), c = Math.cos(car.heading);
  const side = (Math.random() - 0.5) * 1.5;
  _tp.x = car.position.x - s * 2.2 + c * side;
  _tp.z = car.position.z - c * 2.2 - s * side;
  _tp.y = (car.position.y || 0) + 0.35 + Math.random() * 0.5;
  switch (set.trail) {
    case 'ember':     // qığılcımlar arxaya səpilir, hərdən narıncı tüstü
      effects.spawnSparks(_tp, -s, -c, 2, 0.5 + fast * 0.5);
      if (Math.random() < 0.3) effects.spawnSmoke(_tp, false, 0xff7a2a, 0.5);
      break;
    case 'frost':     // buz tozu: açıq parıltı + ağ duman
      effects.spawnSparkle(_tp, 0xd8f4ff);
      if (Math.random() < 0.35) effects.spawnSmoke(_tp, false, 0xe6f6ff, 0.55);
      break;
    case 'spark':     // elektrik: göy qığılcım dəstələri
      effects.spawnSparks(_tp, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 3, 0.7);
      break;
    case 'prism':     // spektr: hər hissəcik növbəti rəngdə
      car._fxHue = ((car._fxHue || 0) + 1) % PRISM.length;
      effects.spawnSparkle(_tp, PRISM[car._fxHue]);
      break;
    case 'shade':     // boşluq: qara-bənövşəyi kölgə izi
      effects.spawnSmoke(_tp, true, 0x2a1648, 0.7);
      if (Math.random() < 0.25) effects.spawnSparkle(_tp, 0x9a5cff);
      break;
    case 'star':      // ulduz tozu
      effects.spawnSparkle(_tp, Math.random() < 0.5 ? 0xffffff : 0xffc8f0);
      break;
    default:
  }
}

export const LEGENDARY_KINDS = Object.keys(BODY);

// Gövdə (və eyni materialı bölüşən hissələr) üçün əfsanəvi örtük qurur.
// Qaytarır: { tick(dt) } — hər kadr çağırılmalıdır. Effekt yoxdursa null.
export function applyLegendaryFx(root, kind) {
  const glsl = BODY[kind];
  if (!glsl || !root) return null;
  let body = null;
  root.traverse((o) => { if (!body && o.isMesh && o.name === 'body') body = o; });
  const src = body?.material;
  if (!src) return null;

  // Keşlənmiş material bütün maşınlarda paylaşılır — animasiya ÖZ nüsxəsində olmalıdır
  const mat = src.clone();
  if (!body.geometry.boundingSphere) body.geometry.computeBoundingSphere();
  const radius = Math.max(0.001, body.geometry.boundingSphere?.radius || 1);
  const uT = { value: Math.random() * 20 };   // maşınlar sinxron yanıb-sönməsin
  const uS = { value: 1 / radius };
  // Boya maskası (ModelLibrary._recolor hazırlayır). Yoxdursa (boyanmamış model)
  // örtük bütün gövdəyə düşür — köhnə davranış ehtiyat variant kimi qalır.
  const mask = src.userData?.fxMask || null;

  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFxT = uT;
    sh.uniforms.uFxS = uS;
    if (mask) sh.uniforms.uFxMask = { value: mask };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uFxS;\nvarying vec3 vFxPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFxPos = position * uFxS;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + HEAD + (mask ? 'uniform sampler2D uFxMask;\n' : ''))
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
${glsl}
  float fxM = ${mask ? 'texture2D(uFxMask, vMapUv).r' : '1.0'};
  totalEmissiveRadiance = mix(totalEmissiveRadiance, fxEmis, fxM);
  diffuseColor.rgb = mix(diffuseColor.rgb, fxBase.rgb, fxBase.a * fxM) * mix(1.0, fxDark, fxM);
}`);
  };
  // Hər effekt öz shader proqramını almalıdır
  mat.customProgramCacheKey = () => 'nvfx4_' + kind + (mask ? '_m' : '');
  mat.needsUpdate = true;

  const parts = [];
  root.traverse((o) => { if (o.isMesh && o.material === src) parts.push(o); });
  for (const o of parts) o.material = mat;

  // YER İŞIĞI: maşının altında örtüyün rəngində yumşaq nəbz vuran ləkə (additiv, tək mesh)
  const set = LEGENDARY_SET[kind];
  let glow = null;
  if (set) {
    glow = new THREE.Mesh(_glowGeo(), new THREE.MeshBasicMaterial({
      color: set.glow, map: _glowTex(), transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    glow.rotation.x = -Math.PI / 2;
    glow.scale.set(3.3, 5.6, 1);
    glow.position.y = 0.07;
    glow.renderOrder = 2;
    glow.name = 'fx-underglow';
    root.add(glow);
  }
  return {
    mat, kind, glow,
    tick: (dt) => {
      uT.value += dt;
      if (glow) glow.material.opacity = 0.42 + 0.14 * Math.sin(uT.value * 2.1);
    },
  };
}
