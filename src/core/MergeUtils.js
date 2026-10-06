import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Statik qrupdakı mesh-ləri material imzasına görə birləşdirir —
// yüzlərlə draw call bir neçəsinə düşür (görüntü DƏYİŞMİR).
// Teksturalı və işıqlı obyektlər toxunulmaz qalır.
// RƏNGİN TƏPƏYƏ YAZILMASI (bakeColors): düz rəngli materiallar (teksturasız, parıltısız,
// qeyri-şəffaf) rəngə görə ayrı dəstəyə düşmür — rəng həndəsənin `color` atributuna
// yazılır və hamısı TƏK vertex-rəngli materialla çəkilir. Zen-də bir yol parçası
// (chunk) rəng başına ayrı mesh idi: səhnədə 321 birləşmiş mesh-in 275-i yalnız rənglə
// fərqlənirdi (ölçüldü) — draw call büdcəsinin əsas yükü bu idi.
const _baked = new Map();
function bakedMaterial(rough) {
  let m = _baked.get(rough);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: rough, metalness: 0 });
    m.userData = { shared: true };
    _baked.set(rough, m);
  }
  return m;
}

export function mergeStaticGroup(group, { bakeColors = false } = {}) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  const skipped = [];

  group.traverse((o) => {
    if (o.isLight) skipped.push(o);
    if (!o.isMesh) return;
    const m = o.material;
    const g = o.geometry;
    // Teksturalılar da birləşir — şərt: EYNİ tekstura nüsxəsi (uuid açara girir).
    // Nature Kit modelləri bir paylaşılan material işlədir (bax NatureKit.load),
    // ona görə bütün ağac/daş/kol tək mesh-ə yığılır.
    if (m.map && !m.map.uuid) { skipped.push(o); return; }
    if (!g.attributes.uv && m.map) { skipped.push(o); return; } // UV yoxdursa qarışar
    const bake = bakeColors && m.isMeshStandardMaterial && !m.map && !m.emissiveMap && !m.transparent
      && m.flatShading && !m.vertexColors && (m.emissive.getHex() === 0 || m.emissiveIntensity === 0)
      && !o.userData?.roadPart;
    if (bake) {
      const rough = m.roughness < 0.6 ? 0.5 : 0.9;
      const bkey = ['VC', o.receiveShadow ? 'rs' : '-', o.userData?.flat ? 'flat' : '-', rough].join('|');
      let bb = buckets.get(bkey);
      if (!bb) {
        bb = { material: bakedMaterial(rough), geos: [], roadPart: false, receiveShadow: !!o.receiveShadow, flat: !!o.userData?.flat };
        buckets.set(bkey, bb);
      }
      const src = g.clone().applyMatrix4(o.matrixWorld);
      // yalnız position + normal + color qalır (atribut dəsti hamıda eyni olsun)
      const ng = new THREE.BufferGeometry();
      ng.setIndex(src.index);
      ng.setAttribute('position', src.attributes.position);
      if (!src.attributes.normal) src.computeVertexNormals();
      ng.setAttribute('normal', src.attributes.normal);
      const n = src.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = m.color.r; col[i * 3 + 1] = m.color.g; col[i * 3 + 2] = m.color.b; }
      ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
      bb.geos.push(ng);
      return;
    }
    const key = [
      o.userData?.roadPart ? 'road' : '-',   // yol hissələri ayrıca yığılır
      o.receiveShadow ? 'rs' : '-',          // kölgə qəbulu bucket-i bölür
      o.userData?.flat ? 'flat' : '-',       // yastı səth (asfalt, zolaq) kölgə SALMIR
      m.map?.uuid || '-',
      m.emissiveMap?.uuid || '-',
      m.color?.getHexString(),
      m.emissive?.getHexString(),
      m.emissiveIntensity,
      m.roughness,
      m.metalness,
      m.transparent ? m.opacity : 1,
      m.flatShading ? 1 : 0,
      Object.keys(g.attributes).sort().join(','), // atribut dəsti uyğun olsun
    ].join('|');
    let b = buckets.get(key);
    if (!b) {
      b = { material: m, geos: [], roadPart: !!o.userData?.roadPart, receiveShadow: !!o.receiveShadow, flat: !!o.userData?.flat };
      buckets.set(key, b);
    }
    b.geos.push(g.clone().applyMatrix4(o.matrixWorld));
  });

  const out = new THREE.Group();
  for (const b of buckets.values()) {
    // İndeksli və indekssiz həndəsə (məs. BoxGeometry + ExtrudeGeometry) bir yerdə
    // birləşmir: mergeGeometries null qaytarır və bütün dəstə SƏSSİZ itirdi (zavod
    // sexlərinin damı). Qarışıqdırsa hamısı indekssizə çevrilir.
    if (b.geos.some((g) => g.index) && b.geos.some((g) => !g.index)) {
      b.geos = b.geos.map((g) => { if (!g.index) return g; const n = g.toNonIndexed(); g.dispose(); return n; });
    }
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.material);
    // Yerə yatan lentlər (asfalt, kənar zolaq, mərkəz xətti) kölgə salmır —
    // kölgə keçidində boşuna çəkilirdilər
    mesh.castShadow = !b.flat;
    // KÖLGƏ QƏBULU MƏNBƏDƏN QORUNUR (şərtsiz true DEYİL): zen yolu/kənarı
    // bayrağı özü qoyur və kölgə alır; neon binaları isə heç vaxt kölgə
    // qəbul etməyib — şərtsiz true onları gecə bir-birinin kölgəsində
    // "qapqara" göstərirdi (istifadəçi rəyi).
    mesh.receiveShadow = b.receiveShadow;
    // Yol hissəsi işarəsi birləşmədən SONRA da qalmalıdır — yoxsa dəhliz
    // süpürgəsi yolun öz kəsik xətlərini və körpü dayaqlarını "maneə" sanır
    if (b.roadPart) mesh.userData.roadPart = true;
    out.add(mesh);
  }
  // İşıqlar / teksturalılar olduğu kimi köçürülür (dünya mövqeyi ilə)
  for (const o of skipped) {
    if (o.parent) {
      const world = new THREE.Vector3();
      o.getWorldPosition(world);
      const q = new THREE.Quaternion();
      o.getWorldQuaternion(q);
      const s = new THREE.Vector3();
      o.getWorldScale(s);
      out.add(o);
      o.position.copy(world);
      o.quaternion.copy(q);
      o.scale.copy(s);
    }
  }
  return out;
}

// ————— SƏHNƏ RESURSLARININ TƏMİZLƏNMƏSİ —————
// Səhnə bağlananda geometriya silinirdi, MATERİAL və TEKSTURA isə qalırdı:
// ölçüldü — hər açılışda +4…5 tekstura (6 yarışda 21 → 43). Uzun sessiyada
// GPU yaddaşı dolurdu.
//
// `userData.shared` işarəsi olan resurslar TOXUNULMAZ qalır: model kitabxanası,
// NatureKit və su materialı bütün səhnələr arasında paylaşılır.
const TEX_KEYS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap',
  'alphaMap', 'aoMap', 'lightMap', 'bumpMap', 'displacementMap', 'specularMap', 'envMap'];

export function disposeObject3D(root) {
  if (!root) return { mat: 0, tex: 0 };
  const seenMat = new Set(), seenTex = new Set();
  let mat = 0, tex = 0;
  root.traverse((o) => {
    // İŞIQLAR: kölgə xəritəsi 2048² = ~16 MB. Obyekt səhnədən çıxanda
    // avtomatik azad OLUNMUR — ölçüldü, hər səhnə dövründə 2 ədəd qalırdı.
    if (o.isLight) {
      o.shadow?.map?.dispose();
      o.shadow?.mapPass?.dispose();
      o.dispose?.();
      tex += o.shadow?.map ? 1 : 0;
    }
    o.geometry?.dispose?.();
    const list = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of list) {
      if (!m || seenMat.has(m) || m.userData?.shared) continue;
      seenMat.add(m);
      for (const k of TEX_KEYS) {
        const t = m[k];
        if (t?.isTexture && !seenTex.has(t) && !t.userData?.shared) {
          seenTex.add(t); t.dispose(); tex++;
        }
      }
      m.dispose(); mat++;
    }
  });
  return { mat, tex };
}
