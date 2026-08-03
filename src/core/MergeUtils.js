import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Statik qrupdakı mesh-ləri material imzasına görə birləşdirir —
// yüzlərlə draw call bir neçəsinə düşür (görüntü DƏYİŞMİR).
// Teksturalı və işıqlı obyektlər toxunulmaz qalır.
export function mergeStaticGroup(group) {
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
    const key = [
      o.userData?.roadPart ? 'road' : '-',   // yol hissələri ayrıca yığılır
      m.map?.uuid || '-',
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
      b = { material: m, geos: [], roadPart: !!o.userData?.roadPart };
      buckets.set(key, b);
    }
    b.geos.push(g.clone().applyMatrix4(o.matrixWorld));
  });

  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = true;
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
