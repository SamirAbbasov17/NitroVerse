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
  mat.customProgramCacheKey = () => 'nvpt2_' + skin.pattern + (swap ? '_s' : '') + (mask ? '_m' : '');
  mat.needsUpdate = true;

  const parts = [];
  root.traverse((o) => { if (o.isMesh && o.material === src) parts.push(o); });
  for (const o of parts) o.material = mat;
  return mat;
}
