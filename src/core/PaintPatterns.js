import * as THREE from 'three';

// ————— BOYA NAXIŞLARI (maşına xas skinlər) —————
// Əfsanəvi örtüklərdən TAM FƏRQLİ məhsuldur: animasiya yoxdur, parıltı yoxdur —
// sadəcə iki rəngli boya dizaynı (yarış zolaqları, kamuflyaj, alov rəsmi və s.).
//
// KOORDİNAT: gövdənin öz SƏRHƏD QUTUSU ilə normallaşdırılır →
//   x = eninə (−1 sol … +1 sağ), y = hündürlük (−1 alt … +1 tavan),
//   z = uzununa (−1 arxa … +1 burun).
// Əvvəl sferanın radiusuna bölünürdü: hər modeldə proporsiya fərqli çıxırdı,
// mərkəz sürüşürdü və naxış "forma tutmurdu". İndi ölçüdən asılı deyil —
// eyni dizayn 18 maşının hamısında eyni yerə oturur.
//
// Obyekt fəzasında NORMAL da ötürülür (vPtNrm) — beləcə naxış "yan panel",
// "tavan" kimi hissələri ayırd edir və rəsm həqiqətən çəkilmiş kimi görünür.
//
// İşıqlandırma saxlanılır: naxış sahəsində rəng nisbətlə (colB/colA) vurulur,
// yəni kölgə və parlaqlıq itmir. Yalnız boya maskasının içində işləyir:
// şüşə, bufer, farlar toxunulmaz qalır.

const HEAD = `
varying vec3 vPtPos;
varying vec3 vPtNrm;
uniform vec3 uPtA;
uniform vec3 uPtB;
float ptHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

// Hər naxış `ptM` (0..1) qaytarır: 0 = əsas rəng, 1 = ikinci rəng.
// Dəyişənlər: px (eninə), py (hündürlük), pz (uzununa), nx/ny/nz (normal).
const PATTERN = {
  // Klassik cüt yarış zolağı — kapotdan tavana, oradan baqaja
  stripes: `
    float a = abs(px);
    float ptM = smoothstep(0.09, 0.13, a) * (1.0 - smoothstep(0.36, 0.40, a));
  `,
  // Yan ox: aşağı-öndən yuxarı-arxaya qalxan enli zolaq.
  // ÖLÇÜLDÜ: dar zolaq oyun məsafəsində itirdi (4.9% piksel) — eni artırıldı
  // və burunda kapota keçir ki, qabaqdan da görünsün.
  sweep: `
    float band = abs(py - (0.10 - pz * 0.52));
    float side = smoothstep(0.22, 0.55, abs(nx));
    float nose = smoothstep(0.45, 0.80, pz) * (1.0 - smoothstep(0.30, 0.55, abs(px)));
    float ptM = max((1.0 - smoothstep(0.21, 0.33, band)) * side, nose);
  `,
  // Hərbi kamuflyaj — iri üzvi ləkələr
  camo: `
    float n = sin(px * 3.1 + pz * 1.7)
            + sin(pz * 2.6 - py * 1.9 + 1.3)
            + sin((px * 1.9 - pz * 2.3) * 1.4 + 2.1)
            + sin(py * 4.2 - 0.7) * 0.7;
    float ptM = smoothstep(0.10, 0.62, n);   // əsas rəng üstün qalsın (~40% ləkə)
  `,
  // Şahmat lenti — yan panellərdən keçən yarış zolağı (bütün gövdə deyil)
  checker: `
    float band = 1.0 - smoothstep(0.30, 0.44, abs(py + 0.04));
    vec2 cc = floor(vec2(pz * 4.2 + 0.5, (py + 0.04) * 3.0));
    float ck = mod(cc.x + cc.y, 2.0);
    float ptM = ck * band * smoothstep(0.22, 0.52, abs(nx));
  `,
  // İki ton — tavan və yuxarı gövdə ikinci rəngdə (klassik zavod dizaynı)
  twotone: `
    float ptM = smoothstep(-0.02, 0.16, py);
  `,
  // Alov rəsmi — burundan arxaya uzanan dalğalı dillər
  flames: `
    float w = sin(px * 6.2) * 0.10 + sin(py * 5.4 + 1.2) * 0.13 + sin(px * 13.0) * 0.05;
    float ptM = smoothstep(-0.22, 0.06, pz + w);
  `,
  // Piksel keçid — arxaya doğru sıxlaşan bloklar
  blocks: `
    vec2 g = floor(vec2(pz * 4.2, py * 2.8 + px * 0.9));
    float ptM = step(ptHash(g), 0.62 - pz * 0.55);
  `,
  // Ralli dairəsi: qapıda iri yarış nömrəsi dairəsi + kapot-tavan boyu xətt.
  // ÖLÇÜLDÜ: əvvəlki "incə xətt" oyun məsafəsində 1.5% piksel dəyişirdi, yəni
  // praktikada görünmürdü. Dairə klassik ralli görkəmi verir və uzaqdan oxunur.
  rally: `
    float d = length(vec2(pz * 1.05, (py + 0.06) * 1.35));
    float disc = 1.0 - smoothstep(0.38, 0.44, d);
    float side = smoothstep(0.28, 0.60, abs(nx));
    float topLine = (1.0 - smoothstep(0.075, 0.105, abs(px)))
                  * smoothstep(0.35, 0.65, abs(ny));
    float ptM = max(disc * side, topLine);
  `,
  // ————— 2026-10-07: maşına xas skinlər üçün yeni naxışlar —————
  // Diaqonal bölgü: ön yarı bir rəng, arxa yarı o biri
  split: `
    float ptM = smoothstep(-0.04, 0.04, pz + py * 0.85 - 0.05);
  `,
  // Klassik yarış livreyası: enli mərkəz zolağı + yanlarında nazik xətt + alt kəmər
  gulf: `
    float a = abs(px);
    float centre = 1.0 - smoothstep(0.20, 0.24, a);
    float line = smoothstep(0.31, 0.33, a) * (1.0 - smoothstep(0.38, 0.40, a));
    float belt = (1.0 - smoothstep(0.07, 0.11, abs(py + 0.38))) * smoothstep(0.3, 0.6, abs(nx));
    float ptM = max(max(centre, line) * smoothstep(0.3, 0.6, abs(ny) + abs(nz)), belt);
  `,
  // Pələng: yan panellərdə dalğalı şaquli zolaqlar
  tiger: `
    float w = sin(pz * 9.5 + sin(py * 4.2 + pz * 1.5) * 1.3 + px * 1.6);
    float taper = smoothstep(-0.9, 0.2, py);
    float ptM = smoothstep(0.30, 0.62, w) * taper;
  `,
  // Zebra: bütün gövdə boyu nazik diaqonal zolaqlar
  zebra: `
    float ptM = smoothstep(0.42, 0.50, abs(fract((pz + py * 0.8 + px * 0.25) * 4.2) - 0.5) * 2.0);
  `,
  // Dalğa: yan boyunca sinus kimi axan enli lent
  wave: `
    float band = abs(py + 0.02 - sin(pz * 4.6) * 0.20);
    float ptM = (1.0 - smoothstep(0.15, 0.21, band)) * smoothstep(0.2, 0.5, abs(nx));
  `,
  // Çevron: arxaya açılan V şəkilləri
  chevron: `
    float v = fract(pz * 2.4 + abs(py + 0.05) * 1.5);
    float ptM = smoothstep(0.50, 0.56, v) * smoothstep(0.2, 0.5, abs(nx));
  `,
  // Boya sıçraması: müxtəlif ölçülü dairəvi ləkələr
  splat: `
    vec2 uv = vec2(pz * 3.2 + px * 1.1, py * 2.6 + px * 0.7);
    vec2 g = floor(uv);
    vec2 f = fract(uv) - 0.5;
    vec2 o = (vec2(ptHash(g), ptHash(g + 17.3)) - 0.5) * 0.5;
    float r = 0.14 + 0.24 * ptHash(g + 5.1);
    float ptM = 1.0 - smoothstep(r, r + 0.04, length(f - o));
  `,
  // Günəş şüaları: kapotun ortasından (üstdə) və qapının ortasından (yanda) açılan şüalar
  rays: `
    float top = smoothstep(0.35, 0.65, abs(ny));
    float a1 = atan(px, pz - 0.15);
    float a2 = atan(py + 0.55, pz + 0.1);
    float ptM = step(0.5, fract(mix(a2, a1, top) * 2.55));
  `,
  // Şanə: arxaya doğru böyüyən nöqtələr
  hex: `
    vec2 v = vec2(pz * 6.0, py * 5.0 + px * 1.5);
    v.y += mod(floor(v.x), 2.0) * 0.5;
    float r = 0.12 + 0.30 * (0.5 - pz * 0.5);
    float ptM = 1.0 - smoothstep(r, r + 0.05, length(fract(v) - 0.5));
  `,
  // Dövrə lövhəsi: düzbucaqlı texno xətlər
  circuit: `
    vec2 v = vec2(pz * 5.0, py * 4.0 + px * 2.0);
    vec2 g = floor(v);
    vec2 f = abs(fract(v) - 0.5);
    float hx2 = step(0.45, ptHash(g + 3.7));
    float hy2 = step(0.55, ptHash(g + 9.1));
    float ptM = max((1.0 - smoothstep(0.03, 0.06, f.y)) * hx2, (1.0 - smoothstep(0.03, 0.06, f.x)) * hy2);
    ptM = max(ptM, (1.0 - smoothstep(0.09, 0.12, length(f))) * hx2 * hy2);
  `,
  // Ulduz: kapotda və qapıda iri beşguşə ulduz
  star: `
    float top = smoothstep(0.35, 0.65, abs(ny));
    vec2 q = mix(vec2(pz + 0.05, py + 0.10) * vec2(2.3, 1.7), vec2(px, pz - 0.50) * vec2(1.9, 2.6), top);
    float ang = atan(q.x, q.y);
    float ptM = 1.0 - smoothstep(0.50, 0.55, length(q) / (0.62 + 0.38 * cos(ang * 5.0)));
  `,
  // Səpələnmiş keçid: burundan arxaya rəng dənə-dənə dəyişir
  fade: `
    vec2 g = floor(vec2(pz * 16.0, py * 10.0 + px * 5.0));
    float ptM = step(ptHash(g), smoothstep(-0.55, 0.65, -pz));
  `,
  // Panda: qapılar və kapot ikinci rəngdə (xidmət maşını görkəmi)
  panda: `
    float door = (1.0 - smoothstep(0.40, 0.44, abs(pz + 0.02))) * smoothstep(0.25, 0.55, abs(nx));
    float hood = smoothstep(0.50, 0.56, pz) * smoothstep(0.4, 0.7, abs(ny));
    float ptM = max(door, hood);
  `,
  // İldırım: yan boyunca ziqzaq xətt
  bolt: `
    float zig = abs(fract(pz * 2.6) - 0.5) * 0.62 - 0.20;
    float ptM = (1.0 - smoothstep(0.075, 0.11, abs(py - zig))) * smoothstep(0.2, 0.5, abs(nx));
  `,
  // Palçıq: alt hissədən yuxarı sıçramış kələ-kötür örtük
  mud: `
    float edge = -0.20 + sin(pz * 13.0) * 0.07 + sin(pz * 31.0 + 1.7) * 0.04 + (ptHash(floor(vec2(pz * 22.0, py * 22.0))) - 0.5) * 0.16;
    float ptM = 1.0 - smoothstep(edge - 0.03, edge + 0.05, py);
  `,
  // Sürüşdürülmüş cüt zolaq (assimetrik): sürücü tərəfində iki enli xətt
  bumble: `
    float a = px - 0.34;
    float ptM = max(1.0 - smoothstep(0.10, 0.13, abs(a)), 1.0 - smoothstep(0.035, 0.055, abs(a + 0.24)));
  `,
  // Nazik xətt: kəmər boyu ikiqat incə zolaq + kapotun kənar xətti
  pinstripe: `
    float side = smoothstep(0.25, 0.55, abs(nx));
    float l1 = 1.0 - smoothstep(0.025, 0.045, abs(py + 0.02));
    float l2 = 1.0 - smoothstep(0.012, 0.028, abs(py - 0.11));
    float hood = (1.0 - smoothstep(0.02, 0.04, abs(abs(px) - 0.62))) * smoothstep(0.4, 0.7, abs(ny));
    float ptM = max(max(l1, l2) * side, hood);
  `,
  // Arlekin: almaz şəbəkəsi
  harlequin: `
    vec2 v = vec2(pz * 3.2 + py * 2.4 + px * 0.6, pz * 3.2 - py * 2.4 - px * 0.6);
    float ptM = mod(floor(v.x) + floor(v.y), 2.0);
  `,
  // Köpəkbalığı ağzı: ön yarıda alt kənar boyu iri dişlər, burunda göz
  shark: `
    float side = smoothstep(0.2, 0.5, abs(nx));
    float front = smoothstep(-0.05, 0.08, pz);
    float jaw = -0.12 + abs(fract(pz * 4.0) - 0.5) * 0.56;
    float teeth = step(py, jaw) * step(-0.80, py);
    float eye = 1.0 - smoothstep(0.10, 0.12, length(vec2((pz - 0.66) * 0.8, py - 0.30)));
    float ptM = max(teeth * front, eye) * side;
  `,
  // Xəbərdarlıq lenti: alt kəmərdə diaqonal zolaqlar
  hazard: `
    float belt = 1.0 - smoothstep(0.20, 0.24, abs(py + 0.30));
    float ptM = step(0.5, fract((pz + py * 0.9) * 3.4)) * belt;
  `,
  // Retro: yan boyunca arxaya qalxan üç paralel xətt
  retro: `
    float base = py + 0.10 - pz * 0.16;
    float l = 0.0;
    for (int i = 0; i < 3; i++) l = max(l, 1.0 - smoothstep(0.035, 0.05, abs(base - float(i) * 0.14)));
    float ptM = l * smoothstep(0.2, 0.5, abs(nx));
  `,
};

export const PATTERN_KEYS = Object.keys(PATTERN);

// Naxışı gövdəyə tətbiq edir. skin = { pattern, colA, colB }
// Qaytarır: material (və ya null). Animasiya yoxdur — tick lazım deyil.
export function applyPaintPattern(root, skin) {
  const glsl = skin && PATTERN[skin.pattern];
  if (!glsl || !root) return null;
  let body = null;
  root.traverse((o) => { if (!body && o.isMesh && o.name === 'body') body = o; });
  const src = body?.material;
  if (!src) return null;

  const mat = src.clone();
  if (!body.geometry.boundingBox) body.geometry.computeBoundingBox();
  const bb = body.geometry.boundingBox;
  const cx = (bb.max.x + bb.min.x) / 2, cy = (bb.max.y + bb.min.y) / 2, cz = (bb.max.z + bb.min.z) / 2;
  const hx = Math.max(0.001, (bb.max.x - bb.min.x) / 2);
  const hy = Math.max(0.001, (bb.max.y - bb.min.y) / 2);
  const hz = Math.max(0.001, (bb.max.z - bb.min.z) / 2);
  // Uzun ox = maşının uzunluğu. Model X boyunca dursa oxlar dəyişdirilir,
  // beləcə "zolaq uzununa gedir" bütün modellərdə doğru qalır.
  const swap = hx > hz;
  const mask = src.userData?.fxMask || null;
  // KRİTİK: şeyderdə diffuseColor XƏTTİ fəzadadır (tekstura sRGB→xətti çevrilir).
  // Rəng nisbətini sRGB dəyərlərlə hesablasaq naxış solğun çıxır (ölçüldü:
  // lazım olan 14× əvəzinə 3.4× → tünd zeytundan açıq qumluğa keçid itirdi).
  // THREE.Color hex-i iş fəzasına (xətti) çevirir.
  const toVec = (hex) => {
    const c = new THREE.Color(hex);
    return { x: c.r, y: c.g, z: c.b };
  };

  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPtC = { value: { x: cx, y: cy, z: cz } };
    sh.uniforms.uPtH = { value: { x: hx, y: hy, z: hz } };
    sh.uniforms.uPtA = { value: toVec(skin.colA) };
    sh.uniforms.uPtB = { value: toVec(skin.colB) };
    if (mask) sh.uniforms.uPtMask = { value: mask };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>',
        '#include <common>\nuniform vec3 uPtC;\nuniform vec3 uPtH;\nvarying vec3 vPtPos;\nvarying vec3 vPtNrm;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 ptQ = (position - uPtC) / uPtH;
  vec3 ptN = normalize(normal);
  vPtPos = ${swap ? 'vec3(ptQ.z, ptQ.y, ptQ.x)' : 'ptQ'};
  vPtNrm = ${swap ? 'vec3(ptN.z, ptN.y, ptN.x)' : 'ptN'};
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + HEAD + (mask ? 'uniform sampler2D uPtMask;\n' : ''))
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float px = vPtPos.x, py = vPtPos.y, pz = vPtPos.z;
  vec3 nrm = normalize(vPtNrm);
  float nx = nrm.x, ny = nrm.y, nz = nrm.z;
${glsl}
  float ptK = ${mask ? 'texture2D(uPtMask, vMapUv).r' : '1.0'} * clamp(ptM, 0.0, 1.0);
  // İşıqlandırma itməsin: pikselin öz "işıq faktoru" (diffuse / əsas rəng)
  // saxlanılır, üstünə ikinci rəng vurulur → naxış sahəsi tam olaraq colB olur,
  // kölgə və parlaqlıq isə yerində qalır.
  vec3 ptShade = clamp(diffuseColor.rgb / max(uPtA, vec3(0.02)), 0.0, 4.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, uPtB * ptShade, ptK);
}`);
  };
  mat.customProgramCacheKey = () => 'nvpt4_' + skin.pattern + (swap ? '_s' : '') + (mask ? '_m' : '');
  mat.needsUpdate = true;

  const parts = [];
  root.traverse((o) => { if (o.isMesh && o.material === src) parts.push(o); });
  for (const o of parts) o.material = mat;
  return mat;
}
