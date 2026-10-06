import * as THREE from 'three';
import { makeDecor, makeLamp, flatMat, makeTireStack, makeBarrier, cityBoxGeometry, cityMat, glowMat, makeCityBuilding,
  makeGrandstand, makeFloodlight, makeMarshalPost, makeSponsorBoard, makeBunting } from '../core/AssetFactory.js';
import { mergeStaticGroup } from '../core/MergeUtils.js';
import { sharedNature } from './NatureKit.js';

// Səhnə mühiti: göy, fog, IBL env-map, işıqlar, yer, uzaq relyef və dekor.
export class Environment {
  // Kenney modelləri (CC0) — prosedural konus/dodekaedrdən qat-qat keyfiyyətli.
  // Yüklənmə asinxrondur: hazır olmayanda prosedural dekor işləyir, hazır
  // olan kimi TƏBİƏT qatı əlavə olunur (yenidən qurulma yoxdur).
  constructor(scene, trackData, track, renderer = null) {
    this.scene = scene;
    this.data = trackData;
    this.track = track;
    this.renderer = renderer;
    this.objects = [];
    this._build();
  }

  // YER BOŞDURMU: yeni obyekt mövcud heç bir maneə ilə kəsişməməlidir.
  // Bunsuz iri obyektlər (bina, mesa, təpə, tribuna) bir-birinin İÇİNDƏN
  // çıxırdı (istifadəçi rəyi: şəhər trekində tribunalar üst-üstə düşür).
  _free(x, z, r, pad = 1.2) {
    return !this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + pad)
      && !this._inWater(x, z, r)
      && !this._onBranch(x, z, r);
  }

  // ŞAXƏ YOLU: əsas yola görə yerləşdirilən qurğular (sponsor lövhəsi, tribuna, şin
  // yığını, fənər) şaxə yolunu yoxlamırdı və bəzən onun DÜZ ORTASINA düşürdü
  // (Riviera: 2.7 m radiuslu lövhə şaxənin mərkəzində — istifadəçi rəyi: "döngədə
  // yolun ortasında maneə var, dönmək olmur"). İndi bütün yerləşdirmələr buradan keçir.
  _onBranch(x, z, r = 0) {
    if (!this.track.branches?.length) return false;
    this._tmpV ||= new THREE.Vector3();
    return this.track.isOnBranch(this._tmpV.set(x, 0, z), r + 1);
  }

  // Yerin (relyefli mesh-in) həmin nöqtədəki hündürlüyü. Trekdən uzaqda relyef ±1.7 m
  // dalğalanır; dekor sabit y = 0-a qoyulanda ya havada qalır, ya torpağa batır.
  _groundY(x, z) {
    if (!this._groundMesh) return -0.04;
    this._ray ||= new THREE.Raycaster();
    this._rayO ||= new THREE.Vector3();
    this._rayD ||= new THREE.Vector3(0, -1, 0);
    this._groundMesh.updateMatrixWorld();
    this._ray.set(this._rayO.set(x, 60, z), this._rayD);
    const hit = this._ray.intersectObject(this._groundMesh, false)[0];
    return hit ? hit.point.y : -0.04;
  }

  // SU ZONASI: çay/göl səthi (körpü altı daxil). Toqquşma siyahısından AYRIDIR —
  // körpü zonasında toqquşma yoxdur (yol keçir), amma dekor yenə qoyula bilməz.
  // Əvvəl şin yığınları və daşlar suyun içinə düşürdü (istifadəçi rəyi).
  _inWater(x, z, r = 0) {
    // Dəniz (çimərlik zolağı daxil): sahil xəttindən 14 m içəridən cənuba dekor qoyulmur
    if (this._seaCoast && z - r < -(this._seaCoast - 14)) return true;
    return this.keepOut.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r);
  }

  _build() {
    const p = this.data.palette;
    this.obstacles = []; // { x, z, r } — bütün bərk obyektlər (toqquşma üçün)
    this.keepOut = [];   // { x, z, r } — su səthi: dekor qoyulmur (bax _inWater)

    // Trek-üzrə rəng qradasiyası (exposure) — hər xəritənin öz "saat/hava" hissi
    if (this.renderer) this.renderer.toneMappingExposure = p.exposure ?? 1.15;

    // Fon + fog
    this.scene.background = new THREE.Color(p.sky);
    this.scene.fog = new THREE.Fog(p.fog, p.fogNear ?? 90, p.fogFar ?? 460);

    // Göy günbəzi (3 dayaqlı qradient + üfüq işıq zolağı — dərinlik hissinin açarı)
    const skyTex = this._skyTexture(p);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(760, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    this.scene.add(sky);
    this._track(sky);

    // Günəş / Ay diski + halo — səhnəyə fokus nöqtəsi verir
    this._celestialBody(p);
    // Gecə trekində ulduzlar
    if (p.night) this._stars();

    // IBL — materialları canlandırır (parıltı, dolğun rəng).
    // KEŞ: PMREM hər səhnə açılışında 3 daxili tekstura yaradırdı və
    // pmrem.dispose() onları tam azad etmirdi (ölçüldü: 8 dövrdə 23 → 50
    // tekstura). Xəritə YALNIZ trek palitrasından asılıdır → trek üzrə bir
    // dəfə qurulur, sonra paylaşılır. Yan fayda: səhnə açılışı sürətlənir.
    if (this.renderer) {
      const key = this.data.id || 'default';
      if (!Environment._envCache) Environment._envCache = new Map();
      let envTex = Environment._envCache.get(key);
      if (!envTex) {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const rt = pmrem.fromEquirectangular(skyTex);
        envTex = rt.texture;
        envTex.userData = { shared: true };   // səhnə təmizləməsi toxunmasın
        pmrem.dispose();
        Environment._envCache.set(key, envTex);
      }
      this.scene.environment = envTex;
      this.scene.environmentIntensity = 0.6;
      this._envRT = null;   // keşlənmiş — bu səhnəyə aid deyil
    }

    // İşıqlar (palitra intensivlikləri ilə tənzimlənə bilir)
    const hemi = new THREE.HemisphereLight(p.sky, p.ambient ?? 0x444444, p.hemiIntensity ?? 0.9);
    this.scene.add(hemi);
    this._track(hemi);

    const sun = new THREE.DirectionalLight(p.sun ?? 0xffffff, p.sunIntensity ?? 1.25);
    // İstiqamət trekdən gəlir (palette.sunDir); standart — hündür günorta bucağı
    const sd = p.sunDir ?? [60, 110, 40];
    sun.position.set(sd[0], sd[1], sd[2]);
    sun.userData.offset = sd;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -70; cam.right = 70; cam.top = 70; cam.bottom = -70;
    cam.near = 10; cam.far = 320;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun; // GameplayScene oyunçunu izlətmək üçün istifadə edir
    this._track(sun);

    // Dolğun (fill) işıq — arxa üzlər qaralmasın
    const fill = new THREE.DirectionalLight(p.sun ?? 0xffffff, 0.45);
    fill.position.set(-110, 90, -80);
    this.scene.add(fill);
    this._track(fill);

    const amb = new THREE.AmbientLight(0xffffff, p.ambientIntensity ?? 0.32);
    this.scene.add(amb);
    this._track(amb);

    // Yer — incə noise toxuması ilə (düz rəngin "plastik" görkəmi itir)
    const groundTex = this._noiseTexture();
    groundTex.repeat.set(30, 30);
    // ƏVVƏL: tək CircleGeometry (mərkəzdən 64 üçbucaq) — tamamilə düz və
    // tək rəngli səth. Uzaqdan "plastik masa" kimi görünürdü.
    // İNDİ: şəbəkəli halqa + VERTEX RƏNGİ (iri miqyaslı ləkələr, təkrarsız)
    // + trekdən uzaqda yüngül relyef dalğası. Draw call artmır (tək mesh),
    // yalnız vertex sayı 65 → ~3 600 (yüklənmə vaxtı ~10 ms).
    const gGeo = new THREE.RingGeometry(0.4, 720, 128, 26);
    {
      const pos = gGeo.attributes.position;
      const col = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
      const tmp = new THREE.Vector3();
      const baza = new THREE.Color(p.ground);
      // Yer teksturası boz (#909090 → xətti 0.28) olduğu üçün palitra rəngi ~3.5 dəfə tünd
      // çıxır. `groundGain` trek başına bunu kompensasiya edir (standart 1 = köhnə görünüş).
      const gain = p.groundGain ?? 1;
      // Kənar tündləşməsi (dərinlik hissi) vertex rənginə yazılır. ƏVVƏL ayrıca
      // "rim" halqası idi: yerdən 1 sm yuxarıda, eyni sahədə — relyef dalğası
      // onun içindən çıxıb sərt kənarlı ləkələr yaradır, uzaqda isə iki səth
      // yanıb-sönürdü (z-fighting; istifadəçi rəyi).
      const kənar = new THREE.Color(p.groundEdge ?? p.ground);
      const rəng = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);   // düzlük XY-dədir
        const wx = x, wz = -y;                     // döndərmədən sonra dünya
        // Trekə yaxın hissə TAM DÜZ qalır (maşın kəsişməsin)
        tmp.set(wx, 0, wz);
        let yan = Math.abs(this.track.getNearest(tmp).lateral);
        // ŞAXƏ YOLLARI da "yol"dur: əvvəl yalnız əsas trekə baxılırdı və relyef dalğası
        // şaxə yolunun üstünə çıxırdı — Rivierada yol 0.6 m-ə qədər torpağın altında
        // qalırdı (ölçüldü; istifadəçi rəyi: "yol torpağın içinə girir").
        for (const b of this.track.branches || []) {
          for (let k = 0; k < b.points.length; k += 2) {
            const d = Math.hypot(b.points[k].x - wx, b.points[k].z - wz);
            if (d < yan) yan = d;
          }
        }
        const uzaq = Math.max(0, Math.min(1, (yan - 34) / 90));
        const dalğa = Math.sin(wx * 0.011 + 1.3) * Math.cos(wz * 0.009 - 0.7)
          + Math.sin((wx + wz) * 0.021 + 2.1) * 0.5;
        // Dəniz zonasında (və sahildən 60 m içəridə) relyef yoxdur: dalğalar suyun
        // üstünə çıxıb dənizin ortasında qəhvəyi "quru zolaqları" yaradırdı
        const dəniz = this._seaCoast && wz < -(this._seaCoast - 60);
        pos.setZ(i, dəniz ? 0 : dalğa * 1.7 * uzaq); // ±1.7 m, yalnız uzaqda
        // Rəng: üç oktava alçaq tezlik → təkrarlanmayan ləkələr
        const n1 = Math.sin(wx * 0.006 + 0.4) * Math.cos(wz * 0.0052 - 1.1);
        const n2 = Math.sin((wx * 0.7 + wz) * 0.013 + 2.4);
        const n3 = Math.sin(wx * 0.026 - wz * 0.019 + 4.1);
        const k = 0.955 + (n1 * 0.5 + n2 * 0.3 + n3 * 0.2) * 0.075;
        const e = Math.max(0, Math.min(1, (Math.hypot(wx, wz) - 200) / 90));
        rəng.copy(baza).lerp(kənar, e * e * (3 - 2 * e));
        col.setXYZ(i, rəng.r * k * gain, rəng.g * k * gain, rəng.b * k * gain * (1 + n2 * 0.02));
      }
      gGeo.setAttribute('color', col);
      gGeo.computeVertexNormals();
    }
    const ground = new THREE.Mesh(
      gGeo,
      new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0,
        vertexColors: true, flatShading: true })
    );
    ground.rotation.x = -Math.PI / 2;
    // LAY SIRASI (aşağıdan yuxarı): yer −0.04 · sahil −0.012 · su +0.009 ·
    // şaxə yolu +0.012 · yol +0.02 · zolaq +0.05. Laylar arası ən azı ~2 sm:
    // 4–5 mm fərqlə uzaqda dərinlik buferi onları ayıra bilmir və yanıb-sönür.
    ground.position.y = -0.04;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this._track(ground);
    this._groundGeo = gGeo;
    this._groundMesh = ground; // _groundY üçün

    // Dəniz sahili varsa, dağ halqası hesablamadan ƏVVƏL bilinməlidir
    // Sahil xətti trekin ƏN CƏNUB nöqtəsindən 24 m aralıdır. Əvvəl `maxRadius + 20`
    // idi: Rivierada dəniz yoldan ən azı 67 m, çox yerdə yüzlərlə metr uzaqda və
    // dumanın arxasında qalırdı — "sahil treki"ndə dəniz demək olar görünmürdü.
    if (this.data.sea) {
      let minZ = Infinity;
      for (const q of this.track.points) if (q.z < minZ) minZ = q.z;
      this._seaCoast = -minZ + (this.data.sea.gap ?? 24);
    }
    this._distant();
    this._clouds();
    if (this.data.sea) this._sea();
    // SIRA VACİBDİR: su ƏVVƏL qurulur ki, sonrakı hər şey (təpə, şin, dekor)
    // ondan yan keçsin. Əvvəl çay rekvizitlərdən SONRA gəlirdi → şin yığınları
    // və təpələr suyun içində qalırdı.
    if (this.data.river) this._river(this.data.river);
    if (this.data.id === 'canyon') this._canyonWalls();
    if (this.data.id === 'riviera') this._rivieraTown(); // təpələrdən əvvəl: yerini tutur
    if (['desert', 'alpine', 'riviera'].includes(this.data.id)) this._hills();
    if (this.data.id === 'neon') this._billboards();
    // Lampalar rekvizitlərdən ƏVVƏL: mövqeləri sabit addımlıdır (işıqlandırma),
    // şin/bariyer isə onlardan yan keçir. Əvvəl lampalar ən sonda, yoxlamasız
    // qoyulurdu və dirək şin yığınının içindən çıxırdı.
    if (this.data.roadLamps) this._roadLamps();
    this._tracksideProps(); // şin qüllələri + bariyerlər — peşəkar trek görkəmi
    this._scatterDecor();
    this._trackside();      // tribuna, projektor, marşal, sponsor, bayraq
    // Landmarklar küçə divarından ƏVVƏL: yerlərini tuturlar, binalar onlardan yan keçir
    if (this.data.id === 'riviera') this._rivieraFields();
    if (this.data.id === 'neon') this._neonLandmarks();
    if (this.data.id === 'zavod') this._zavodLandmarks();
    if (this.data.id === 'desert') this._desertLandmarks();
    if (this.data.id === 'alpine') this._alpineLandmarks();
    if (this.data.id === 'neon') this._cityBlocks(); // küçə divarı — ən sonda, boş qalan yerə
    this._autoObstacles();   // təhlükəsizlik toru — bax aşağı
  }

  // RİVİERA — SAHİL QƏSƏBƏSİ (bədii bibliya): sahil hissəsinin quru tərəfində kiçik
  // təpə-qəsəbə. Üç halqa (aşağıdan yuxarı daralır), ağ evlər çölə baxır, zirvədə
  // zəng qülləsi. Yol onun ətrafından dolanır, ona görə HƏR TƏRƏFDƏN eyni oxunmalıdır
  // (ilk variant bir tərəfə baxan pillələr idi — arxadan çılpaq bej divar görünürdü).
  // Hamısı 4 materialda birləşir: divar, dam, pəncərə, teras.
  _rivieraTown() {
    const tr = this.track;
    const N = tr.N, half = tr.halfWidth;
    let minZ = Infinity;
    for (const q of tr.points) if (q.z < minZ) minZ = q.z;
    const R0 = 31; // ən böyük halqanın radiusu
    // Mərkəz üçün ən boş yer: sahil hissəsində, yoldan R0 + 12 m içəridə
    let best = null;
    for (let i = 0; i < N; i += 3) {
      const p = tr.points[i], n0 = tr.normals[i];
      if (p.z > minZ + 90) continue;
      const sd = n0.z >= 0 ? 1 : -1; // quru (şimal) tərəf
      const cx = p.x + n0.x * sd * (half + R0 + 12), cz = p.z + n0.z * sd * (half + R0 + 12);
      let ok = 0;
      for (let a = 0; a < 12; a++) {
        const x = cx + Math.cos(a * Math.PI / 6) * (R0 + 5), z = cz + Math.sin(a * Math.PI / 6) * (R0 + 5);
        const pos = new THREE.Vector3(x, 0, z);
        if (Math.abs(tr.getNearest(pos).lateral) > half + 6 && !(tr.branches?.length && tr.isOnBranch(pos, 6))
          && !this._inWater(x, z, 2)) ok++;
      }
      if (ok === 12 && this._free(cx, cz, R0 + 4, 0.5) && (!best || p.z < best.pz)) best = { cx, cz, pz: p.z };
    }
    if (!best) return;
    const { cx, cz } = best;

    const g = new THREE.Group();
    // Divar kölgədə boz-bənövşəyi çıxmasın deyə xəfif isti öz-işığı
    const wall = flatMat(0xfaf1e2, { roughness: 0.95, emissive: 0x5a4636, emissiveIntensity: 0.35 });
    const roof = flatMat(0xc65a32, { roughness: 0.9 });
    const terr = flatMat(0xdcc49a, { roughness: 1 });
    const win = glowMat(0xffd9a0, 1.1);
    const put = (geo, mat, x, y, z, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.castShadow = mat !== win;
      g.add(m);
      return m;
    };
    const RINGS = [{ r: R0 - 5, n: 13, y: 0 }, { r: 16.5, n: 8, y: 3.2 }, { r: 7.5, n: 4, y: 6.4 }];
    // Teraslar: səkkizbucaqlı alçaq silindrlər (təpənin pillələri)
    put(new THREE.CylinderGeometry(21.5, 23, 3.2, 10), terr, cx, 1.6, cz);
    put(new THREE.CylinderGeometry(12, 13.5, 3.2, 8), terr, cx, 4.8, cz);
    for (const ring of RINGS) {
      const a0 = Math.random() * 6;
      for (let k = 0; k < ring.n; k++) {
        const a = a0 + (k / ring.n) * Math.PI * 2;
        const ox = Math.sin(a), oz = Math.cos(a);             // çölə baxan istiqamət
        const x = cx + ox * ring.r, z = cz + oz * ring.r;
        const w = 5 + Math.random() * 1.6, d = 4.6 + Math.random() * 1.2, h = 4.2 + Math.random() * 3;
        put(new THREE.BoxGeometry(w, h, d), wall, x, ring.y + h / 2, z, a);
        const rf = put(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 1.7, 4), roof, x, ring.y + h + 0.85, z, a + Math.PI / 4);
        rf.scale.set(1, 1, 1);
        // çölə baxan üzdə iki işıqlı pəncərə
        for (const wx of [-w * 0.24, w * 0.24]) {
          put(new THREE.BoxGeometry(1.0, 1.4, 0.12), win,
            x + oz * wx + ox * (d / 2 + 0.03), ring.y + Math.min(h * 0.55, h - 1.3), z - ox * wx + oz * (d / 2 + 0.03), a);
        }
      }
    }
    // Zəng qülləsi — zirvədə (landmark)
    put(new THREE.BoxGeometry(3.4, 14, 3.4), wall, cx, 6.4 + 7, cz, 0.4);
    put(new THREE.BoxGeometry(3.5, 2.2, 1.5), win, cx, 6.4 + 11.6, cz, 0.4);
    put(new THREE.BoxGeometry(1.5, 2.2, 3.5), win, cx, 6.4 + 11.6, cz, 0.4);
    put(new THREE.ConeGeometry(3.1, 4.4, 4), roof, cx, 6.4 + 16.2, cz, 0.4 + Math.PI / 4);
    this.obstacles.push({ x: cx, z: cz, r: R0 });   // bütün təpə bərkdir

    const merged = mergeStaticGroup(g);
    g.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
    this.scene.add(merged);
    this._track(merged);
  }

  // RİVİERA — ÜZÜM BAĞLARI: yol kənarında paralel yaşıl cərgələr (orta plan boş qalmasın).
  // Hər cərgə relyefə oturur; bütün bağlar bir materialda birləşir.
  _rivieraFields() {
    const tr = this.track;
    const g = new THREE.Group();
    const mat = flatMat(0x5f8f45, { roughness: 1 });
    let made = 0;
    for (let tries = 0; tries < 120 && made < 11; tries++) {
      const i = Math.floor(Math.random() * tr.N);
      const c = tr.points[i], n = tr.normals[i], t = tr.tangents[i];
      const sd = Math.random() < 0.5 ? 1 : -1;
      const off = tr.halfWidth + 26 + Math.random() * 30;
      const cx = c.x + n.x * off * sd, cz = c.z + n.z * off * sd;
      if (Math.abs(tr.getNearest(new THREE.Vector3(cx, 0, cz)).lateral) < tr.halfWidth + 20) continue;
      if (tr.branches?.length && tr.isOnBranch(new THREE.Vector3(cx, 0, cz), 16)) continue;
      if (!this._free(cx, cz, 13, 1)) continue;
      const rows = 6 + Math.floor(Math.random() * 3), len = 16 + Math.random() * 8;
      const yaw = Math.atan2(t.x, t.z); // cərgələr yola paralel
      for (let r = 0; r < rows; r++) {
        const lat = (r - (rows - 1) / 2) * 2.5;
        const x = cx + n.x * lat, z = cz + n.z * lat;
        const row = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.25, len), mat);
        row.position.set(x, this._groundY(x, z) + 0.6, z);
        row.rotation.y = yaw;
        row.castShadow = true;
        g.add(row);
      }
      this.obstacles.push({ x: cx, z: cz, r: 11 });
      made++;
    }
    const merged = mergeStaticGroup(g);
    g.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
    this.scene.add(merged);
    this._track(merged);
  }

  // Yolun üstündən keçən qurğu üçün yerlər: ən düz hissələr, startdan və bir-birindən
  // uzaq; hər iki dayağın yeri boş və yolun başqa hissəsindən kənar olmalıdır.
  _overRoadSpots(count, reach) {
    const tr = this.track;
    const N = tr.N, half = tr.halfWidth;
    const span = Math.max(4, Math.round(N * 0.035));
    const turn = (i) => {
      const a = tr.tangents[(i - span + N) % N], b = tr.tangents[(i + span) % N];
      return Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z)));
    };
    const startI = tr.getNearest(tr.getGridSlots(1)[0].position).index;
    const cands = [];
    for (let i = 0; i < N; i += 2) {
      if (Math.min((i - startI + N) % N, (startI - i + N) % N) > N * 0.07) cands.push({ i, k: turn(i) });
    }
    cands.sort((p, q) => p.k - q.k);
    const out = [];
    for (const c of cands) {
      if (out.length >= count) break;
      if (out.some((o) => Math.min((c.i - o.i + N) % N, (o.i - c.i + N) % N) < N / (count + 1.5))) continue;
      const p = tr.points[c.i], n = tr.normals[c.i], t = tr.tangents[c.i];
      const legs = [1, -1].map((sd) => ({ x: p.x + n.x * reach * sd, z: p.z + n.z * reach * sd }));
      if (!legs.every((l) => this._free(l.x, l.z, 1.6, 0.6)
        && Math.abs(tr.getNearest(new THREE.Vector3(l.x, 0, l.z)).lateral) > half + 3)) continue;
      out.push({ i: c.i, p, n, t, legs });
    }
    return out;
  }

  // ZAVOD — LANDMARKLAR (bədii bibliya): yolun üstündən keçən boru estakadaları və
  // portal kran; yol kənarında əritmə sexi (narıncı parıltı). Dövrədə oriyentir.
  _zavodLandmarks() {
    const half = this.track.halfWidth;
    const g = new THREE.Group();
    const steel = flatMat(0x565c66, { roughness: 0.8 });
    const rust = flatMat(0x9a5f3c, { roughness: 0.9 });
    const yellow = flatMat(0xe0b020, { roughness: 0.7 });
    const dark = flatMat(0x2a2d34, { roughness: 0.9 });
    const add = (geo, mat, x, y, z, yaw = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.y = yaw;
      g.add(m);
      return m;
    };
    const reach = half + 6.5;
    const spots = this._overRoadSpots(4, reach);
    spots.forEach((s, k) => {
      const { p, n, t, legs } = s;
      const yaw = Math.atan2(n.x, n.z); // uzun ox (z) yolun eninə
      const len = reach * 2 + 3;
      if (k === 0) {
        // PORTAL KRAN: sarı çərçivə, üst tir, asılı konteyner
        const H = 13.5;
        for (const l of legs) {
          add(new THREE.BoxGeometry(1.5, H, 2.2), yellow, l.x, H / 2, l.z, yaw);
          add(new THREE.BoxGeometry(2.6, 0.9, 5.2), dark, l.x, 0.45, l.z, yaw); // təkər arabası
          this.obstacles.push({ x: l.x, z: l.z, r: 1.6 });
        }
        add(new THREE.BoxGeometry(2.6, 1.6, len + 2), yellow, p.x, H + 0.8, p.z, yaw);
        // araba + tros + konteyner: dibi 7.4 m-dədir — maşın və arxa kamera (≈ 6 m) altından keçir
        const cx = p.x + n.x * half * 0.6, cz = p.z + n.z * half * 0.6;
        add(new THREE.BoxGeometry(3.2, 1.0, 3.0), dark, cx, H - 0.5, cz, yaw);
        add(new THREE.BoxGeometry(0.16, 2.6, 0.16), dark, cx, H - 2.3, cz, yaw);
        add(new THREE.BoxGeometry(2.4, 2.5, 5.6), rust, cx, H - 4.85, cz, yaw + Math.PI / 2);
        // xəbərdarlıq işıqları
        for (const l of legs) add(new THREE.BoxGeometry(0.6, 0.6, 0.6), glowMat(0xff8a1e, 1.6), l.x, H + 1.9, l.z, yaw);
      } else {
        // BORU ESTAKADASI: şəbəkə dayaqlar + 3 paralel boru (müxtəlif rəng/diametr)
        const H = 8.6;
        for (const l of legs) {
          add(new THREE.BoxGeometry(0.5, H, 0.5), steel, l.x + t.x * 1.4, H / 2, l.z + t.z * 1.4, yaw);
          add(new THREE.BoxGeometry(0.5, H, 0.5), steel, l.x - t.x * 1.4, H / 2, l.z - t.z * 1.4, yaw);
          add(new THREE.BoxGeometry(3.4, 0.4, 0.5), steel, l.x, H * 0.5, l.z, yaw + Math.PI / 2);
          this.obstacles.push({ x: l.x, z: l.z, r: 1.6 });
        }
        add(new THREE.BoxGeometry(3.6, 0.45, len), steel, p.x, H, p.z, yaw); // daşıyıcı tir
        const pipes = [[-1.1, 0.5, rust], [0.1, 0.36, yellow], [1.05, 0.44, steel]];
        for (const [off, r, mat] of pipes) {
          const pm = add(new THREE.CylinderGeometry(r, r, len + 5, 8), mat, p.x + t.x * off, H + 0.25 + r, p.z + t.z * off, yaw);
          pm.rotation.order = 'YXZ'; // əvvəl yatır (x), sonra yolun eninə dönür (y)
          pm.rotation.x = Math.PI / 2;
        }
      }
    });
    const merged = mergeStaticGroup(g);
    merged.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    g.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
    this.scene.add(merged);
    this._track(merged);

    // ƏRİTMƏ SEXİ: yolun yanında iri sex — açıq qapılardan narıncı parıltı, hündür baca
    const tr = this.track, N = tr.N;
    const used = spots.map((s) => s.i);
    for (let tries = 0; tries < 60; tries++) {
      const i = Math.floor(Math.random() * N);
      if (used.some((u) => Math.min((i - u + N) % N, (u - i + N) % N) < N * 0.06)) continue;
      const c = tr.points[i], n = tr.normals[i], t = tr.tangents[i];
      const sd = Math.random() < 0.5 ? 1 : -1;
      const off = half + 24;
      const x = c.x + n.x * off * sd, z = c.z + n.z * off * sd;
      if (Math.abs(tr.getNearest(new THREE.Vector3(x, 0, z)).lateral) < half + 20) continue;
      if (!this._free(x, z, 17, 1)) continue;
      const sg = new THREE.Group();
      const yaw = Math.atan2(-n.x * sd, -n.z * sd); // ön üz (+z) yola baxır
      const W = 30, D = 16, Hh = 11;
      const put = (geo, mat, lx, y, lz) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(lx, y, lz);
        sg.add(m);
        return m;
      };
      put(new THREE.BoxGeometry(W, Hh, D), flatMat(0x4a4f58, { roughness: 0.9 }), 0, Hh / 2, 0);
      put(new THREE.BoxGeometry(W * 0.5, 4, D * 0.8), dark, 0, Hh + 2, 0);            // üst fənər qat
      for (const lx of [-9.5, 0, 9.5]) {                                               // ərimiş metalın parıltısı
        put(new THREE.BoxGeometry(5, 5.2, 0.2), glowMat(0xff6a1a, 1.5), lx, 2.7, D / 2 + 0.06);
        put(new THREE.BoxGeometry(5.6, 0.5, 0.3), yellow, lx, 5.6, D / 2 + 0.1);
      }
      put(new THREE.BoxGeometry(W * 0.44, 0.7, 0.2), glowMat(0xff6a1a, 1.5), 0, Hh + 2.6, D * 0.4 + 0.06);
      const stack = put(new THREE.CylinderGeometry(1.5, 2.3, 30, 9), flatMat(0x7a4636, { roughness: 0.9 }), W / 2 - 4, 15, -D / 2 + 3);
      void stack;
      put(new THREE.CylinderGeometry(1.62, 1.62, 1.6, 9), flatMat(0xd8d4c8), W / 2 - 4, 27.5, -D / 2 + 3);
      sg.position.set(x, 0, z);
      sg.rotation.y = yaw;
      const sm = mergeStaticGroup(sg);
      sg.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
      this.scene.add(sm);
      this._track(sm);
      // toqquşma: uzun binanı üç dairə örtür
      for (const lx of [-10, 0, 10]) this.obstacles.push({ x: x + t.x * lx, z: z + t.z * lx, r: 9 });
      break;
    }
  }

  // SƏHRA — LANDMARKLAR (bədii bibliya): yolun üstündə təbii qaya tağı və yol kənarında
  // tərk edilmiş yanacaqdoldurma məntəqəsi.
  _desertLandmarks() {
    const tr = this.track, half = tr.halfWidth, N = tr.N;
    const rockA = flatMat(0xc8703c, { roughness: 1 }), rockB = flatMat(0xb5612f, { roughness: 1 });
    // ——— QAYA TAĞI ———
    const reach = half + 8;
    const spots = this._overRoadSpots(1, reach);
    const g = new THREE.Group();
    for (const s of spots) {
      const { p, n, legs } = s;
      const yaw = Math.atan2(n.x, n.z);
      const chunk = (w, h, d, mat, x, y, z, tilt = 0) => {
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), mat);
        m.scale.set(w / 2, h / 2, d / 2);
        m.position.set(x, y, z);
        // w (yerli x) yolun ENİNƏ baxır: yaw yerli z-ni normala düzür, ona görə +90°.
        // İlk variantda bu yox idi — enli ox yol boyu düşür, parçalar bir-birinə çatmır,
        // tağ havada asılı ayrı daşlar kimi görünürdü.
        m.rotation.set(tilt * 0.5, yaw + Math.PI / 2 + tilt * 0.4, tilt * 0.3);
        g.add(m);
      };
      for (const [k, l] of legs.entries()) {
        const sg = k ? -1 : 1; // +1: normal tərəfdəki dayaq; içəri = yola doğru
        // dayaq: üst-üstə oturan üç iri parça, yuxarı getdikcə yola doğru əyilir
        chunk(9, 7, 8.5, rockA, l.x + n.x * 1.2 * sg, 2.8, l.z + n.z * 1.2 * sg, 0.12);
        chunk(8, 6.5, 7.5, rockB, l.x, 7.2, l.z, -0.16);
        chunk(8.5, 5.5, 7, rockA, l.x - n.x * 2.2 * sg, 11, l.z - n.z * 2.2 * sg, 0.2);
        this.obstacles.push({ x: l.x, z: l.z, r: 3.4 });
      }
      // üst tağ: dayaqları birləşdirən üç üst-üstə düşən parça (dibi ≈ 9.5 m —
      // maşın və arxa kamera altından keçir)
      for (const f of [-0.5, 0, 0.5]) {
        chunk(reach * 1.25, 5 - Math.abs(f) * 1.4, 8, f === 0 ? rockB : rockA,
          p.x + n.x * reach * f, 12.6 + (f === 0 ? 0.8 : 0), p.z + n.z * reach * f, f * 0.2);
      }
    }
    const merged = mergeStaticGroup(g);
    g.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
    this.scene.add(merged);
    this._track(merged);

    // ——— TƏRK EDİLMİŞ YANACAQDOLDURMA MƏNTƏQƏSİ ———
    const used = spots.map((s) => s.i);
    for (let tries = 0; tries < 80; tries++) {
      const i = Math.floor(Math.random() * N);
      if (used.some((u) => Math.min((i - u + N) % N, (u - i + N) % N) < N * 0.08)) continue;
      const c = tr.points[i], n = tr.normals[i], t = tr.tangents[i];
      const sd = Math.random() < 0.5 ? 1 : -1;
      const off = half + 17;
      const x = c.x + n.x * off * sd, z = c.z + n.z * off * sd;
      if (Math.abs(tr.getNearest(new THREE.Vector3(x, 0, z)).lateral) < half + 14) continue;
      if (!this._free(x, z, 11, 1)) continue;
      const sg = new THREE.Group();
      const put = (geo, mat, lx, y, lz) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(lx, y, lz);
        m.castShadow = true;
        sg.add(m);
        return m;
      };
      const cream = flatMat(0xe6d6b4, { roughness: 1 }), rustM = flatMat(0xa5532e, { roughness: 1 });
      const faded = flatMat(0xb9483a, { roughness: 1 }), darkM = flatMat(0x3a3530, { roughness: 1 });
      // dükan (arxada), talvar (qabaqda, yola yaxın), iki kolonka, hündür lövhə
      put(new THREE.BoxGeometry(8, 3.6, 5), cream, 0, 1.8, -5.5);
      put(new THREE.BoxGeometry(8.6, 0.4, 5.6), rustM, 0, 3.8, -5.5);
      put(new THREE.BoxGeometry(2.6, 1.5, 0.12), darkM, -1.6, 2.0, -2.96);
      put(new THREE.BoxGeometry(1.2, 2.4, 0.12), darkM, 2.2, 1.2, -2.96);
      put(new THREE.BoxGeometry(11, 0.5, 6.5), faded, 0, 5.0, 2.2);
      put(new THREE.BoxGeometry(11.3, 0.25, 6.8), cream, 0, 5.35, 2.2);
      for (const px of [-4.6, 4.6]) put(new THREE.BoxGeometry(0.35, 5, 0.35), darkM, px, 2.5, 2.2);
      for (const px of [-1.7, 1.7]) {
        put(new THREE.BoxGeometry(0.9, 1.7, 0.6), faded, px, 0.85, 2.2);
        put(new THREE.BoxGeometry(0.7, 0.5, 0.62), cream, px, 1.35, 2.2);
      }
      put(new THREE.BoxGeometry(0.3, 9, 0.3), darkM, 7.2, 4.5, 4.4);
      put(new THREE.CylinderGeometry(1.5, 1.5, 0.3, 12), faded, 7.2, 9.6, 4.4).rotation.x = Math.PI / 2;
      put(new THREE.CylinderGeometry(0.9, 0.9, 0.34, 12), cream, 7.2, 9.6, 4.4).rotation.x = Math.PI / 2;
      sg.position.set(x, this._groundY(x, z) + 0.04, z);
      sg.rotation.y = Math.atan2(-n.x * sd, -n.z * sd); // talvar yola baxır
      const sm = mergeStaticGroup(sg);
      sg.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
      this.scene.add(sm);
      this._track(sm);
      for (const lx of [-4, 4]) this.obstacles.push({ x: x + t.x * lx, z: z + t.z * lx, r: 5.5 });
      break;
    }
  }

  // ALP — LANDMARKLAR və MEŞƏ (bədii bibliya): yolun üstündə taxta piyada körpüsü, göl
  // kənarında kilsə, sıx şam massivləri ("meşə" hissi) və çəməndə çiçək ləkələri.
  _alpineLandmarks() {
    const tr = this.track, half = tr.halfWidth, N = tr.N;
    const wood = flatMat(0x8a5a36, { roughness: 1 }), woodD = flatMat(0x6a4226, { roughness: 1 });
    // ——— TAXTA PİYADA KÖRPÜSÜ ———
    const reach = half + 6.5;
    const g = new THREE.Group();
    const used = [];
    for (const s of this._overRoadSpots(1, reach)) {
      used.push(s.i);
      const { p, n, t, legs } = s;
      const yaw = Math.atan2(n.x, n.z);
      const add = (geo, mat, x, y, z, ry = yaw) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.rotation.y = ry;
        m.castShadow = true;
        g.add(m);
        return m;
      };
      const H = 8.4, len = reach * 2 + 4;
      add(new THREE.BoxGeometry(3.4, 0.4, len), wood, p.x, H, p.z);                       // göyərtə
      for (const sd of [1, -1]) {
        add(new THREE.BoxGeometry(0.18, 0.18, len), woodD, p.x + t.x * 1.6 * sd, H + 1.25, p.z + t.z * 1.6 * sd); // tutacaq
        for (let k = -3; k <= 3; k++) {
          add(new THREE.BoxGeometry(0.16, 1.2, 0.16), woodD,
            p.x + t.x * 1.6 * sd + n.x * (len / 7) * k, H + 0.7, p.z + t.z * 1.6 * sd + n.z * (len / 7) * k);
        }
      }
      for (const l of legs) {
        // çarpaz dayaqlı qüllə + damcıq
        for (const sd of [1, -1]) add(new THREE.BoxGeometry(0.5, H, 0.5), woodD, l.x + t.x * 1.3 * sd, H / 2, l.z + t.z * 1.3 * sd);
        add(new THREE.BoxGeometry(3.2, 0.3, 0.4), woodD, l.x, H * 0.45, l.z, yaw + Math.PI / 2);
        add(new THREE.ConeGeometry(3, 1.8, 4), flatMat(0x7a3b2a, { roughness: 1 }), l.x, H + 3.3, l.z, yaw + Math.PI / 4);
        for (const sd of [1, -1]) add(new THREE.BoxGeometry(0.3, 2.4, 0.3), woodD, l.x + t.x * 1.3 * sd, H + 1.3, l.z + t.z * 1.3 * sd);
        this.obstacles.push({ x: l.x, z: l.z, r: 1.6 });
      }
    }

    // ——— KİLSƏ: göl kənarında (yoxdursa yol kənarında) ———
    const lake = this.keepOut.find((o) => o.r > 18);
    let spot = null;
    for (let tries = 0; tries < 90 && !spot; tries++) {
      let x, z;
      if (lake && tries < 50) {
        const a = Math.random() * Math.PI * 2;
        x = lake.x + Math.cos(a) * (lake.r + 9); z = lake.z + Math.sin(a) * (lake.r + 9);
      } else {
        const i = Math.floor(Math.random() * N), sd = Math.random() < 0.5 ? 1 : -1;
        x = tr.points[i].x + tr.normals[i].x * (half + 20) * sd; z = tr.points[i].z + tr.normals[i].z * (half + 20) * sd;
      }
      if (Math.abs(tr.getNearest(new THREE.Vector3(x, 0, z)).lateral) < half + 13) continue;
      if (!this._free(x, z, 8, 1)) continue;
      spot = { x, z };
    }
    if (spot) {
      const near = tr.getNearest(new THREE.Vector3(spot.x, 0, spot.z));
      const c = tr.points[near.index];
      const yaw = Math.atan2(c.x - spot.x, c.z - spot.z); // qapı yola baxır
      const cg = new THREE.Group();
      const put = (geo, mat, x, y, z, ry = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.rotation.y = ry;
        m.castShadow = true;
        cg.add(m);
        return m;
      };
      const white = flatMat(0xf4efe4, { roughness: 1 }), roofM = flatMat(0x5a3a30, { roughness: 1 });
      put(new THREE.BoxGeometry(6, 5, 10), white, 0, 2.5, 0);                       // nef
      const rf = put(new THREE.CylinderGeometry(4.6, 4.6, 10.6, 3), roofM, 0, 6.15, 0); // ikiyamaclı dam
      rf.rotation.set(Math.PI / 2, 0, 0); rf.scale.set(1, 1, 0.62);
      put(new THREE.BoxGeometry(3.2, 11, 3.2), white, 0, 5.5, 6);                   // qüllə
      put(new THREE.ConeGeometry(2.7, 6.5, 4), roofM, 0, 14.2, 6, Math.PI / 4);     // şiş dam
      put(new THREE.BoxGeometry(1.3, 2.4, 0.14), woodD, 0, 1.2, 7.62);              // qapı
      put(new THREE.BoxGeometry(0.9, 1.4, 0.14), glowMat(0xffd9a0, 1.1), 0, 8.4, 7.62); // zəng pəncərəsi
      for (const zz of [-3, 0, 3]) for (const sx of [-1, 1]) put(new THREE.BoxGeometry(0.14, 1.6, 0.9), glowMat(0xffd9a0, 1.1), sx * 3.02, 3.0, zz);
      cg.position.set(spot.x, this._groundY(spot.x, spot.z) + 0.04, spot.z);
      cg.rotation.y = yaw;
      const cm = mergeStaticGroup(cg);
      cg.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
      this.scene.add(cm);
      this._track(cm);
      this.obstacles.push({ x: spot.x, z: spot.z, r: 7.5 });
    }

    // ——— MEŞƏ MASSİVLƏRİ: sıx şam dəstələri (hər biri bir toqquşma dairəsi) ———
    const greens = [flatMat(0x2f7d43, { roughness: 1 }), flatMat(0x276a3a, { roughness: 1 }), flatMat(0x3a8a4c, { roughness: 1 })];
    const trunkM = flatMat(0x6b4b2a, { roughness: 1 });
    let clumps = 0;
    for (let tries = 0; tries < 160 && clumps < 10; tries++) {
      const i = Math.floor(Math.random() * N), sd = Math.random() < 0.5 ? 1 : -1;
      const R = 11 + Math.random() * 8;
      const off = half + R + 9 + Math.random() * 34;
      const cx = tr.points[i].x + tr.normals[i].x * off * sd, cz = tr.points[i].z + tr.normals[i].z * off * sd;
      if (Math.abs(tr.getNearest(new THREE.Vector3(cx, 0, cz)).lateral) < half + R + 6) continue;
      if (!this._free(cx, cz, R, 1)) continue;
      const count = Math.round(R * 1.35); // sıxlıq üçbucaq büdcəsinə görə (alp 90 minə yaxındır)
      for (let k = 0; k < count; k++) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * R;
        const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        const h = 5.5 + Math.random() * 5.5, y0 = this._groundY(x, z);
        const tk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, h * 0.3, 4), trunkM);
        tk.position.set(x, y0 + h * 0.15, z);
        g.add(tk);
        const gm = greens[Math.floor(Math.random() * 3)];
        for (let c = 0; c < 2; c++) { // iki pilləli çətir (səpələnən şamdan ucuz: 20 üçbucaq)
          const cone = new THREE.Mesh(new THREE.ConeGeometry((1.9 - c * 0.6) * (h / 7), h * 0.5, 5), gm);
          cone.position.set(x, y0 + h * (0.42 + c * 0.3), z);
          cone.castShadow = true;
          g.add(cone);
        }
      }
      this.obstacles.push({ x: cx, z: cz, r: R * 0.9 });
      clumps++;
    }

    // ——— ÇİÇƏK LƏKƏLƏRİ: yol kənarı çəməndə (toqquşmasız, 4 üçbucaqlı tetraedr) ———
    const petals = [flatMat(0xffe066), flatMat(0xffffff), flatMat(0xff8fb3), flatMat(0xc59bff)];
    for (let patch = 0; patch < 46; patch++) {
      const i = Math.floor(Math.random() * N), sd = Math.random() < 0.5 ? 1 : -1;
      const off = half + 4 + Math.random() * 24;
      const px = tr.points[i].x + tr.normals[i].x * off * sd, pz = tr.points[i].z + tr.normals[i].z * off * sd;
      if (Math.abs(tr.getNearest(new THREE.Vector3(px, 0, pz)).lateral) < half + 3 || this._inWater(px, pz, 3) || this._onBranch(px, pz, 3)) continue;
      const mat = petals[patch % petals.length];
      for (let k = 0; k < 9; k++) {
        const x = px + (Math.random() - 0.5) * 6, z = pz + (Math.random() - 0.5) * 6;
        const f = new THREE.Mesh(new THREE.TetrahedronGeometry(0.2 + Math.random() * 0.12, 0), mat);
        f.position.set(x, this._groundY(x, z) + 0.22, z);
        f.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        g.add(f);
      }
    }
    const merged = mergeStaticGroup(g);
    g.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
    this.scene.add(merged);
    this._track(merged);
  }

  // NEON — LANDMARKLAR (bədii bibliya): yolun üstündən keçən işıqlı estakadalar və
  // ən uzun düzün sonunda sürücüyə baxan nəhəng ekran. Dövrədə "harada olduğunu"
  // tanıdan nöqtələr — əvvəl trekin hər yeri eyni görünürdü.
  _neonLandmarks() {
    const tr = this.track;
    const N = tr.N, half = tr.halfWidth;
    // Yolun düzlüyü: i nöqtəsindən əvvəlki `back` nöqtə boyunca istiqamət nə qədər dəyişir
    const turn = (i, span) => {
      const a = tr.tangents[(i - span + N) % N], b = tr.tangents[i % N];
      return Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z)));
    };
    const span = Math.max(4, Math.round(N * 0.035));
    const startI = tr.getNearest(tr.getGridSlots(1)[0].position).index;
    const farFromStart = (i) => Math.min((i - startI + N) % N, (startI - i + N) % N) > N * 0.08;

    // ——— ESTAKADA: 2 ədəd, ən düz yerlərdə, bir-birindən uzaq ———
    const g = new THREE.Group();
    const dark = flatMat(0x161c3a, { roughness: 0.8 });
    const picked = [];
    const cands = [];
    for (let i = 0; i < N; i += 2) if (farFromStart(i)) cands.push({ i, k: turn(i, span) + turn(i + span, span) });
    cands.sort((p, q) => p.k - q.k);
    for (const c of cands) {
      if (picked.length >= 2) break;
      if (picked.some((j) => Math.min((c.i - j + N) % N, (j - c.i + N) % N) < N * 0.3)) continue;
      const p = tr.points[c.i], n = tr.normals[c.i], t = tr.tangents[c.i];
      const reach = half + 6.5;
      const legs = [1, -1].map((sd) => ({ x: p.x + n.x * reach * sd, z: p.z + n.z * reach * sd }));
      // Dayaqlar boş yerdə və yolun başqa hissəsindən uzaq olmalıdır
      if (!legs.every((l) => this._free(l.x, l.z, 1.6, 0.6)
        && Math.abs(tr.getNearest(new THREE.Vector3(l.x, 0, l.z)).lateral) > half + 3)) continue;
      picked.push(c.i);
      const yaw = Math.atan2(n.x, n.z); // qutunun uzun oxu (z) yolun eninə
      const add = (geo, mat, x, y, z) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.rotation.y = yaw;
        g.add(m);
        return m;
      };
      const H = 9.5, len = reach * 2 + 3.5, wid = 7; // dayaqlardan azca kənara — binaya girməsin
      const neon = picked.length === 1 ? 0x34e0ff : 0xff3d8a;
      add(new THREE.BoxGeometry(wid, 1.1, len), dark, p.x, H, p.z);                       // göyərtə
      for (const sd of [1, -1]) {
        // kənar neon xətləri (gələn və gedən tərəf) + altda işıq zolağı
        add(new THREE.BoxGeometry(0.25, 0.45, len), glowMat(neon, 1.1), p.x + t.x * (wid / 2) * sd, H + 0.1, p.z + t.z * (wid / 2) * sd);
        add(new THREE.BoxGeometry(0.2, 1.0, len), dark, p.x + t.x * (wid / 2 - 0.2) * sd, H + 1.0, p.z + t.z * (wid / 2 - 0.2) * sd); // məhəccər
        const l = legs[sd > 0 ? 0 : 1];
        add(new THREE.BoxGeometry(1.6, H, 2.6), dark, l.x, H / 2, l.z);                  // dayaq
        add(new THREE.BoxGeometry(1.75, 0.35, 2.75), glowMat(neon, 1.1), l.x, 2.2, l.z);       // dayaqda işıq halqası
        this.obstacles.push({ x: l.x, z: l.z, r: 1.6 });
      }
      add(new THREE.BoxGeometry(0.5, 0.18, half * 2), glowMat(0xffd257, 1.1), p.x, H - 0.62, p.z); // alt işıq
    }
    const merged = mergeStaticGroup(g);
    merged.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    g.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
    this.scene.add(merged);
    this._track(merged);

    // ——— NƏHƏNG EKRAN: ən uzun düzün sonunda, düz boyu gələn sürücüyə baxır ———
    let best = null;
    for (let i = 0; i < N; i += 2) {
      if (!farFromStart(i)) continue;
      // arxada düz, qabaqda döngə: düzün sonu
      const k = turn(i + span * 2, span * 2) - turn(i, span * 3) * 2;
      if (!best || k > best.k) best = { i, k };
    }
    if (!best) return;
    const p = tr.points[best.i], t = tr.tangents[best.i];
    const W = 30, Hs = 13, lift = 9;
    let pos = null;
    for (const d of [60, 72, 50, 85]) {
      const c = new THREE.Vector3(p.x + t.x * d, 0, p.z + t.z * d);
      if (Math.abs(tr.getNearest(c).lateral) < half + 12) continue;
      if (!this._free(c.x, c.z, 10, 0.5)) continue;
      pos = c; break;
    }
    if (!pos) return;
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 224;
    const ctx = cv.getContext('2d');
    const grd = ctx.createLinearGradient(0, 0, 512, 224);
    grd.addColorStop(0, '#2a0b52'); grd.addColorStop(0.5, '#0b1b4a'); grd.addColorStop(1, '#3a0a3c');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 512, 224);
    // günəş + üfüq zolaqları (retro)
    const sun = ctx.createLinearGradient(0, 30, 0, 170);
    sun.addColorStop(0, '#ffd257'); sun.addColorStop(1, '#ff3d8a');
    ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(256, 118, 78, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b1b4a';
    for (let y = 118; y < 200; y += 14) ctx.fillRect(160, y, 192, 5);
    ctx.font = '900 64px Rajdhani, Arial Black, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = '#0a0d1c'; ctx.strokeText('NITROVERSE', 256, 120);
    ctx.fillStyle = '#ffffff'; ctx.fillText('NITROVERSE', 256, 120);
    ctx.strokeStyle = '#34e0ff'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 504, 216);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const yaw = Math.atan2(-t.x, -t.z); // +z üzü gələn sürücüyə baxır
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(W, Hs, 0.8),
      new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.95, roughness: 0.6 })
    );
    screen.position.set(pos.x, lift + Hs / 2, pos.z);
    screen.rotation.y = yaw;
    this.scene.add(screen);
    this._track(screen);
    const fr = new THREE.Group();
    const rx = Math.cos(yaw), rz = -Math.sin(yaw); // ekranın sağ oxu
    for (const sd of [1, -1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.4, lift + Hs, 1.4), dark);
      leg.position.set(pos.x + rx * (W / 2 - 2) * sd - t.x * -1.1, (lift + Hs) / 2, pos.z + rz * (W / 2 - 2) * sd - t.z * -1.1);
      fr.add(leg);
      this.obstacles.push({ x: leg.position.x, z: leg.position.z, r: 1.4 });
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, Hs + 0.8, 0.5), dark);
    back.position.set(pos.x + t.x * 0.55, lift + Hs / 2, pos.z + t.z * 0.55);
    back.rotation.y = yaw;
    fr.add(back);
    const mergedFr = mergeStaticGroup(fr);
    mergedFr.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    fr.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
    this.scene.add(mergedFr);
    this._track(mergedFr);
    // Ekranın önü (meydan) boş qalsın — binalar görüntünü tutmasın
    // (toqquşma siyahısına YAZILMIR: görünməz divar olmasın; yalnız _cityBlocks baxır)
    this._clearZones = [0, 14, 28].map((d) => ({ x: pos.x - t.x * d, z: pos.z - t.z * d, r: 10 }));
  }

  // NEON — KÜÇƏ DİVARI: yolun hər iki tərəfində bitişik bina cərgələri (ön cərgə
  // alçaq, vitrinli; arxa cərgə hündür). Əvvəl 70 bina bütün xəritəyə səpilmişdi:
  // yuxarıdan baxanda boş qaranlıq düzdə tək-tək qüllələr idi, yol "şəhərin içindən"
  // keçmirdi (istifadəçi rəyi: "ətraf boşdur, binalar arası boşluqlar qəribədir").
  // Hamısı iki paylaşılan materialdadır → birləşəndən sonra 1–5 draw call.
  _cityBlocks() {
    const g = new THREE.Group();
    const tr = this.track;
    const N = tr.N, half = tr.halfWidth;
    const rows = [
      { off: half + 17, low: true, gap: 1.5 },
      { off: half + 31, low: false, gap: 3 },
    ];
    const box = new THREE.Box3(), size = new THREE.Vector3(), pos = new THREE.Vector3();
    for (const row of rows) {
      for (const side of [1, -1]) {
        let acc = 1e9; // son binadan bəri yol boyu məsafə
        let need = 0;
        for (let i = 0; i < N; i++) {
          const p = tr.points[i], q = tr.points[(i + 1) % N];
          acc += Math.hypot(q.x - p.x, q.z - p.z);
          if (acc < need) continue;
          const n = tr.normals[i];
          pos.set(p.x + n.x * row.off * side, 0, p.z + n.z * row.off * side);
          const obj = makeCityBuilding(row.low ? { low: true } : { hMin: 18, hMax: 42 });
          box.setFromObject(obj); box.getSize(size);
          const r = Math.max(size.x, size.z) * 0.5;
          // Döngənin içində cərgə yolun o biri hissəsinə düşə bilər — real məsafəni yoxla
          if (Math.abs(tr.getNearest(pos).lateral) < half + r + 5) continue;
          if (tr.branches?.length && tr.isOnBranch(pos, r + 4)) continue;
          if (!this._free(pos.x, pos.z, r * 0.85, 0.4)) continue;
          if ((this._clearZones || []).some((c) => Math.hypot(c.x - pos.x, c.z - pos.z) < c.r + r)) continue;
          obj.position.copy(pos);
          // Vitrin (+z üzü) yola baxsın
          obj.rotation.y = Math.atan2(-n.x * side, -n.z * side);
          obj.traverse((o) => { if (o.isMesh) o.castShadow = false; }); // gecə, yoldan uzaq
          g.add(obj);
          this.obstacles.push({ x: pos.x, z: pos.z, r: r * 0.85 });
          acc = 0;
          need = size.x + row.gap + Math.random() * 2;
        }
      }
    }
    const merged = mergeStaticGroup(g);
    g.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
    this.scene.add(merged);
    this._track(merged);
  }

  // Yol boyunca küçə lampaları (növbəli tərəflərdə)
  _roadLamps() {
    const g = new THREE.Group();
    const N = this.track.N;
    const step = Math.max(10, Math.floor(N / 30));
    const off = this.track.halfWidth + 3.4;
    // Trekə uyğun lampa rəngləri (default: neon cütlüyü)
    const colors = this.data.palette.lampColors ?? [0x34e0ff, 0xff3d8a];
    let side = 1;
    let ci = 0;
    for (let i = 0; i < N; i += step) {
      const p = this.track.points[i];
      const n = this.track.normals[i];
      // Performans: hər 3-cü lampada real işıq, qalanı emissive parıltı
      const lamp = makeLamp(colors[ci % colors.length], ci % 3 === 0);
      let lx = p.x + n.x * off * side, lz = p.z + n.z * off * side;
      // Suya düşürsə yol boyu bir az irəli/geri sürüşdür (körpü yanı)
      for (const d of [6, -6, 12, -12]) {
        if (!this._inWater(lx, lz, 1)) break;
        const q = this.track.points[(i + d + N) % N], m = this.track.normals[(i + d + N) % N];
        lx = q.x + m.x * off * side; lz = q.z + m.z * off * side;
      }
      if (this._inWater(lx, lz, 1) || this._onBranch(lx, lz, 0.6)) { side *= -1; ci++; continue; }
      lamp.position.set(lx, 0, lz);
      g.add(lamp);
      this.obstacles.push({ x: lx, z: lz, r: 0.55 });   // dirək bərkdir
      side *= -1;
      ci++;
    }
    // Dirək və başlıqlar birləşdirilir (işıqlar toxunulmaz qalır): 30 lampa
    // 60 draw call idi, indi rəng başına 1 + dirəklər üçün 1. Başlıq materialı
    // paylaşılan nüsxədir — setLampGlow əvvəlki kimi işləyir.
    const merged = mergeStaticGroup(g);
    merged.traverse((o) => { if (o.isMesh) o.castShadow = false; }); // əvvəl də kölgə salmırdı
    g.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
    this.scene.add(merged);
    this._track(merged);
  }

  // Uzaq relyef — dağlar / şəhər silueti
  _distant() {
    const g = new THREE.Group();
    const id = this.data.id;
    const base = this.track.maxRadius + 90; // trekdən kənarda
    if (id === 'neon') {
      // 70 idi — üfüqdə binalar arası boşluqlar qalırdı (istifadəçi rəyi)
      for (let i = 0; i < 120; i++) {
        const a = (i / 120) * Math.PI * 2 + Math.random() * 0.06;
        const r = base + Math.random() * 150;
        const h = 30 + Math.random() * 110;
        const w = 12 + Math.random() * 22;
        const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
        if (!this._free(bx, bz, w * 0.72)) continue;
        // Uzaq şəhər də pəncərəlidir (tutqun) — əvvəl qapqara siluet idi
        const b = new THREE.Mesh(cityBoxGeometry(w, h, w, true), cityMat(true));
        b.position.set(bx, h / 2 - 8, bz);
        g.add(b);
        this.obstacles.push({ x: b.position.x, z: b.position.z, r: w * 0.72 });
        // bəzi binalarda şaquli neon xətt. Əvvəl enli lövhə idi (0.8w × 0.5h) — bloomla
        // ağ ləkəyə çevrilirdi və pəncərələri örtürdü; material rəng başına paylaşılır.
        if (Math.random() < 0.5) {
          const neon = [0x34e0ff, 0xff3d8a, 0xffd257][Math.floor(Math.random() * 3)];
          const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.08, h * 0.7, 0.4), glowMat(neon));
          strip.position.set(Math.cos(a) * r, h / 2 - 8, Math.sin(a) * r + w / 2);
          g.add(strip);
        }
      }
    } else if (id === 'alpine') {
      // ALP: tək-tək eyni konuslar yox — KƏLƏ-KÖTÜR SİLSİLƏ. Hər massiv 2–4 iti zirvədən
      // ibarətdir (müxtəlif hündürlük, 4–5 üzlü), qar xətti sabit hündürlükdədir; ön planda
      // tünd meşəli dağətəyi zolağı dərinlik verir (bədii bibliya).
      const fogC = new THREE.Color(this.data.palette.fog);
      const tiers = [0.2, 0.44, 0.64].map((k) => ({
        rock: flatMat(new THREE.Color(0x56697a).lerp(fogC, k).getHex(), { roughness: 1 }),
        snow: flatMat(new THREE.Color(0xf4f8ff).lerp(fogC, k * 0.7).getHex(), { roughness: 1 }),
      }));
      const SNOW = 66; // qar xətti (m)
      for (let i = 0; i < 34; i++) {
        const a = (i / 34) * Math.PI * 2 + Math.random() * 0.1;
        const tier = i % 3;
        const r = base + 40 + tier * 85 + Math.random() * 50;
        const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
        const peaks = 2 + Math.floor(Math.random() * 3);
        let maxR = 0;
        for (let k = 0; k < peaks; k++) {
          const main = k === 0;
          const h = (main ? 110 : 70) + tier * 18 + Math.random() * 60;
          const rad = (main ? 62 : 44) + Math.random() * 26;
          // yan zirvələr massivin kənarına, halqa boyu düzülür
          const off = main ? 0 : (k % 2 ? 1 : -1) * (38 + Math.random() * 30);
          const x = cx - Math.sin(a) * off, z = cz + Math.cos(a) * off;
          const sides = 4 + Math.floor(Math.random() * 2);
          const rot = Math.random() * 6;
          const m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, sides), tiers[tier].rock);
          m.position.set(x, h / 2 - 14, z);
          m.rotation.y = rot;
          g.add(m);
          const top = h - 14;
          if (top > SNOW + 12) {
            // qar papağı: zirvədən qar xəttinə qədər olan hissə (eyni yamac bucağı)
            const sh = top - SNOW;
            const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * (sh / h) * 1.04, sh, sides), tiers[tier].snow);
            cap.position.set(x, SNOW + sh / 2 + 0.3, z);
            cap.rotation.y = rot;
            g.add(cap);
          }
          maxR = Math.max(maxR, Math.abs(off) + rad * 0.6);
        }
        this.obstacles.push({ x: cx, z: cz, r: maxR });
      }
      // Dağətəyi: alçaq, enli, tünd meşə rəngli təpələr (dağların önündə)
      const foot = [0.12, 0.3].map((k) => flatMat(new THREE.Color(0x2f6a48).lerp(fogC, k).getHex(), { roughness: 1 }));
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
        const r = base - 20 + Math.random() * 45;
        const rad = 40 + Math.random() * 35, h = 16 + Math.random() * 16;
        const m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 7), foot[i % 2]);
        m.position.set(Math.cos(a) * r, h / 2 - 5, Math.sin(a) * r);
        m.rotation.y = Math.random() * 6;
        g.add(m);
        this.obstacles.push({ x: m.position.x, z: m.position.z, r: rad * 0.7 });
      }
    } else if (id === 'desert') {
      // SƏHRA: konus dağ yox — MESA və qaya sütunları (yastı zirvə, laylı gövdə). Əvvəl
      // bütün treklərdə eyni konus idi, yalnız rəngi dəyişirdi (bədii bibliya).
      const fogC = new THREE.Color(this.data.palette.fog);
      const tiers = [0.14, 0.4, 0.62].map((k) => ({
        body: flatMat(new THREE.Color(0xc46a38).lerp(fogC, k).getHex(), { roughness: 1 }),
        cap: flatMat(new THREE.Color(0xdc8a4c).lerp(fogC, k).getHex(), { roughness: 1 }),
      }));
      for (let i = 0; i < 44; i++) {
        const a = (i / 44) * Math.PI * 2 + Math.random() * 0.1;
        const tier = i % 3;
        const r = base + 20 + tier * 80 + Math.random() * 55;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const spire = Math.random() < 0.3;
        const rb = spire ? 14 + Math.random() * 10 : 40 + Math.random() * 45;
        const h = spire ? 70 + Math.random() * 50 : 38 + tier * 12 + Math.random() * 40;
        const sides = 6 + Math.floor(Math.random() * 3);
        const rot = Math.random() * 6;
        const put = (geo, mat, y) => {
          const m = new THREE.Mesh(geo, mat);
          m.position.set(x, y - 10, z);
          m.rotation.y = rot;
          g.add(m);
        };
        // ətək (söküntü yamacı) → gövdə → açıq rəngli papaq layı
        put(new THREE.CylinderGeometry(rb * 0.86, rb * 1.35, h * 0.34, sides), tiers[tier].body, h * 0.17);
        put(new THREE.CylinderGeometry(rb * 0.74, rb * 0.86, h * 0.56, sides), tiers[tier].body, h * 0.34 + h * 0.28);
        put(new THREE.CylinderGeometry(rb * 0.7, rb * 0.76, h * 0.1, sides), tiers[tier].cap, h * 0.9 + h * 0.05);
        this.obstacles.push({ x, z, r: rb * 1.1 });
      }
    } else if (id === 'zavod') {
      // ZAVOD: dağ yox — SƏNAYE SİLUETİ (soyutma qüllələri, bacalar, iri sexlər). Əvvəl
      // burada alp/səhradakı eyni boz konus dağlar idi; zavodun arxasında yad görünürdü.
      const fogC = new THREE.Color(this.data.palette.fog);
      const tiers = [0.25, 0.5, 0.7].map((k) => flatMat(new THREE.Color(0x4d5058).lerp(fogC, k).getHex(), { roughness: 1 }));
      const put = (geo, tier, x, y, z) => {
        const m = new THREE.Mesh(geo, tiers[tier]);
        m.position.set(x, y, z);
        g.add(m);
      };
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * Math.PI * 2 + Math.random() * 0.09;
        const tier = i % 3;
        const r = base + 10 + tier * 70 + Math.random() * 50;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const kind = Math.random();
        let rad;
        if (kind < 0.3) {
          // soyutma qülləsi: aşağı enli, beldə daralan, yuxarı azca açılan (iki kəsik konus)
          const h = 46 + Math.random() * 30, rb = 20 + Math.random() * 8;
          put(new THREE.CylinderGeometry(rb * 0.58, rb, h * 0.62, 12, 1, true), tier, x, h * 0.31 - 6, z);
          put(new THREE.CylinderGeometry(rb * 0.66, rb * 0.58, h * 0.38, 12, 1, true), tier, x, h * 0.81 - 6, z);
          rad = rb;
        } else if (kind < 0.62) {
          // baca dəstəsi: 1–3 hündür nazik baca
          const n = 1 + Math.floor(Math.random() * 3);
          for (let k = 0; k < n; k++) {
            const h = 60 + Math.random() * 55;
            put(new THREE.CylinderGeometry(2.2, 3.6, h, 7), tier, x + (k - (n - 1) / 2) * 13, h / 2 - 6, z);
          }
          rad = 8 + n * 5;
        } else {
          // iri sex: uzun qutu + pilləli üst hissə
          const w = 50 + Math.random() * 50, h = 16 + Math.random() * 14;
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 30), tiers[tier]);
          m.position.set(x, h / 2 - 6, z);
          m.rotation.y = -a + Math.PI / 2; // uzun tərəfi trekə baxsın
          g.add(m);
          const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, h * 0.5, 24), tiers[tier]);
          top.position.set(x, h + h * 0.25 - 6, z);
          top.rotation.y = m.rotation.y;
          g.add(top);
          rad = w * 0.5;
        }
        this.obstacles.push({ x, z, r: rad });
      }
    } else {
      // Trekə uyğun dağ silueti rəngi
      const mountainColor = {
        desert: 0xbc7c42, alpine: 0x556878, canyon: 0x6b3550, riviera: 0x8a5f86,
      }[id] ?? 0x556878;
      // HAVA PERSPEKTİVİ: uzaq pillələr duman rənginə qarışır (3 pillə —
      // hər pillə bir materiala düşür ki, merge pozulmasın → cəmi 3 draw call)
      const fogC = new THREE.Color(this.data.palette.fog);
      const tiers = [0.18, 0.42, 0.62].map((k) =>
        flatMat(new THREE.Color(mountainColor).lerp(fogC, k).getHex(), { roughness: 1 }));
      for (let i = 0; i < 52; i++) {
        const a = (i / 52) * Math.PI * 2 + Math.random() * 0.08;
        // Dəniz tərəfi (cənub) açıq qalır — sahil üfüqü
        if (this._seaCoast && Math.sin(a) < -0.45) continue;
        const tier = i % 3;
        const r = base + 20 + tier * 85 + Math.random() * 55;
        const h = 55 + tier * 22 + Math.random() * 95;
        const rad = 45 + Math.random() * 45;
        const m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 5), tiers[tier]);
        m.position.set(Math.cos(a) * r, h / 2 - 12, Math.sin(a) * r);
        m.rotation.y = Math.random() * 6;
        g.add(m);
        this.obstacles.push({ x: m.position.x, z: m.position.z, r: rad * 0.6 });
        if (id === 'alpine' && h > 90) {
          const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.42, h * 0.32, 5), flatMat(0xf2f7ff));
          cap.position.set(Math.cos(a) * r, h / 2 - 12 + h * 0.34, Math.sin(a) * r);
          cap.rotation.y = m.rotation.y;
          g.add(cap);
        }
      }
    }
    // PERFORMANS: uzaq relyef bir neçə mesh-ə birləşdirilir
    const merged = mergeStaticGroup(g);
    g.traverse((o) => o.geometry?.dispose?.());
    this.scene.add(merged);
    this._track(merged);
    this.distant = merged; // kameranın görmə həddi bundan hesablanır (GameplayScene)
  }

  // Buludlar: TƏK InstancedMesh (1 draw call), çox yavaş orbit dreyfi
  _clouds() {
    const p = this.data.palette;
    if (p.night) return; // gecə səmasında ulduzlar var
    // Şablon: 4 yumru topa birləşir
    const puffs = [];
    const mk = (x, y, z, s) => {
      const g = new THREE.IcosahedronGeometry(1, 0);
      g.scale(s, s * 0.62, s * 0.8);
      g.translate(x, y, z);
      return g;
    };
    puffs.push(mk(0, 0, 0, 1.6), mk(1.7, -0.2, 0.3, 1.15), mk(-1.6, -0.15, -0.2, 1.05), mk(0.4, 0.55, -0.4, 0.95));
    // sadə birləşdirmə: BufferGeometryUtils-siz — qrupu klonlaya bilmərik,
    // ona görə hər puff ayrı instans atributu yox, geometry-ləri əl ilə birləşdiririk
    const totalVerts = puffs.reduce((n, g) => n + g.attributes.position.count, 0);
    const pos = new Float32Array(totalVerts * 3);
    let off = 0;
    const idx = [];
    for (const g of puffs) {
      pos.set(g.attributes.position.array, off * 3);
      const gi = g.index ? Array.from(g.index.array) : [...Array(g.attributes.position.count).keys()];
      for (const ii of gi) idx.push(ii + off);
      off += g.attributes.position.count;
      g.dispose();
    }
    const cloudGeo = new THREE.BufferGeometry();
    cloudGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    cloudGeo.setIndex(idx);
    cloudGeo.computeVertexNormals();
    const cloudColor = new THREE.Color(0xffffff).lerp(new THREE.Color(p.skyBottom ?? p.sky), 0.16);
    const mat = new THREE.MeshStandardMaterial({
      color: cloudColor, flatShading: true, roughness: 1, metalness: 0,
      // Kölgəli üzlər qaralmasın — buludlar yumşaq və işıqlı qalsın
      emissive: cloudColor, emissiveIntensity: 0.42,
    });
    const n = 16;
    const mesh = new THREE.InstancedMesh(cloudGeo, mat, n);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const r = 160 + Math.random() * (this.track.maxRadius + 220);
      const s = 9 + Math.random() * 11;
      e.set(0, Math.random() * 6, 0);
      q.setFromEuler(e);
      m4.compose(
        new THREE.Vector3(Math.cos(a) * r, 95 + Math.random() * 65, Math.sin(a) * r),
        q,
        new THREE.Vector3(s, s, s)
      );
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
    this._cloudMesh = mesh;
    this._track(mesh);
  }

  // Dəniz (cənub üfüqü): su səthi + sahil köpüyü + adalar + mayak
  _sea() {
    const p = this.data.palette;
    const coast = this._seaCoast;
    const seaC = new THREE.Color(0x2b8fae).lerp(new THREE.Color(p.fog), 0.12);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(2800, 1500), // üfüqə qədər: arxasından quru (yer diski) görünməsin
      new THREE.MeshStandardMaterial({
        color: seaC, roughness: 0.32, metalness: 0,
        emissive: seaC, emissiveIntensity: 0.14,
      })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.012, -(coast + 750));
    this.scene.add(sea);
    this._track(sea);
    // Sahil köpük xətti
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(1700, 2.6),
      new THREE.MeshBasicMaterial({ color: 0xf2f7f2, transparent: true, opacity: 0.55 })
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(0, 0.02, -coast);
    this.scene.add(foam);
    this._track(foam);
    // Uzaq adalar (dumanlı siluet)
    const islandMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x8a5f86).lerp(new THREE.Color(p.fog), 0.55),
      flatShading: true, roughness: 1,
    });
    for (const [ix, iz, s] of [[-260, coast + 150, 26], [180, coast + 210, 34], [420, coast + 120, 20]]) {
      const isl = new THREE.Mesh(new THREE.ConeGeometry(s, s * 0.7, 5), islandMat);
      isl.position.set(ix, s * 0.18, -iz);
      this.scene.add(isl);
      this._track(isl);
    }
    // ——— ÇİMƏRLİK: açıq qum zolağı (sahil xəttindən 16 m içəri) ———
    const beach = new THREE.Mesh(
      new THREE.PlaneGeometry(1700, 16),
      new THREE.MeshStandardMaterial({ color: 0xf6e2b8, roughness: 1 })
    );
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(0, -0.015, -(coast - 8)); // yerdən 2.5 sm yuxarı, sudan aşağı
    beach.receiveShadow = true;
    this.scene.add(beach);
    this._track(beach);

    // Sudakı günəş yolu ayrıca həndəsə deyil: suyun materialı (roughness 0.32) alçaq
    // günəşi özü əks etdirir; disk kameranı izlədiyi üçün parıltı düz onun altına düşür.

    // ——— PALMA CƏRGƏSİ çimərlik boyu ———
    const kit = sharedNature();
    const deco = new THREE.Group();
    if (kit.ready) {
      for (let x = -330; x <= 330; x += 20 + Math.random() * 12) {
        const z = -(coast - 9 - Math.random() * 4);
        // (_free işlədilmir: o, çimərlik zolağını "su" sayır) — yalnız mövcud obyektlərə baxılır
        if (this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 1.5)) continue;
        const palm = kit.get('tree_palmTall');
        if (!palm) break;
        palm.position.set(x, 0, z);
        palm.rotation.y = Math.random() * 6;
        palm.scale.setScalar(1.1 + Math.random() * 0.5);
        deco.add(palm);
        this.obstacles.push({ x, z, r: 0.6 });
      }
    }
    // ——— YELKƏNLİ QAYIQLAR ———
    const hullMat = flatMat(0xf4efe6), sailMat = flatMat(0xffffff), woodMat = flatMat(0x8a5a3a);
    for (const [bx, bd, sc, rot] of [[-210, 60, 1, 0.4], [-60, 120, 1.3, -0.3], [40, 48, 0.9, 1.2], [200, 95, 1.2, 0.2], [310, 150, 1.5, -0.8]]) {
      const b = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 7), hullMat);
      hull.position.y = 0.45;
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.18, 8, 0.18), woodMat);
      mast.position.y = 4.6;
      const sail = new THREE.Mesh(new THREE.ConeGeometry(2.6, 6.4, 3), sailMat);
      sail.scale.set(0.12, 1, 1);
      sail.position.set(0, 4.6, -0.9);
      b.add(hull, mast, sail);
      b.position.set(bx, 0, -(coast + bd));
      b.rotation.y = rot;
      b.scale.setScalar(sc);
      deco.add(b);
    }
    // ——— KÖRPÜCÜK (pirs) + ucunda mayak ———
    const PX = 90, PL = 30;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.35, PL + 8), woodMat);
    deck.position.set(PX, 0.85, -(coast + PL / 2 - 4));
    deco.add(deck);
    for (let k = 0; k <= 4; k++) {
      for (const sx of [-1.5, 1.5]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.7, 0.3), woodMat);
        post.position.set(PX + sx, 0.1, -(coast - 6 + k * (PL / 4)));
        deco.add(post);
      }
    }
    const mergedDeco = mergeStaticGroup(deco);
    deco.traverse((o) => { if (o.isMesh && !o.material.userData?.shared) o.geometry?.dispose?.(); });
    this.scene.add(mergedDeco);
    this._track(mergedDeco);

    // Mayak — körpücüyün ucunda
    this._lighthouse(PX, -(coast + PL));
  }

  _lighthouse(x, z) {
    const g = new THREE.Group();
    // Zolaqlı gövdə (canvas toxuma)
    const c = document.createElement('canvas');
    c.width = 8; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f2ede4';
    ctx.fillRect(0, 0, 8, 64);
    ctx.fillStyle = '#c4392e';
    ctx.fillRect(0, 0, 8, 16);
    ctx.fillRect(0, 32, 8, 16);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.3, 13, 10),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })
    );
    tower.position.y = 6.5;
    tower.castShadow = true;
    g.add(tower);
    // Fənər başlığı
    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 1.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd257, emissiveIntensity: 1.6 })
    );
    lamp.position.y = 13.9;
    g.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.2, 8), flatMat(0xc4392e));
    cap.position.y = 15.1;
    g.add(cap);
    // Daş özül
    const baseRock = new THREE.Mesh(new THREE.DodecahedronGeometry(4, 0), flatMat(0x8a8276));
    baseRock.scale.set(1.4, 0.5, 1.2);
    baseRock.position.y = -0.4;
    g.add(baseRock);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this._track(g);
    this.obstacles.push({ x, z, r: 4.5 });
  }

  // Kanyon dərə divarları: yolu "sıxan" mesa cütlükləri + qaya tağı
  _canyonWalls() {
    const g = new THREE.Group();
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const wallMats = [flatMat(0x8a4a34, { roughness: 1 }), flatMat(0x7a3e2c, { roughness: 1 })];
    const N = this.track.N;
    // Şaxə zonalarından (0.055-0.262, 0.548-0.707) və startdan kənar nöqtələr
    for (const [wi, t] of [0.33, 0.40, 0.46, 0.80, 0.90].entries()) {
      const i = Math.round(t * N) % N;
      const c = this.track.points[i];
      const n = this.track.normals[i];
      for (const side of [-1, 1]) {
        const off = this.track.halfWidth + 10 + Math.random() * 5;
        const sx = 6 + Math.random() * 3.5;
        const sy = 9 + Math.random() * 6;
        const mesa = new THREE.Mesh(rockGeo, wallMats[(wi + (side > 0 ? 1 : 0)) % 2]);
        mesa.scale.set(sx, sy, sx * 0.8);
        mesa.position.set(c.x + n.x * off * side, sy * 0.35, c.z + n.z * off * side);
        mesa.rotation.y = Math.random() * 6;
        if (!this._free(mesa.position.x, mesa.position.z, sx * 0.85)) continue;
        g.add(mesa);
        this.obstacles.push({ x: mesa.position.x, z: mesa.position.z, r: sx * 0.85 });
      }
    }
    // QAYA TAĞI — yol tağın altından keçir (landmark)
    const ti = Math.round(0.86 * N) % N;
    const c = this.track.points[ti];
    const n = this.track.normals[ti];
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(rockGeo, wallMats[0]);
      pillar.scale.set(3.2, 9.5, 3.2);
      pillar.position.set(
        c.x + n.x * (this.track.halfWidth + 3.2) * side, 3.4,
        c.z + n.z * (this.track.halfWidth + 3.2) * side
      );
      g.add(pillar);
      if (this._free(pillar.position.x, pillar.position.z, 2.8, 0.5)) {
        this.obstacles.push({ x: pillar.position.x, z: pillar.position.z, r: 2.8 });
      }
    }
    const lintel = new THREE.Mesh(rockGeo, wallMats[1]);
    lintel.scale.set(this.track.halfWidth + 6.5, 2.6, 4.2);
    lintel.position.set(c.x, 9.6, c.z);
    lintel.rotation.z = 0.06;
    lintel.rotation.y = Math.atan2(this.track.tangents[ti].x, this.track.tangents[ti].z) + Math.PI / 2;
    g.add(lintel);
    const merged = mergeStaticGroup(g);
    g.traverse((o) => o.geometry?.dispose?.());
    this.scene.add(merged);
    this._track(merged);
  }

  // Orta qat relyefi: yumru təpələr (dərinlik + təbiilik)
  _hills() {
    const g = new THREE.Group();
    const p = this.data.palette;
    const base = new THREE.Color(p.ground);
    const mats = [
      new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.86), flatShading: true, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.74), flatShading: true, roughness: 1 }),
    ];
    let placed = 0;
    for (let i = 0; i < 40 && placed < 12; i++) {
      const r = 13 + Math.random() * 13;
      const pos = this._freeSpot(r + 6, this.track.maxRadius * 0.5, this.track.maxRadius + 60);
      if (!pos) continue;
      // Dəniz sahilinə düşməsin
      if (this._seaCoast && pos.z < -(this._seaCoast - 30)) continue;
      // Göl/çay maneələri ilə toqquşmasın
      let clash = false;
      for (const o of this.obstacles) {
        if (o.r > 5 && Math.hypot(o.x - pos.x, o.z - pos.z) < o.r + r + 4) { clash = true; break; }
      }
      if (clash) continue;
      const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mats[placed % 2]);
      hill.scale.y = 0.32;
      hill.position.set(pos.x, -r * 0.06, pos.z);
      hill.rotation.y = Math.random() * 6;
      if (!this._free(pos.x, pos.z, r * 0.8)) continue;
      g.add(hill);
      this.obstacles.push({ x: pos.x, z: pos.z, r: r * 0.8 });
      placed++;
    }
    const merged = mergeStaticGroup(g);
    g.traverse((o) => o.geometry?.dispose?.());
    this.scene.add(merged);
    this._track(merged);
  }

  // Yol kənarı yarış rekvizitləri: döngələrdə şin qüllələri və zolaqlı bariyerlər
  _tracksideProps() {
    const g = new THREE.Group();
    const N = this.track.N;
    const hw = this.track.halfWidth;
    for (let i = 0; i < N; i += 5) {
      const t0 = this.track.tangents[i];
      const t1 = this.track.tangents[(i + 4) % N];
      const cross = t0.x * t1.z - t0.z * t1.x; // döngə şiddəti/istiqaməti
      const curved = Math.abs(cross) > 0.1;
      if (!curved && Math.random() > 0.14) continue;
      const side = curved ? (cross > 0 ? -1 : 1) : (Math.random() < 0.5 ? -1 : 1); // döngənin bayır tərəfi
      const c = this.track.points[i];
      const n = this.track.normals[i];
      const off = hw + 2.1 + Math.random() * 1.5;
      const tyre = Math.random() < 0.55;
      const obj = tyre ? makeTireStack() : makeBarrier();
      const ox = c.x + n.x * off * side, oz = c.z + n.z * off * side;
      obj.position.set(ox, 0, oz);
      obj.rotation.y = Math.atan2(t0.x, t0.z);
      if (!this._free(ox, oz, tyre ? 1.35 : 1.7, 0.6)) continue;
      g.add(obj);
      // Trek kənarı maneələri toqquşma siyahısına DÜŞMÜRDÜ — təkər yığınının
      // və baryerin içindən keçmək olurdu (fiziki testlə təsdiqləndi)
      this.obstacles.push({ x: ox, z: oz, r: tyre ? 1.35 : 1.7 });
    }
    const merged = mergeStaticGroup(g);
    g.traverse((o) => o.geometry?.dispose?.());
    this.scene.add(merged);
    this._track(merged);
  }

  // Neon reklam lövhələri — yol boyu böyük işıqlı panellər
  _billboards() {
    const texts = [
      ['NITROVERSE', '#34e0ff'], ['DRIFT', '#ff3d8a'], ['TURBO', '#ffd257'],
      ['NEON', '#b44bff'], ['GO GO', '#46d47e'],
    ];
    const N = this.track.N;
    for (const [bi, t] of [0.12, 0.30, 0.52, 0.70, 0.88].entries()) {
      const i = Math.round(t * N) % N;
      const c = this.track.points[i];
      const n = this.track.normals[i];
      const side = bi % 2 === 0 ? 1 : -1;
      const off = this.track.halfWidth + 7 + Math.random() * 3;
      const [txt, col] = texts[bi % texts.length];
      // Canvas paneli
      const cv = document.createElement('canvas');
      cv.width = 256; cv.height = 96;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#0a0d1c';
      ctx.fillRect(0, 0, 256, 96);
      ctx.strokeStyle = col;
      ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, 244, 84);
      // Mətn çərçivəyə sığsın — uzun ad (məs. NITROVERSE) kəsilirdi
      let size = 52;
      const fit = (s) => { ctx.font = `900 ${s}px Rajdhani, Arial Black, sans-serif`; };
      fit(size);
      while (ctx.measureText(txt).width > 232 && size > 20) fit(--size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = col;
      ctx.fillText(txt, 128, 52);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(8.5, 3.2, 0.3),
        new THREE.MeshStandardMaterial({
          map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.1, roughness: 0.6,
        })
      );
      const px = c.x + n.x * off * side;
      const pz = c.z + n.z * off * side;
      panel.position.set(px, 6.2, pz);
      const tg = this.track.tangents[i];
      panel.rotation.y = Math.atan2(tg.x, tg.z) + Math.PI / 2 + (side > 0 ? Math.PI : 0);
      this.scene.add(panel);
      this._track(panel);
      // Dayaqlar
      const legMat = flatMat(0x1b1e2b);
      for (const lx of [-3.4, 3.4]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6.2, 0.35), legMat);
        leg.position.set(
          px + Math.cos(panel.rotation.y) * lx, 3.1,
          pz - Math.sin(panel.rotation.y) * lx
        );
        this.scene.add(leg);
        this._track(leg);
      }
      if (this._free(px, pz, 2.2, 0.8)) this.obstacles.push({ x: px, z: pz, r: 2.2 });
    }
  }

  // İncə boz noise toxuması (material rəngi tint edir)
  _noiseTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#909090';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const v = 128 + Math.floor((Math.random() - 0.5) * 26);
      ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Çay: trekin altından keçir (körpü ilə), daxili qolu gölə tökülür
  _river(def) {
    const p = this.data.palette;
    const N = this.track.N;
    const i0 = Math.round((def.t ?? 0.5) * N) % N;
    const c = this.track.points[i0];
    const tg = this.track.tangents[i0];
    const nrm = this.track.normals[i0];
    const half = (def.width ?? 12) / 2;
    const maxR = this.track.maxRadius + 170;
    const waterC = new THREE.Color(def.color ?? 0x3fa8c8);

    // Qol qurucusu: körpüdən kənara, meander ilə; yol yaxınlığında göllə bitir
    const buildArm = (dir) => {
      const pts = [];
      let lake = false;
      for (let s = 0; s <= 460; s += 7) {
        const mx = Math.sin(s * 0.04) * 9;
        const pos = new THREE.Vector3(
          c.x + nrm.x * s * dir + tg.x * mx, 0,
          c.z + nrm.z * s * dir + tg.z * mx
        );
        if (Math.hypot(pos.x, pos.z) > maxR) break;
        if (s > 34) {
          const near = this.track.getNearest(pos);
          if (Math.abs(near.lateral) < this.track.halfWidth + 16 ||
              this.track.isOnBranch?.(pos, 14)) { lake = true; pts.push(pos); break; }
        }
        pts.push(pos);
      }
      return { pts, lake };
    };
    const armA = buildArm(1);
    const armB = buildArm(-1);
    // GÖL YOLA DAŞMASIN: göl mərkəzi üçün qol boyu GERİYƏ gedərək yoldan
    // (göl radiusu + pay) qədər uzaq nöqtə tapılır; çay həmin nöqtəyə qədər kəsilir
    for (const arm of [armA, armB]) {
      if (!arm.lake || arm.pts.length < 4) continue;
      arm.R = 15 + Math.random() * 6;
      const need = this.track.halfWidth + arm.R * 1.55 + 4;
      let ji = -1;
      for (let j = arm.pts.length - 1; j >= 3; j--) {
        const near = this.track.getNearest(arm.pts[j]);
        if (Math.abs(near.lateral) >= need &&
            !(this.track.isOnBranch?.(arm.pts[j], need - this.track.halfWidth))) { ji = j; break; }
      }
      if (ji < 0) { arm.lake = false; continue; }
      arm.pts = arm.pts.slice(0, ji + 1); // çay gölə tökülür, yola çatmır
    }
    const pts = [...armB.pts.slice(1).reverse(), c.clone(), ...armA.pts.slice(1)];
    if (pts.length < 4) return;

    // Lent qurucusu (su + sahil zolaqları)
    const strip = (width, y, mat) => {
      const verts = [];
      const idx = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const t = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
        const n = new THREE.Vector3(t.z, 0, -t.x);
        verts.push(
          pts[i].x + n.x * width, y, pts[i].z + n.z * width,
          pts[i].x - n.x * width, y, pts[i].z - n.z * width
        );
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const o = i * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, mat);
    };
    const waterMat = new THREE.MeshStandardMaterial({
      color: waterC, roughness: 0.28, metalness: 0,
      emissive: waterC, emissiveIntensity: 0.18,
    });
    const bankMat = new THREE.MeshStandardMaterial({
      // Sahil yerin faktiki tonundan bir az tünddür. `groundGain` olan treklərdə yer açılıb,
      // köhnə sabit ton (kənar rəngi × 0.8) onun yanında qara həlqə kimi görünürdü.
      color: p.groundGain
        ? new THREE.Color(p.ground).multiplyScalar(0.28 * p.groundGain * 0.78)
        : new THREE.Color(p.groundEdge ?? p.ground).multiplyScalar(0.8),
      roughness: 1,
    });
    const g = new THREE.Group();
    g.add(strip(half + 2.4, -0.012, bankMat)); // sahil
    g.add(strip(half, 0.009, waterMat));       // su (yolun ALTINDA qalır: yol y=0.02)
    // Su zonası — körpü altı daxil bütün çay boyu (dekor qoyulmasın)
    for (const pt of pts) this.keepOut.push({ x: pt.x, z: pt.z, r: half + 3.5 });

    // ÇAYA GİRMƏK OLMAZ: mərkəz xətti boyu toqquşma dairələri
    // (körpü zonası açıq qalır) + sahildə TƏBİİ maneə kimi daşlar
    const bridgeClear = this.track.halfWidth + half + 6;
    const rockMat = new THREE.MeshStandardMaterial({
      color: p.groundGain ? new THREE.Color(0x8b8f9a) : new THREE.Color(p.groundEdge ?? 0x888888).multiplyScalar(0.7),
      roughness: 1, flatShading: true,
    });
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < pts.length; i += 2) {
      const pt = pts[i];
      if (pt.distanceTo(c) < bridgeClear) continue;
      this.obstacles.push({ x: pt.x, z: pt.z, r: half + 1.2, water: true });
      // Hər 4-cü nöqtədə sahil daşları (vizual xəbərdarlıq)
      if (i % 4 === 0) {
        const a = pts[Math.max(0, i - 1)];
        const b2 = pts[Math.min(pts.length - 1, i + 1)];
        const t = new THREE.Vector3().subVectors(b2, a).setY(0).normalize();
        const n = new THREE.Vector3(t.z, 0, -t.x);
        for (const side of [-1, 1]) {
          if (Math.random() < 0.35) continue;
          const s = 0.7 + Math.random() * 0.9;
          const rock = new THREE.Mesh(rockGeo, rockMat);
          rock.scale.set(s, s * 0.7, s);
          // BUQ İDİ: `side` işlədilmirdi — hər iki daş çayın EYNİ sahilinə düşürdü
          const kənar = (half + 2.0 + Math.random() * 1.5) * side;
          rock.position.set(pt.x + n.x * kənar, s * 0.3, pt.z + n.z * kənar);
          rock.rotation.y = Math.random() * 6;
          g.add(rock);
        }
      }
    }

    // Göl(lər): ORQANİK formalı (dairə yox), sahil daşları ilə
    for (const arm of [armA, armB]) {
      if (!arm.lake || !arm.pts.length) continue;
      const end = arm.pts[arm.pts.length - 1];
      const R = arm.R;
      const phase = Math.random() * 6;
      // Gölün konturu — su, sahil və sahil daşları EYNİ funksiyadan oxuyur
      const edge = (th) => R * (1 + 0.20 * Math.sin(3 * th + phase) + 0.10 * Math.sin(7 * th + phase * 2));
      const blob = (scale) => {
        const shape = new THREE.Shape();
        for (let k = 0; k <= 30; k++) {
          const th = (k / 30) * Math.PI * 2;
          const rr = edge(th) * scale;
          const px = Math.cos(th) * rr, py = Math.sin(th) * rr;
          if (k === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
        }
        return new THREE.ShapeGeometry(shape);
      };
      const bank = new THREE.Mesh(blob(1.16), bankMat);
      bank.rotation.x = -Math.PI / 2;
      bank.position.set(end.x, -0.012, end.z);
      g.add(bank);
      const lake = new THREE.Mesh(blob(1), waterMat);
      lake.rotation.x = -Math.PI / 2;
      lake.position.set(end.x, 0.009, end.z);
      this.keepOut.push({ x: end.x, z: end.z, r: R * 1.36 });
      g.add(lake);
      // Göl sahili daşları + toqquşma
      for (let k = 0; k < 9; k++) {
        const th = (k / 9) * Math.PI * 2 + Math.random() * 0.4;
        // ShapeGeometry XY-də qurulub −90° döndərilir: (x, y) → dünya (x, −y).
        // Əvvəl daş düsturu gölün konturu ilə uyğun deyildi (faza və 7θ
        // həddi yox idi) → daşlar suyun ortasında qalırdı.
        const rr = edge(th) * 1.13;
        const s = 0.8 + Math.random() * 1.1;
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.scale.set(s, s * 0.7, s);
        rock.position.set(end.x + Math.cos(th) * rr, s * 0.3, end.z - Math.sin(th) * rr);
        rock.rotation.y = Math.random() * 6;
        g.add(rock);
      }
      this.obstacles.push({ x: end.x, z: end.z, r: R * 1.1 + 1.2, water: true });
    }

    // KÖRPÜ: keçiddə yol kənarı məhəccərlər + dayaq daşları
    const railLen = half * 2 + 10;
    const heading = Math.atan2(tg.x, tg.z);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.85, railLen), new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 0.85 }));
      rail.position.set(
        c.x + nrm.x * (this.track.halfWidth + 0.55) * side, 0.42,
        c.z + nrm.z * (this.track.halfWidth + 0.55) * side
      );
      rail.rotation.y = heading;
      rail.castShadow = true;
      g.add(rail);
      // Uclarda dayaq daşları
      for (const e of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.7), new THREE.MeshStandardMaterial({ color: 0x9a9284, roughness: 0.9 }));
        post.position.set(
          c.x + nrm.x * (this.track.halfWidth + 0.55) * side + tg.x * e * railLen / 2, 0.55,
          c.z + nrm.z * (this.track.halfWidth + 0.55) * side + tg.z * e * railLen / 2
        );
        post.rotation.y = heading;
        g.add(post);
      }
      // Məhəccər toqquşması
      for (const s of [-railLen / 3, 0, railLen / 3]) {
        this.obstacles.push({
          x: c.x + nrm.x * (this.track.halfWidth + 0.55) * side + tg.x * s,
          z: c.z + nrm.z * (this.track.halfWidth + 0.55) * side + tg.z * s,
          r: 0.55, // 1.0 idi — yolun içinə 0.8 m-ə qədər girirdi (ölçüldü), məhəccər isə 0.3 m qalınlıqdadır
        });
      }
    }
    const merged = mergeStaticGroup(g);
    this.scene.add(merged);
    this._track(merged);
    this._flattenGroundNearWater();
  }

  // Su ətrafında yer DÜZ olmalıdır: relyef dalğası (±1.7 m) suyun içindən
  // çıxıb gölü sərt kənarlı parçalara bölürdü. Suya 28 m-dən yaxın təpələr
  // sıfıra endirilir, 75 m-ə qədər yumşaq keçid.
  _flattenGroundNearWater() {
    const geo = this._groundGeo;
    if (!geo || !this.keepOut.length) return;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getZ(i);
      if (h === 0) continue;
      const wx = pos.getX(i), wz = -pos.getY(i);
      let d = Infinity;
      for (const o of this.keepOut) d = Math.min(d, Math.hypot(o.x - wx, o.z - wz) - o.r);
      const k = Math.max(0, Math.min(1, (d - 28) / 47));
      if (k < 1) pos.setZ(i, h * k * k * (3 - 2 * k));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  // Yavaş animasiyalar (dəyirman qanadları, bulud dreyfi)
  update(dt) {
    if (this._blades) {
      for (const b of this._blades) b.rotation.z += dt * b.userData.speed;
    }
    if (this._cloudMesh) this._cloudMesh.rotation.y += dt * 0.004;
  }

  // Boş, yol/şaxə/çaydan təmiz mövqe tap (rejection sampling)
  _freeSpot(objR, rMin, rMax, tries = 30) {
    const half = this.track.halfWidth;
    for (let i = 0; i < tries; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = rMin + Math.random() * (rMax - rMin);
      const pos = new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
      const near = this.track.getNearest(pos);
      if (Math.abs(near.lateral) < half + objR + 3) continue;
      if (this.track.branches?.length && this.track.isOnBranch(pos, objR + 3)) continue;
      return pos;
    }
    return null;
  }

  // ————— TREK KƏNARI QURĞULARI —————
  // Xəritələr boş görünürdü: yalnız ağac/daş vardı, yarış atmosferi yox idi.
  // Hamısı YOLDAN kənarda, döngələrə və düz hissələrə paylanır və tək qrupda
  // birləşdirilir (draw call artmır).
  _trackside() {
    const g = new THREE.Group();
    const N = this.track.points.length;
    const hw = this.track.halfWidth;
    const accent = this.data.palette?.accent ?? 0xff7a2f;
    const night = !!this.data.palette?.night;
    // YER TUTMA XƏRİTƏSİ: əvvəl hər dekor müstəqil qoyulurdu və obyektlər
    // bir-birinin İÇİNDƏN çıxırdı (istifadəçi: şəhər trekində tribunalar
    // üst-üstə düşür). İndi yer tutulubsa obyekt qoyulmur.
    const tutulan = [];
    // ƏVVƏLKİ dekor da yoxlanılır (şin qüllələri, bilbordlar, ağaclar…) —
    // yoxsa tribuna başqa obyektin içinə düşürdü
    const boşdur = (x, z, r) => !tutulan.some((o) =>
      Math.hypot(o.x - x, o.z - z) < o.r + r + 2)
      && !this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 1.5)
      && !this._inWater(x, z, r)
      && !this._onBranch(x, z, r);
    const put = (obj, i, off, side, faceRoad = true, r = 2.5) => {
      const c = this.track.points[i], n = this.track.normals[i], t = this.track.tangents[i];
      const x = c.x + n.x * off * side, z = c.z + n.z * off * side;
      if (!boşdur(x, z, r)) { obj.traverse?.((o) => o.geometry?.dispose?.()); return null; }
      obj.position.set(x, 0, z);
      obj.rotation.y = faceRoad
        ? Math.atan2(-n.x * side, -n.z * side)
        : Math.atan2(t.x, t.z);
      g.add(obj);
      tutulan.push({ x, z, r });
      return obj.position;
    };
    // 1) Tribunalar — düz hissələrdə, 2-4 ədəd
    {
      const want = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < want; k++) {
        const i = Math.floor((k + 0.5) / want * N + Math.random() * 8) % N;
        const t0 = this.track.tangents[i], t1 = this.track.tangents[(i + 5) % N];
        if (Math.abs(t0.x * t1.z - t0.z * t1.x) > 0.08) continue;   // düz olsun
        const side = Math.random() < 0.5 ? -1 : 1;
        const len = 14 + Math.random() * 8;
        const pos = put(makeGrandstand(len, accent), i, hw + 9 + Math.random() * 3, side, true, len * 0.42);
        if (pos) this.obstacles.push({ x: pos.x, z: pos.z, r: len * 0.42 });
      }
    }
    // 2) Projektor qüllələri — trek boyu bərabər
    {
      const want = 4;
      for (let k = 0; k < want; k++) {
        const i = Math.floor((k / want) * N + 6) % N;
        const side = k % 2 ? 1 : -1;
        const pos = put(makeFloodlight(13 + Math.random() * 4, night || Math.random() < 0.4), i, hw + 7.5, side, false, 1.6);
        if (pos) this.obstacles.push({ x: pos.x, z: pos.z, r: 0.9 });
      }
    }
    // 3) Marşal məntəqələri — döngə çıxışlarında
    {
      for (let i = 0; i < N; i += 7) {
        const t0 = this.track.tangents[i], t1 = this.track.tangents[(i + 4) % N];
        const cross = t0.x * t1.z - t0.z * t1.x;
        if (Math.abs(cross) < 0.12) continue;                 // yalnız döngə
        if (Math.random() > 0.45) continue;
        const side = cross > 0 ? -1 : 1;                      // döngənin bayırı
        const pos = put(makeMarshalPost(accent), i, hw + 5.5, side, true, 2.2);
        if (pos) this.obstacles.push({ x: pos.x, z: pos.z, r: 1.6 });
      }
    }
    // 4) Sponsor lövhələri — düz hissələrdə sıra ilə
    {
      for (let i = 0; i < N; i += 4) {
        const t0 = this.track.tangents[i], t1 = this.track.tangents[(i + 4) % N];
        if (Math.abs(t0.x * t1.z - t0.z * t1.x) > 0.07) continue;
        if (Math.random() > 0.4) continue;
        const side = Math.random() < 0.5 ? -1 : 1;
        const w = 5 + Math.random() * 3;
        const cols = [0x1f6feb, 0xe0342c, 0x22a06b, 0x8a3df0, 0xff7a2f];
        const pos = put(makeSponsorBoard(w, cols[(Math.random() * cols.length) | 0]), i, hw + 3.4, side, true, w * 0.4);
        if (pos) this.obstacles.push({ x: pos.x, z: pos.z, r: w * 0.4 });
      }
    }
    // 5) Bayraq sıraları — start-finiş yaxınlığı
    for (const idx of [4, N - 10]) {
      const i = ((idx % N) + N) % N;
      put(makeBunting(11 + Math.random() * 4), i, hw + 6.5, Math.random() < 0.5 ? -1 : 1, false, 5);
    }
    const merged = mergeStaticGroup(g);
    g.traverse((o) => o.geometry?.dispose?.());
    this.scene.add(merged);
    this._track(merged);
  }

  // ————— TOQQUŞMA TƏHLÜKƏSİZLİK TORU —————
  // Bəzi dekor qurucuları maneə qeydini unudurdu (fiziki testlə tapıldı:
  // ağacların, təkər yığınlarının içindən keçmək olurdu). Bu keçid səhnəni
  // gəzir və qeydsiz qalmış İRİ obyektlərə avtomatik maneə verir.
  // Buraxılır: alçaq obyektlər (üstündən keçmək olar), nəhəng/birləşdirilmiş
  // bloklar və yolun ÜSTÜNDƏKİ elementlər (start tağı, banner).
  _autoObstacles() {
    const box = new THREE.Box3(), size = new THREE.Vector3();
    const half = this.track.halfWidth;
    const tmp = new THREE.Vector3();
    let added = 0;
    for (const root of this.objects) {
      root.traverse?.((n) => {
        if (!n.isMesh) return;
        box.setFromObject(n); box.getSize(size);
        if (size.y < 1.5) return;
        if (size.x > 26 || size.z > 26) return;
        const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
        tmp.set(cx, 0, cz);
        const near = this.track.getNearest(tmp);
        if (Math.abs(near.lateral) < half + 1.2) return;   // yolun üstü/kənarı
        const r = Math.max(size.x, size.z) * 0.42;
        for (const q of this.obstacles) {
          if (Math.hypot(q.x - cx, q.z - cz) < r + q.r) return;
        }
        this.obstacles.push({ x: cx, z: cz, r });
        added++;
      });
    }
    return added;
  }

  // ————— YAXIN PLAN DETALI —————
  // Yol kənarı çılpaq idi: dekor 30 m-dən uzaqda başlayırdı və sürətdə
  // "boş masa" hissi verirdi. Dərinlik məhz yaxın plandakı xırda
  // detaldan gəlir. Hamısı TƏK mesh-ə birləşir — draw call artmır.
  _scatterDecor() {
    const decorGroup = new THREE.Group();
    const half = this.track.halfWidth;
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    // ZONALAR: xəritə 3 bucaq sektoruna bölünür — hər dekor tipi öz sektoruna
    // meyllidir (65%) → dövrə boyu mühit dəyişir, "səyahət" hissi yaranır
    const sectorOf = (pos) =>
      Math.floor(((Math.atan2(pos.z, pos.x) + Math.PI) / (Math.PI * 2)) * 3) % 3;
    for (const [ri, rule] of (this.data.decor || []).entries()) {
      const homeSector = ri % 3;
      // ————— KƏND KLASTERLƏRİ: evlər tək-tək yox, 3-5-lik qruplarla —————
      if (rule.type === 'house') {
        const clusters = Math.max(1, Math.ceil(rule.count / 4));
        for (let ci = 0; ci < clusters; ci++) {
          let anchor = null;
          for (let att = 0; att < 8 && !anchor; att++) {
            const cand = this._freeSpot(16, this.track.maxRadius * 0.45, this.track.maxRadius + 40);
            if (cand && (sectorOf(cand) === homeSector || att > 4)) anchor = cand;
          }
          if (!anchor) continue;
          const n = 3 + Math.floor(Math.random() * 3);
          for (let hi = 0; hi < n; hi++) {
            const a = (hi / n) * Math.PI * 2 + Math.random() * 0.8;
            const rr = 7 + Math.random() * 9;
            const pos = new THREE.Vector3(anchor.x + Math.cos(a) * rr, 0, anchor.z + Math.sin(a) * rr);
            const near = this.track.getNearest(pos);
            if (Math.abs(near.lateral) < half + 6) continue;
            if (this.track.branches?.length && this.track.isOnBranch(pos, 6)) continue;
            // Evlər də yer yoxlamasından keçir (əvvəl yoxlamasız qoyulurdu:
            // bir-birinin və çayın içinə düşürdülər)
            if (!this._free(pos.x, pos.z, 3.2, 0.5)) continue;
            const obj = makeDecor('house');
            obj.position.copy(pos);
            // Evlər klaster mərkəzinə (meydana) baxır — kənd hissi
            obj.rotation.y = Math.atan2(anchor.x - pos.x, anchor.z - pos.z) + (Math.random() - 0.5) * 0.5;
            decorGroup.add(obj);
            this.obstacles.push({ x: pos.x, z: pos.z, r: 3.2 });
          }
        }
        continue;
      }
      // ————— DƏYİRMAN: birləşdirilmir (qanadlar fırlanır), landmark kimi tək-tək —————
      if (rule.type === 'windmill') {
        this._blades = this._blades || [];
        for (let wi = 0; wi < rule.count; wi++) {
          const pos = this._freeSpot(6, this.track.maxRadius * 0.3, this.track.maxRadius + 20);
          if (!pos || !this._free(pos.x, pos.z, 2.6, 0.5)) continue;
          const wm = makeDecor('windmill');
          wm.position.copy(pos);
          wm.rotation.y = Math.random() * Math.PI * 2;
          this.scene.add(wm);
          this._track(wm);
          const blades = wm.getObjectByName('wmblades');
          if (blades) {
            blades.userData.speed = 0.45 + Math.random() * 0.4;
            this._blades.push(blades);
          }
          this.obstacles.push({ x: pos.x, z: pos.z, r: 2.6 });
        }
        continue;
      }
      let placed = 0;
      let attempts = 0;
      while (placed < rule.count && attempts < rule.count * 16) {
        attempts++;
        let pos;
        if (rule.near) {
          // YOL BOYU səpələmə: oyunçunun gördüyü zolaq (yoldan 6–60 m) dolsun. Bərabər
          // radiuslu səpələmədə obyektlərin çoxu trekdən uzaqda itir (Riviera: R = 353 m).
          const i = Math.floor(Math.random() * this.track.N);
          const c = this.track.points[i], nn = this.track.normals[i];
          const off = (half + 6 + Math.pow(Math.random(), 1.6) * 54) * (Math.random() < 0.5 ? 1 : -1);
          pos = new THREE.Vector3(c.x + nn.x * off, 0, c.z + nn.z * off);
        } else {
          const ang = Math.random() * Math.PI * 2;
          const r = 18 + Math.random() * (this.track.maxRadius + 70);
          pos = new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
        }

        // Neon: pəncərəli şəhər binaları (zavodun binaları ayrıca işdir — bədii bibliya)
        let obj = null;
        // Riviera: şam əvəzinə palma (Kenney Nature Kit, CC0) — sahil qəsəbəsində şam yad idi
        if (rule.type === 'pine' && this.data.id === 'riviera') {
          // tək model: 190 üçbucaq ("Detailed" variantı 336 — 100 palma büdcəni aşırdı)
          obj = sharedNature().get('tree_palmTall');
        }
        // Bina: neonda pəncərəli şəhər binası, zavodda sənaye tikilisi (sex, çən, anbar)
        const bOpts = rule.type !== 'building' ? undefined
          : this.data.id === 'neon' ? { city: true } : this.data.id === 'zavod' ? { factory: true } : undefined;
        obj ||= makeDecor(rule.type, bOpts);
        // Şəhər binası miqyaslanmır: pəncərə ölçüsü bütün binalarda eyni qalsın
        const s = rule.type === 'building' && (this.data.id === 'neon' || this.data.id === 'zavod') ? 1 : 0.8 + Math.random() * 0.7;
        obj.scale.setScalar(s);
        // Obyektin üfüqi radiusu
        box.setFromObject(obj);
        box.getSize(size);
        const objR = Math.max(size.x, size.z) / 2;

        // Yoldan məsafə: yol yarım-eni + obyekt radiusu + buffer
        const near = this.track.getNearest(pos);
        if (Math.abs(near.lateral) < half + objR + 3) continue;
        // Şaxə yollarının üstünə düşməsin
        if (this.track.branches?.length && this.track.isOnBranch(pos, objR + 3)) continue;
        // Zona meyli: 65% öz sektorunda
        if (this.data.id !== 'neon' && !rule.near && sectorOf(pos) !== homeSector && Math.random() > 0.35) continue;

        // İri obyektlər üçün yer tutma yoxlaması (kiçik ot/daş klasteri
        // təbii yaxınlıqdır — yalnız r≥3 yoxlanır)
        {
          box.setFromObject(obj); box.getSize(size);
          const rr = Math.max(size.x, size.z) * 0.42;
          // Yoxlanan radius toqquşma siyahısına YAZILAN radiusla eyni olmalıdır
          // (əvvəl 0.42×ölçü yoxlanır, 0.85×objR yazılırdı → iri dekor çayın
          // üstünə düşürdü).
          const yazılan = Math.min(objR * 0.85, 40);
          if (rr >= 3 && !this._free(pos.x, pos.z, Math.max(rr, yazılan), 0.5)) continue;
          if (this._inWater(pos.x, pos.z, rr)) continue; // kiçik dekor da suya düşməsin
          // Kiçik dekor bir-birinə yaxın ola bilər, amma İRİ obyektin (təpə, mesa,
          // bina) İÇİNDƏ ola bilməz — ağac təpənin gövdəsindən çıxırdı.
          // Başqa kiçik obyektə TOXUNA bilər, amma gövdəsinə girə bilməz (≥60%
          // məsafə) — ağac şin yığınının, kol bariyerin içindən çıxırdı.
          const rk = Math.max(rr, yazılan);
          if (rr < 3 && this.obstacles.some((o) => {
            const d = Math.hypot(o.x - pos.x, o.z - pos.z);
            return d < (o.r >= 5 ? o.r + rr : (o.r + rk) * 0.62);
          })) continue;
        }
        obj.position.copy(pos);
        obj.rotation.y = Math.random() * Math.PI * 2;
        decorGroup.add(obj);
        // Hamısı toqquşma siyahısına düşür — heç nəyin içinə girmək olmaz
        this.obstacles.push({ x: pos.x, z: pos.z, r: Math.min(objR * 0.85, 40) });
        placed++;
      }
    }
    // Dekor relyefin üstünə oturur (əvvəl hamısı y = 0-da idi: trekdən uzaqda relyef
    // ±1.7 m dalğalandığı üçün ağac/ev ya havada qalır, ya torpağa batırdı)
    let düzəldi = 0;
    for (const o of decorGroup.children) {
      const gy = this._groundY(o.position.x, o.position.z) + 0.04;
      if (Math.abs(gy) > 0.15) düzəldi++;
      o.position.y += gy;
    }
    this._decorLifted = düzəldi; // test/ölçmə üçün
    // PERFORMANS: yüzlərlə dekor mesh-i material üzrə birləşdirilir
    const merged = mergeStaticGroup(decorGroup);
    // Paylaşılan (kit) modellərin həndəsəsi şablona məxsusdur — silinmir
    decorGroup.traverse((o) => { if (o.isMesh && !o.material?.userData?.shared) o.geometry?.dispose?.(); });
    this.scene.add(merged);
    this._track(merged);
  }

  // 3 dayaqlı səma: zenit → orta → ÜFÜQ İŞIQ ZOLAĞI → aşağı
  _skyTexture(p) {
    const top = p.sky;
    const bottom = p.skyBottom ?? p.sky;
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 512;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    const T = new THREE.Color(top);
    const B = new THREE.Color(bottom);
    const mid = T.clone().lerp(B, 0.55);
    // Üfüqdə açıq parıltı zolağı (günəşin havada səpələnməsi)
    const glow = B.clone().lerp(new THREE.Color(0xffffff), p.night ? 0.10 : 0.38);
    const below = B.clone().lerp(T, 0.5).multiplyScalar(0.8); // üfüq altı tündləşir
    g.addColorStop(0.0, '#' + T.getHexString());
    g.addColorStop(0.38, '#' + mid.getHexString());
    g.addColorStop(0.475, '#' + B.getHexString());
    g.addColorStop(0.5, '#' + glow.getHexString());
    g.addColorStop(0.53, '#' + B.getHexString());
    g.addColorStop(1.0, '#' + below.getHexString());
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Günəş (gündüz) və ya ay (gecə) diski + yumşaq halo
  _celestialBody(p) {
    // Günəş istiqaməti işıq mənbəyi ilə üst-üstə düşür (palette.sunDir, standart 60/110/40);
    // disk işıqdan alçaqda çəkilir (y × 0.38) — üfüqə yaxın, daha dramatik
    const sd = p.sunDir ?? [60, 110, 40];
    const dir = new THREE.Vector3(sd[0], sd[1] * 0.38, sd[2]).normalize();
    const pos = dir.multiplyScalar(700);
    // Qrup kameranı izləyir (GameplayScene): günəş "sonsuz uzaqda" qalır. Əvvəl mərkəzdən
    // 700 m-də sabit dururdu — trekin kənarından baxanda işıq istiqamətindən 20–30°
    // sürüşür, sudakı parıltı diskin altına düşmürdü.
    const sky = new THREE.Group();
    this.scene.add(sky);
    this._track(sky);
    this.celestial = sky;
    const k = p.sunSize ?? 1; // disk və halələrin miqyası
    const night = !!p.night;
    const discColor = night
      ? 0xdfe8ff
      : (p.sunDisc ?? new THREE.Color(p.sun ?? 0xffe6b0).lerp(new THREE.Color(0xffffff), 0.35).getHex());

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry((night ? 30 : 44) * k, 40),
      new THREE.MeshBasicMaterial({ color: discColor, fog: false, depthWrite: false })
    );
    disc.position.copy(pos);
    disc.lookAt(0, 0, 0);
    sky.add(disc);

    // Halo — radial qradiyent sprite (additiv)
    const hc = document.createElement('canvas');
    hc.width = hc.height = 128;
    const hctx = hc.getContext('2d');
    const hg = hctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    const haloCol = new THREE.Color(discColor);
    hg.addColorStop(0, 'rgba(' + Math.round(haloCol.r * 255) + ',' + Math.round(haloCol.g * 255) + ',' + Math.round(haloCol.b * 255) + ',' + (night ? 0.35 : 0.55) + ')');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    hctx.fillStyle = hg;
    hctx.fillRect(0, 0, 128, 128);
    const haloTex = new THREE.CanvasTexture(hc);
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry((night ? 90 : 150) * k, 32),
      new THREE.MeshBasicMaterial({
        map: haloTex, transparent: true, fog: false, depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    halo.position.copy(pos.clone().multiplyScalar(0.985));
    halo.lookAt(0, 0, 0);
    sky.add(halo);

    // İkinci, daha geniş və zəif halo — "hava işıqlanması" dərinliyi
    const halo2 = new THREE.Mesh(
      new THREE.CircleGeometry((night ? 150 : 300) * k, 32),
      new THREE.MeshBasicMaterial({
        map: haloTex, transparent: true, opacity: 0.4, fog: false, depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    halo2.position.copy(pos.clone().multiplyScalar(0.97));
    halo2.lookAt(0, 0, 0);
    sky.add(halo2);
  }

  // Gecə səmasında ulduzlar — tək draw call
  _stars() {
    const n = 450;
    const verts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // Yuxarı yarımkürə üzərində təsadüfi nöqtələr
      const a = Math.random() * Math.PI * 2;
      const y = 0.12 + Math.random() * 0.88; // üfüqdən yuxarı
      const r = Math.sqrt(1 - y * y);
      verts[i * 3] = Math.cos(a) * r * 740;
      verts[i * 3 + 1] = y * 740;
      verts[i * 3 + 2] = Math.sin(a) * r * 740;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xcfdcff, size: 2.1, sizeAttenuation: false,
      fog: false, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    this.scene.add(stars);
    this._track(stars);
  }

  _gradientTexture(top, bottom) {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    const mid = new THREE.Color(top).lerp(new THREE.Color(bottom), 0.5);
    g.addColorStop(0, '#' + new THREE.Color(top).getHexString());
    g.addColorStop(0.55, '#' + mid.getHexString());
    g.addColorStop(1, '#' + new THREE.Color(bottom).getHexString());
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _track(o) {
    this.objects.push(o);
  }

  dispose() {
    for (const o of this.objects) {
      this.scene.remove(o);
      o.traverse?.((n) => {
        // İşığın kölgə xəritəsi (2048²) obyektlə birlikdə azad olunmurdu
        if (n.isLight) { n.shadow?.map?.dispose(); n.dispose?.(); }
        if (n.geometry) n.geometry.dispose();
        if (n.material) {
          const mats = Array.isArray(n.material) ? n.material : [n.material];
          mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
    }
    this._envRT?.dispose();
    this.scene.environment = null;
    this.scene.background = null;
    this.scene.fog = null;
    this.objects = [];
  }
}
