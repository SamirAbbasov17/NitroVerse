import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// ————— RENDER SONRASI CİLA (Faza 3.11) — YALNIZ MASAÜSTÜ —————
// Səhnə ekrana çəkildiyi kimi (ton xəritəsi + sRGB materialın içində) 8-bit MSAA
// hədəfə çəkilir, parlaq hissələrdən bloom çıxarılır, sonda tək tam-ekran keçid
// trekin rəng qradasiyasını tətbiq edir. Mobildə bu sinif heç yaradılmır (Game.js).
//
// NİYƏ HDR DEYİL: ilk variant xətti HDR hədəf + sonda ton xəritəsi idi. Three.js-də
// duman ton xəritəsindən SONRA qarışır, şəffaf qatlar isə ekran fəzasında — HDR
// yolunda hər ikisi dəyişir və uzaq plan solurdu (alp: dağ pikseli 119,163,192 →
// 157,185,197; `tests/out/postfx`). Bədii tənzim ekran fəzasında edilib, ona görə
// səhnə olduğu kimi saxlanır, cila yalnız üstünə əlavə olunur.
//
// r160 HİYLƏSİ: `isXRRenderTarget = true` — WebGLRenderer yalnız ekran və XR hədəfi
// üçün materialda ton xəritəsi/sRGB tətbiq edir (three.module.js: WebGLPrograms
// `getParameters`). Bayraq hədəfi ekranla eyni şeyder variantına salır: görüntü
// piksel-piksel eynidir və cilanı yandırıb-söndürmək şeyderi yenidən yığmır.
// Three.js yenilənəndə bu yer yoxlanmalıdır (`npm run test:postfx`).
// EffectComposer işlədilmir: iki tam ölçülü hədəf saxlayır, burada biri kifayətdir.
//
// Oyunçu söndürə bilər: localStorage `apexPost` = '0' (ayarlar düyməsi Faza 5-də).
const KEY = 'apexPost';

const read = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };

// Neytral qradasiya: əvvəlki CSS qatının (saturate 1.08 · contrast 1.045) eynisi —
// cila açılanda bloom və trek preseti olmayan səhnə əvvəlki kimi görünür.
export const GRADE_DEFAULT = {
  bloom: 0.2,        // bloom gücü
  bloomRadius: 0.55,
  // Ekran parlaqlığı 0..1; bundan parlaq piksellər parıldayır. Gündüz səması
  // ~0.85–0.9-dur — hədd ondan yuxarı olmalıdır, yoxsa bütün səma ağarır.
  bloomThreshold: 0.95,
  saturation: 1.08,
  contrast: 1.045,
  shadows: 0xffffff,    // kölgələrin rəng çaları (ağ = toxunulmur)
  highlights: 0xffffff, // işıqlı hissələrin rəng çaları
};

const FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uSat;
  uniform float uContrast;
  uniform vec3 uShadows;
  uniform vec3 uHighlights;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    // Hədəf artıq ekran (sRGB) fəzasındadır — qradasiya əvvəlki CSS filtri kimi işləyir
    gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0);
    vec3 c = gl_FragColor.rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSat);
    c = (c - 0.5) * uContrast + 0.5;
    c *= mix(uShadows, uHighlights, smoothstep(0.0, 1.0, l));
    // 8-bit zolaqlanmaya qarşı ±½ pillə səs-küy (səma qradiyenti)
    c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  }
`;

const _fog = new THREE.Color();
const _bg = new THREE.Color();

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = read(KEY) !== '0';
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target = new THREE.WebGLRenderTarget(size.x, size.y, { samples: 4 });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    // Saxlama formatı açıq RGBA8: sRGB teksturası (SRGB8_ALPHA8) yazanda ikinci dəfə
    // kodlayardı və MSAA buferi (RGBA8) ilə format uyğunsuzluğundan kadr qara çıxırdı
    this.target.texture.internalFormat = 'RGBA8';
    this.target.isXRRenderTarget = true; // bax yuxarıdakı "r160 hiyləsi"
    this.bloom = new UnrealBloomPass(size.clone(), 0.2, 0.55, 0.95);
    this.final = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uSat: { value: 1 },
        uContrast: { value: 1 },
        uShadows: { value: new THREE.Color(1, 1, 1) },
        uHighlights: { value: new THREE.Color(1, 1, 1) },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new FullScreenQuad(this.final);
    this.setGrade(null);
    document.body.classList.toggle('post-on', this.enabled);
  }

  setGrade(grade) {
    const g = { ...GRADE_DEFAULT, ...(grade || {}) };
    this.bloom.strength = g.bloom;
    this.bloom.radius = g.bloomRadius;
    this.bloom.threshold = g.bloomThreshold;
    const u = this.final.uniforms;
    u.uSat.value = g.saturation;
    u.uContrast.value = g.contrast;
    // Çalar ekran fəzasında vurulur — rəng idarəetməsi çevirməsin
    u.uShadows.value.setHex(g.shadows, THREE.NoColorSpace);
    u.uHighlights.value.setHex(g.highlights, THREE.NoColorSpace);
  }

  setEnabled(on) {
    this.enabled = !!on;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* gizli rejim */ }
    document.body.classList.toggle('post-on', this.enabled);
  }

  resize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target.setSize(size.x, size.y);
    this.bloom.setSize(size.x, size.y);
  }

  render(scene, camera) {
    const r = this.renderer;
    // r160: hədəfə çəkəndə duman və fon rəngi uniform-a XƏTTİ verilir
    // (`getUnlitUniformColorSpace`), şeyder isə onu sRGB çıxışın üstünə qarışdırır —
    // duman tündləşir, uzaq dağlar doymuş çıxır. Kadr müddətinə rəngi elə dəyişirik
    // ki, uniform-a ekrandakı ilə eyni (sRGB) dəyər düşsün; sonra geri qaytarılır.
    const fog = scene.fog;
    const bg = scene.background && scene.background.isColor ? scene.background : null;
    if (fog) { _fog.copy(fog.color); fog.color.convertLinearToSRGB(); }
    if (bg) { _bg.copy(bg); bg.convertLinearToSRGB(); }
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    if (fog) fog.color.copy(_fog);
    if (bg) bg.copy(_bg);
    if (this.bloom.strength > 0) this.bloom.render(r, null, this.target, 0, false);
    r.setRenderTarget(null);
    this.quad.render(r);
  }

  dispose() {
    this.target.dispose();
    this.bloom.dispose();
    this.final.dispose();
    this.quad.dispose();
  }
}
