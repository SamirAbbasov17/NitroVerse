import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// KayKit City Builder Bits (CC0, Kay Lousberg) — şəhər tikililəri və küçə
// detalları. NatureKit ilə eyni prinsip: bütün modellər TƏK paylaşılan
// material işlədir (atlas teksturası), ona görə chunk birləşdirməsi işləyir
// və draw call artmır.
const MODELS = {
  // ad → hədəf hündürlük (m). Modellər öz nisbətini saxlayır.
  building_A_withoutBase: 14,
  building_B_withoutBase: 18,
  building_C_withoutBase: 22,
  building_D_withoutBase: 16,
  building_E_withoutBase: 26,
  building_F_withoutBase: 20,
  building_G_withoutBase: 30,
  building_H_withoutBase: 24,
  bench: 0.9,
  bush: 1.1,
  box_A: 1.0,
  box_B: 1.2,
};

// Rayon sıralarına görə model dəsti: ön sıra alçaq, arxa sıra hündür
export const CITY_ROWS = [
  ['building_A_withoutBase', 'building_D_withoutBase'],
  ['building_B_withoutBase', 'building_F_withoutBase', 'building_H_withoutBase'],
  ['building_C_withoutBase', 'building_E_withoutBase', 'building_G_withoutBase'],
];
export const CITY_PROPS = ['bench', 'bush', 'box_A', 'box_B'];

class CityKit {
  constructor() {
    this.templates = new Map();
    this.ready = false;
  }

  async load() {
    const loader = new GLTFLoader();
    this._shared = null;
    await Promise.all(Object.entries(MODELS).map(async ([name, hədəf]) => {
      try {
        const gltf = await loader.loadAsync(`models/city/${name}.gltf`);
        const obj = gltf.scene;
        // Hündürlüyə görə normallaşdır + yerə otur + mərkəzləşdir
        const box = new THREE.Box3().setFromObject(obj);
        const h = Math.max(0.01, box.max.y - box.min.y);
        obj.scale.setScalar(hədəf / h);
        const box2 = new THREE.Box3().setFromObject(obj);
        const c = box2.getCenter(new THREE.Vector3());
        obj.position.x -= c.x;
        obj.position.z -= c.z;
        obj.position.y -= box2.min.y;
        obj.traverse((o) => {
          if (!o.isMesh || !o.material) return;
          o.castShadow = true;
          if (!this._shared) {
            o.material.roughness = 0.85;
            o.material.metalness = 0;
            o.material.userData = { ...(o.material.userData || {}), shared: true };
            if (o.material.map) o.material.map.userData = { shared: true };
            this._shared = o.material;
          }
          o.material = this._shared;   // hamısı bir materialı paylaşır
        });
        const wrap = new THREE.Group();
        wrap.add(obj);
        this.templates.set(name, wrap);
      } catch { /* tapılmasa prosedural tikili işləyəcək */ }
    }));
    this.ready = this.templates.size > 0;
  }

  get(name) {
    const t = this.templates.get(name);
    return t ? t.clone(true) : null;
  }
}

// Paylaşılan nüsxə — zen şəhər rayonları və neon treki eyni modelləri işlədir
let _ortaq = null;
export function sharedCity() {
  if (!_ortaq) { _ortaq = new CityKit(); _ortaq._loading = _ortaq.load(); }
  return _ortaq;
}
