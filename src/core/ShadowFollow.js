import * as THREE from 'three';

// KÖLGƏ KAMERASININ OYUNÇUNU İZLƏMƏSİ — titrəməsiz.
// Kölgə xəritəsi piksellərdən (teksel) ibarətdir. Kölgə kamerası maşınla birlikdə HAMAR sürüşəndə
// hər kadr kölgənin kənarı başqa teksellərə düşür və kölgə "oynayır" (maşının altında titrəyən
// kölgə — oyunçu rəyi). Həll: kameranın hədəfi işıq fəzasında tam teksel addımlarına yuvarlaqlaşır —
// kölgə xəritəsi dünyaya nisbətən sabit şəbəkədə qalır, kənarlar yerində durur.
// İşığın istiqaməti (ox, oy, oz) hədəfə nisbətən verilir və kadrlar arasında dəyişmir: əvvəl işığın
// hündürlüyü mütləq idi, yəni maşın təpəyə qalxdıqca istiqamət dəyişir, kölgə də sürüşürdü.
const _d = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _t = new THREE.Vector3();

export function followShadow(light, pos, ox, oy, oz) {
  const cam = light.shadow.camera;
  const tex = (cam.right - cam.left) / light.shadow.mapSize.x;      // bir tekselin dünya ölçüsü
  _d.set(ox, oy, oz).normalize();
  _r.set(0, 1, 0).cross(_d);
  if (_r.lengthSq() < 1e-8) _r.set(1, 0, 0);
  _r.normalize();
  _u.crossVectors(_d, _r);
  const pr = pos.dot(_r), pu = pos.dot(_u);
  _t.copy(pos)
    .addScaledVector(_r, Math.round(pr / tex) * tex - pr)
    .addScaledVector(_u, Math.round(pu / tex) * tex - pu);
  light.target.position.copy(_t);
  light.position.set(_t.x + ox, _t.y + oy, _t.z + oz);
  light.target.updateMatrixWorld();
}
