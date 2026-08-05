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
    'nk:log_stack', 'nk:tree_cone'],
  // QEYD: yumru kol/çiçək blobları çıxarıldı — gecə indiqo işığında "yaşıl
  // daş" kimi oxunurdu və səhnəyə uyğun gəlmirdi (istifadəçi rəyi ×2)
  coast: ['nk:tree_palmDetailedShort', 'nk:tree_palmTall', 'nk:tree_oak'],
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

// ————— PAYLAŞILAN NÜSXƏ —————
// Eyni modelləri həm zen, həm yarış trekləri işlədir. İki dəfə yükləmək
// yaddaşı və şəbəkəni iki dəfə yeyirdi; indi tək nüsxə paylaşılır.
let _ortaq = null;
export function sharedNature() {
  if (!_ortaq) { _ortaq = new NatureKit(); _ortaq._loading = _ortaq.load(); }
  return _ortaq;
}

// Trek biomu → uyğun Kenney modelləri (yarış xəritələri üçün)
export const NATURE_BY_TRACK = {
  desert:  ['cactus_tall', 'rock_largeA', 'rock_largeC', 'rock_smallFlatA'],
  // Neon ŞƏHƏR trekidir — ağac məntiqsizdir (istifadəçi rəyi).
  // Şəhər kontekstində yalnız kol/xırda bitki qalır, qalanı CityKit verir.
  neon:    ['plant_bushLarge'],
  alpine:  ['tree_pineDefaultA', 'tree_pineDefaultB', 'tree_detailed', 'tree_cone',
    'log_stack', 'mushroom_redGroup', 'rock_largeA'],
  canyon:  ['rock_largeE', 'rock_largeA', 'tree_default_fall', 'tree_thin', 'rock_smallFlatA'],
  riviera: ['tree_palmTall', 'tree_palmDetailedShort', 'plant_bushLarge', 'tree_oak', 'flower_yellowB'],
  zavod:   ['tree_thin', 'grass_leafsLarge', 'rock_smallFlatA', 'log_stack'],
};

export class NatureKit {
  constructor() {
    this.templates = new Map();
    this.ready = false;
  }

  async load() {
    const loader = new GLTFLoader();
    // Kenney Nature Kit modelləri TEKSTURASIZDIR — hər mesh-in ÖZ RƏNGİ var
    // (gövdə qəhvəyi, yarpaq yaşıl, qaya boz). KÖHNƏ XƏTA: hamısı yükləmə
    // yarışını udan İLK materiala salınırdı → bütün təbiət tək rəng olurdu,
    // ağ material udanda isə "ağappaq rəngsiz ağaclar" (istifadəçi rəyi).
    // İndi materiallar RƏNGƏ görə paylaşılır: forma-rəng qorunur, eyni
    // rəngli mesh-lər yenə tək instansiyanı bölüşür → merge işləyir.
    this._mats = new Map();   // colorHex → paylaşılan material
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
          const hex = o.material.color?.getHexString?.() ?? 'ffffff';
          let m = this._mats.get(hex);
          if (!m) {
            m = o.material;
            m.roughness = 0.9;
            m.metalness = 0;
            m.userData = { ...(m.userData || {}), shared: true };
            if (m.map) m.map.userData = { shared: true };
            this._mats.set(hex, m);
          }
          o.material = m;   // eyni rəng → eyni instansiya
        });
        const wrap = new THREE.Group();
        wrap.add(obj);
        this.templates.set(name, wrap);
      } catch { /* tapılmasa prosedural dekor işləyəcək */ }
    }));
    this.ready = this.templates.size > 0;
  }

  // ——— BİOM TİNTİ ———
  // Modelin ÖZ RƏNGİ biom tintinə VURULUR (əvəz olunmur): yaşıl yarpaq
  // yaşıl qalır, isti biomda isti çalar alır. Klonlar (tint, baza) cütünə
  // görə keşlənir — draw call sayı rəng sayı ilə məhdud qalır.
  matFor(tintHex, baseMat) {
    if (!baseMat) return null;
    if (!tintHex || tintHex === 0xffffff) return baseMat;
    this._tints ||= new Map();
    const key = tintHex + '|' + (baseMat.color?.getHexString?.() ?? baseMat.uuid);
    let m = this._tints.get(key);
    if (!m) {
      m = baseMat.clone();
      m.color = baseMat.color.clone().multiply(new THREE.Color(tintHex));
      m.userData = { ...(baseMat.userData || {}), shared: true };
      this._tints.set(key, m);
    }
    return m;
  }

  get(name) {
    const t = this.templates.get(name);
    return t ? t.clone(true) : null;
  }
}
