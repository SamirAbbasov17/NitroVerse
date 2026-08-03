import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Kenney Nature Kit (CC0) — zen dünyası üçün peşəkar low-poly təbiət modelləri.
// Asinxron yüklənir; hazır olana qədər prosedural dekor işləyir.
const MODELS = {
  // ad → hədəf hündürlük (m)
  tree_pineDefaultA: 6.5,
  tree_pineDefaultB: 5.8,
  tree_default: 5.6,
  tree_default_fall: 5.6,
  tree_detailed: 6.2,
  tree_oak: 6.0,
  tree_cone: 5.2,
  tree_thin: 6.4,
  tree_palmDetailedShort: 5.0,
  tree_palmTall: 7.2,
  cactus_tall: 3.2,
  rock_largeA: 2.4,
  rock_largeC: 2.1,
  rock_largeE: 2.6,
  rock_smallFlatA: 1.1,
  plant_bushLarge: 1.4,
  log_stack: 1.2,
  mushroom_redGroup: 0.9,
  flower_redA: 0.8,
  flower_yellowB: 0.8,
  grass_leafsLarge: 1.0,
};

// Hər biomun təbiət dəsti (prosedural dekorun ÜSTÜNƏ qarışır)
export const NATURE_BY_BIOME = {
  desert: ['nk:rock_largeA', 'nk:rock_largeC', 'nk:cactus_tall', 'nk:rock_smallFlatA'],
  alpine: ['nk:tree_pineDefaultA', 'nk:tree_pineDefaultB', 'nk:tree_detailed',
    'nk:log_stack', 'nk:mushroom_redGroup', 'nk:grass_leafsLarge', 'nk:tree_cone'],
  coast: ['nk:tree_palmDetailedShort', 'nk:tree_palmTall', 'nk:plant_bushLarge',
    'nk:flower_yellowB', 'nk:tree_oak'],
  canyon: ['nk:rock_largeE', 'nk:tree_default_fall', 'nk:tree_thin', 'nk:rock_largeA'],
  snow: ['nk:tree_pineDefaultA', 'nk:tree_pineDefaultB', 'nk:tree_cone', 'nk:rock_largeA', 'nk:log_stack'],
};

// YAXIN PLAN səpini: yolun 13–30 m yaxınlığına düşən XIRDA bitkilər.
// Zen dünyası "boş" hiss verirdi — dərinlik məhz yaxın plandakı xırda
// detallardan gəlir (uzaqdakı ağaclar tək başına kifayət etmir).
export const SMALL_BY_BIOME = {
  desert: ['nk:rock_smallFlatA', 'nk:grass_leafsLarge', 'nk:cactus_tall'],
  alpine: ['nk:grass_leafsLarge', 'nk:flower_yellowB', 'nk:flower_redA',
    'nk:mushroom_redGroup', 'nk:plant_bushLarge', 'nk:rock_smallFlatA'],
  coast: ['nk:grass_leafsLarge', 'nk:plant_bushLarge', 'nk:flower_yellowB', 'nk:rock_smallFlatA'],
  canyon: ['nk:rock_smallFlatA', 'nk:grass_leafsLarge', 'nk:plant_bushLarge'],
  snow: ['nk:rock_smallFlatA', 'nk:log_stack', 'nk:grass_leafsLarge'],
};

export class NatureKit {
  constructor() {
    this.templates = new Map();
    this.ready = false;
  }

  async load() {
    const loader = new GLTFLoader();
    // Bütün Nature Kit modelləri EYNİ palitra teksturasını işlədir, amma hər GLB
    // öz material/tekstura nüsxəsini gətirir. Nüsxələr fərqli olduğu üçün chunk
    // birləşdirməsi işləmirdi və hər ağac ayrıca draw call idi. Burada hamısı
    // TƏK paylaşılan materiala keçirilir → chunk başına 1 çağırış.
    this._shared = null;
    await Promise.all(Object.entries(MODELS).map(async ([name, targetH]) => {
      try {
        const gltf = await loader.loadAsync(`models/nature/${name}.glb`);
        const obj = gltf.scene;
        // Hündürlüyə görə normallaşdır + yerə oturt
        const box = new THREE.Box3().setFromObject(obj);
        const h = Math.max(0.01, box.max.y - box.min.y);
        const s = targetH / h;
        obj.scale.setScalar(s);
        const box2 = new THREE.Box3().setFromObject(obj);
        const c = box2.getCenter(new THREE.Vector3());
        obj.position.x -= c.x;
        obj.position.z -= c.z;
        obj.position.y -= box2.min.y;
        obj.traverse((o) => {
          if (!o.isMesh || !o.material) return;
          if (!this._shared) {
            o.material.roughness = 0.9;
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
      } catch { /* tapılmasa prosedural dekor işləyəcək */ }
    }));
    this.ready = this.templates.size > 0;
  }

  // Klon qaytarır (yoxdursa null — çağıran prosedurala düşür)
  get(name) {
    const t = this.templates.get(name);
    return t ? t.clone(true) : null;
  }
}
