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

const HEAD = `
uniform float uFxT;
varying vec3 vFxPos;
float fxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

// Fresnel: kənarlarda güclənən işıq — "premium" görünüşün əsasıdır
const FRESNEL = 'pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), ';

// Hər blok `fxEmis` (emissiya rəngi) və `fxDark` (gövdə tündləşməsi) təyin edir;
// maska ilə qarışdırma aşağıda ortaq şəkildə aparılır.
const BODY = {
  // Od dilləri aşağıdan yuxarı sakit axır — titrəmə yumşaq, qığılcım incə
  fire: `
    float t = uFxT;
    float lick = fract(vFxPos.y * 1.9 + vFxPos.z * 0.28 - t * 0.95);
    float flame = smoothstep(0.30, 1.0, lick);
    float breath = 0.88 + 0.12 * sin(t * 4.2 + vFxPos.x * 4.0);
    float ember = smoothstep(0.988, 1.0, fxHash(floor(vFxPos.xz * 9.0) + floor(t * 2.5)));
    vec3 hot = mix(vec3(0.58, 0.10, 0.015), vec3(1.0, 0.60, 0.13), flame);
    vec3 fxEmis = hot * (0.05 + flame * 0.98) * breath + ember * vec3(1.0, 0.55, 0.14) * 0.5;
    float fxDark = 0.42;
  `,
  // Şaxta kristalları yavaş sayrışır + soyuq kənar parıltısı
  ice: `
    float t = uFxT;
    float fres = ${FRESNEL}2.4);
    vec2 cell = floor(vFxPos.xy * 8.0 + vFxPos.z * 2.6);
    float h = fxHash(cell);
    float crys = smoothstep(0.79, 0.94, h);
    float shim = 0.62 + 0.38 * sin(t * 0.85 + h * 6.283);
    vec3 fxEmis = vec3(0.20, 0.52, 0.95) * (fres * 0.92 + crys * shim * 0.80 + 0.02);
    float fxDark = 0.52;
  `,
  // Cərəyan qövsləri sakit axır — kəskin çaxma yoxdur (göz yormasın)
  volt: `
    float t = uFxT;
    float arc = smoothstep(0.92, 1.0, 0.5 + 0.5 * sin(vFxPos.y * 10.0 + vFxPos.x * 4.5 - t * 6.0));
    float arc2 = smoothstep(0.95, 1.0, 0.5 + 0.5 * sin(vFxPos.z * 7.5 - vFxPos.y * 5.5 + t * 7.5));
    float pulse = 0.78 + 0.22 * sin(t * 2.6);
    float fres = ${FRESNEL}3.0);
    vec3 fxEmis = vec3(0.13, 0.68, 1.0) * ((arc + arc2 * 0.65) * 1.25 * pulse + fres * 0.38 + 0.015);
    float fxDark = 0.48;
  `,
  // Rəng spektri gövdə boyunca yavaş axır — sakit, zərif
  holo: `
    float t = uFxT;
    float band = fract(vFxPos.z * 0.78 + vFxPos.y * 0.30 + t * 0.085);
    vec3 spectrum = 0.5 + 0.5 * cos(6.28318 * (band + vec3(0.0, 0.33, 0.67)));
    float fres = ${FRESNEL}2.0);
    vec3 fxEmis = spectrum * (0.09 + fres * 0.80);
    float fxDark = 0.50;
  `,
  // Demək olar qara gövdə — yalnız kənarlar bənövşəyi yanır (dərin nəfəs)
  void: `
    float t = uFxT;
    float fres = ${FRESNEL}3.0);
    float breathe = 0.80 + 0.20 * sin(t * 0.55);
    float rip = 0.5 + 0.5 * sin(vFxPos.y * 3.2 - t * 0.85);
    vec3 fxEmis = mix(vec3(0.28, 0.03, 0.70), vec3(0.60, 0.20, 0.95), rip) * fres * 1.55 * breathe;
    float fxDark = 0.10;
  `,
  // Gecə göyü: ulduzlar yumşaq nəfəs alır, dumanlıq yavaş sürüşür
  galaxy: `
    float t = uFxT;
    vec3 cellv = floor(vFxPos * 21.0);
    float sh = fxHash(cellv.xy + cellv.z * 19.7);
    float tw = 0.5 + 0.5 * sin(t * 1.05 + sh * 6.283);
    float star = smoothstep(0.974, 0.997, sh) * (0.45 + 0.55 * tw);
    float neb = 0.5 + 0.5 * sin(vFxPos.z * 1.6 + vFxPos.x * 1.0 + t * 0.18);
    vec3 nebula = mix(vec3(0.05, 0.03, 0.20), vec3(0.34, 0.09, 0.44), neb);
    float fres = ${FRESNEL}2.6);
    vec3 fxEmis = nebula * (0.26 + fres * 0.95) + star * vec3(0.95, 0.92, 1.0) * 1.5;
    float fxDark = 0.14;
  `,
};

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
  diffuseColor.rgb *= mix(1.0, fxDark, fxM);
}`);
  };
  // Hər effekt öz shader proqramını almalıdır
  mat.customProgramCacheKey = () => 'nvfx_' + kind + (mask ? '_m' : '');
  mat.needsUpdate = true;

  const parts = [];
  root.traverse((o) => { if (o.isMesh && o.material === src) parts.push(o); });
  for (const o of parts) o.material = mat;

  return { mat, kind, tick: (dt) => { uT.value += dt; } };
}
