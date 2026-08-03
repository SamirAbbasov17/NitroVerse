# NitroVerse — Böyük Genişlənmə Yol Xəritəsi
## Prinsiplər (pozulmaz)
1. **Mövcud heç nə sınmır** — hər faza ayrıca deploy + tam reqressiya testi (desktop, mobil, onlayn).
2. **Mobil birinci dərəcəli** — hər yeni UI/mexanika toxunma idarəsi və kiçik ekranla birlikdə dizayn olunur.
3. **Performans büdcəsi**: 60 FPS desktop / axıcı mobil; işıq sayı sabit; statiklər merged/instanced;
   dinamiklər pool-lanmış; postprocessing yox.

---

## FAZA A — Təməl: Rejim Çərçivəsi + Hesab Sistemi ✅ HAZIR (deploy olunub)
*Hər şey bunun üstündə dayanır — birinci gəlir.*

### A1. Rejim (mode) arxitekturası
- `GameplayScene` parçalanır: ortaq nüvə (maşın fizikası, effektlər, audio, şəbəkə, HUD bazası) +
  rejim plaginləri: `RaceMode` (mövcud), `EndlessMode`, `FootballMode`, `ArenaMode`.
- Şəbəkə protokolu genişlənir (v10): `go{mode, ...}`; rejimə görə hadisə dəstləri.
- Lobbidə rejim seçimi (host seçir): Yarış · Futbol · Arena.

### A2. Login + qonaq sistemi
- **Tövsiyə**: Supabase (pulsuz tier) — hazır auth (email/nickname), profil + qızıl DB-də.
  Alternativ: Netlify Blobs üzərində öz sadə hesab sistemimiz (nickname+PIN) — sıfır yeni servis,
  amma təhlükəsizlik/miqyas zəifdir. Qərarı Faza A başlanğıcında veririk.
- **Qonaq rejimi**: localStorage profili; 3-5 başlanğıc maşın; bütün rejimlər dostlarla arcade
  qaydada oynanıla bilir; qızıl yalnız lokal saxlanılır (hesaba keçəndə köçürülə bilər).
- UI: giriş ekranı (Qonaq kimi davam et / Hesab), profil paneli menyuda.

### A3. Qızıl iqtisadiyyatı (skelet)
- Qazanc: yarış mövqeyi, futbol qolu/qələbəsi, arena yeri, free drive məsafə mərhələləri.
- Xərc: maşınlar, xəritələr (Zavod?), kosmetika. Balans cədvəli ayrıca sənəddə.
- Server-yüngül validasiya (tavanlar, ağlabatan sürət yoxlamaları) — kazual oyun üçün yetərli.

---

## FAZA B — Free Drive 2.0: "Slowroads" Zen Rejimi ✅ HAZIR (deploy olunub)
*Tam yenidən: xəritə seçimi yoxdur, sonsuz yol, ability yoxdur.*

### B1. Sonsuz prosedural yol
- Chunk sistemi: qabaqda ~300 m-lik yol parçaları noise-əsaslı əyriliklə generasiya olunur,
  arxadakılar silinir (yaddaş sabit). Mövcud ribbon/curb qurucusu təkrar istifadə olunur.
- Landşaft biomları bir-birinə **axıcı keçir** (səhra → alp → sahil → kanyon...): palitra
  lerp-i (səma/duman/yer) + biom dekoru chunk-a görə (mövcud assetlər + yeni əlavələr).

### B2. Dinamik hava + gün dövrü
- Gün/axşam/gecə dövrü: günəş mövqeyi + palitra lerp-i (ucuz — mövcud grading üstündə).
- Hava: aydın → dumanlı → yağış (instanced xətt hissəcikləri + tünd palitra + "yaş yol"
  parıltı hissi) → qar (biomda). Keçidlər tədricən.

### B3. Lofi musiqi + retro filtr
- AudioManager-ə **lofi generatoru**: 70-80 BPM, cazvari akkordlar, yumşaq klavişlər, vinil
  cızıltısı; 3-4 fərqli "trek"; HUD-da ⏭ düyməsi ilə növbəti trekə keçid (mobildə də).
- Retro filtr: CSS qat — yüngül sepia/kontrast + incə scanline + güclü vignette (desktop);
  mobildə yüngül variant (yalnız qradasiya). Açıb-bağlamaq olur.

### B4. Zen HUD + xal
- Yuxarıda sadəcə artan **məsafə xalı** (+sürət bonusu), heç bir yarış elementi yox.
- Qızıl: məsafə mərhələlərində (5 km, 10 km...).

---

## FAZA C — "ZAVOD" Xəritəsi: Təhlükəli Yarış ✅ HAZIR (deploy olunub)
- **Vizual**: sənaye palitra (beton, pas, neon-sarı xəbərdarlıq zolaqları), borular, bacalar,
  kranlar, konteynerlər, qığılcım effektləri — detal sıxlığı yüksək.
- **Lazerlər və maneələr**: yolu kəsən lazer qapıları (vaxtlı yanıb-sönmə/süpürmə), porşenlər,
  hərəkətli konteynerlər. Hamısı **deterministik taymer** üzərində (yarış saatına bağlı) —
  onlaynda hamıda eyni, şəbəkə trafiki sıfır.
- **Can (HP) sistemi — yalnız bu xəritədə**: hər maşının 100 canı; lazer −25, ağır maneə −10;
  0 olanda partlayış → son yol nöqtəsində avtomatik respawn + qısa toxunulmazlıq.
- HUD-da can zolağı; mobil yerləşimi nəzərə alınır.

---

## FAZA D — Futbol Rejimi (3v3, Rocket League ruhu) ✅ HAZIR (deploy olunub)
- **Top fizikası**: sadə sfera (sıçrayış, sürtünmə, divar/yer əksi) + maşın-top impuls toqquşması.
- **Arena**: qapalı meydan, iki qapı (göy/qırmızı), tribunalar, işıqlar.
- **Mexanika**: ability YOX; vaxtaşırı dolan **nitro** + cooldown-lu **irəli atılma (lunge)**
  zərbəsi (E/toxunma düyməsi). Qol → kickoff sıfırlanması, matç taymeri, hesab HUD.
- **Komandalar**: lobbidə göy/qırmızı seçimi; çatışmayan yerləri **botlar** doldurur
  (rol əsaslı sadə AI: hücumçu topa, müdafiəçi qapıya).
- **Onlayn**: top + botlar **host-da** simulyasiya olunur, 15-20 Hz yayım + interpolyasiya
  (maşınlar indiki kimi öz müştərisində). Qolu host təsdiqləyir.

---

## FAZA E — Arena Rejimi (Battle Royale) ✅ HAZIR (deploy olunub)
- **Arena xəritəsi**: örtülü/açıq döyüş meydanı, sığınacaq maneələri, mərkəz + kənar zonalar.
- **Mexanika**: hər maşının canı (100); ability-lər arenada **random nöqtələrdə spawn olur**
  (host seed-i ilə sinxron); dəymələr can aparır (raket 35, şimşək 25, üçlü 10, mina 40).
- Can 0 → eliminasiya (tamaşaçı rejimi); **axırda qalan qalibdir**. Matçı uzatmamaq üçün
  müəyyən vaxtdan sonra kənardan daralan zərər zonası.
- Botlar boş yerləri doldurur (offline solo da oynanılır).

---

## FAZA F — Maşın Parkı + Qaraj/Mağaza ✅ HAZIR (8 yeni rəngli variant, deploy olunub)
- **+15-25 yeni model**: Kenney + Quaternius CC0 paketlərindən (rəngarəng, fərqli siniflər);
  mövcud thumbnail konveyeri ilə avtomatik önizləmə; stat balansı eyni büdcə qaydası ilə.
- **Qaraj UI**: kolleksiya ekranı, kilidli maşınlar qızılla açılır; qonaq 3-5 maşın görür.
- Kosmetika (perspektiv): rəng variantları, drift izi rəngləri, ad etiketi stilləri.

---

## FAZA G — Oyunçunu Bağlayan Qat (Retention) ✅ ƏSAS HİSSƏ HAZIR (günlük mükafat + liderlər cədvəli; ghost/tapşırıqlar gələcək üçün)
- **Günlük mükafat** (ardıcıl giriş bonusu) + **günlük tapşırıqlar** ("kanyonda 3 qısayol",
  "futbolda 2 qol", "10 km zen sürüşü") → qızıl.
- **Həftəlik liderlövhələr**: xəritə üzrə ən yaxşı dövrə, arena qələbələri, futbol qolları.
- **Ən yaxşı dövrə ghost-u**: öz rekordunla yarış (tək oyunçu üçün ən güclü qarmaq).
- Səviyyə/XP + titullar (ad etiketində görünür), nailiyyətlər.
- Dost dəvəti linki (otağa birbaşa qoşulma dərin linki).

---

## İcra ardıcıllığı və asılılıqlar
```
A (təməl) ──► B (zen free drive)
   │
   ├────────► C (zavod + HP)  ──► E (arena — HP sistemini paylaşır)
   │
   └────────► D (futbol)      ──► F (maşın parkı) ──► G (retention)
```
- Hər faza sonunda: tam QA sweep (desktop+mobil+onlayn), FPS reqressiya, deploy.
- Şəbəkə dəyişən fazalarda protokol versiyası artırılır (köhnə client qarışmasın).

## Risklər / qərar nöqtələri
| Mövzu | Risk | Plan |
|---|---|---|
| Auth backend | Blobs DB kövrəkdir | Supabase tövsiyə; A başlanğıcında qərar |
| Top fizikası onlaynda | host lag hissi | interpolyasiya + kickoff sinxron testləri |
| Sonsuz yolda yaddaş | chunk sızmaları | dispose testləri, uzun-sürüş soak testi |
| HP + lazer onlayn | desinxron | deterministik taymerlər, seed sinxronu |
| Qızıl fırıldağı | client hesabatı | tavanlar + server sanity yoxlamaları |
