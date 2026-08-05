// ————— RELYEF İŞÇİSİ (Web Worker) —————
// Yer torunun 17 161 vertexi üçün hündürlük + vertex rəngi hesablayır.
// Əsas mövzuda (main thread) bu iş kadr vaxtını 16 → 30-40 ms-ə qaldırırdı;
// burada tamamilə paralel işləyir və nəticə transferable buferlə qayıdır.
//
// DİQQƏT: bu fayl EndlessRoad.js-i İMPORT ETMİR (THREE-ni işçiyə çəkməmək
// üçün). terrainY/groundYAt düsturları eynidir — dəyişəndə HƏR İKİSİ
// yenilənməlidir (yoxsa maşın ilə görüntü arasında fərq yaranar).

const WATER_LEVEL = 0.9;
const CUT_IN = 20, CUT_OUT = 34;

function terrainY(x, z) {
  const a = Math.sin(x * 0.0041 + 1.3) * Math.cos(z * 0.0036 - 0.7);
  const b = Math.sin((x + z * 0.7) * 0.0091 + 2.1);
  const c = Math.sin(x * 0.0195 - 0.4) * Math.sin(z * 0.0168 + 1.1);
  return a * 12 + b * 8 + c * 3.2 + 11;
}

function groundYAt(x, z, roadY, dist) {
  const y = terrainY(x, z);
  if (roadY == null || roadY >= y || dist >= CUT_OUT) return y;
  const k = dist <= CUT_IN ? 1 : 1 - (dist - CUT_IN) / (CUT_OUT - CUT_IN);
  const s = k * k * (3 - 2 * k);
  return y * (1 - s) + (roadY - 0.35) * s;
}

self.onmessage = (e) => {
  const { id, gx, gz, px, py, pz, localX, localY, baseColor, CELL } = e.data;
  const n = localX.length;
  const h = new Float32Array(n);
  const col = new Float32Array(n * 3);

  // Yol nöqtələrini xanalara yığ (əsas mövzudakı ilə eyni məntiq)
  const cells = new Map();
  for (let i = 0; i < px.length; i++) {
    const k = Math.floor(px[i] / CELL) + '|' + Math.floor(pz[i] / CELL);
    let arr = cells.get(k);
    if (!arr) { arr = []; cells.set(k, arr); }
    arr.push(i);
  }

  for (let v = 0; v < n; v++) {
    const wx = gx + localX[v];
    const wz = gz - localY[v];
    let bd = Infinity, by = 0, bi = -1;
    const cx = Math.floor(wx / CELL), cz = Math.floor(wz / CELL);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const arr = cells.get((cx + a) + '|' + (cz + b));
        if (!arr) continue;
        for (let q = 0; q < arr.length; q++) {
          const i = arr[q];
          const dx = wx - px[i], dz = wz - pz[i];
          const d2 = dx * dx + dz * dz;
          if (d2 < bd) { bd = d2; by = py[i]; bi = i; }
        }
      }
    }
    // Seqment proyeksiyası — mailli hissədə dəqiq yol hündürlüyü
    if (bi >= 0) {
      for (const j of [bi - 1, bi]) {
        if (j < 0 || j + 1 >= px.length) continue;
        const ex = px[j + 1] - px[j], ez = pz[j + 1] - pz[j];
        const L2 = ex * ex + ez * ez;
        if (L2 < 1e-6) continue;
        let t = ((wx - px[j]) * ex + (wz - pz[j]) * ez) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = px[j] + ex * t, qz = pz[j] + ez * t;
        const d2 = (wx - qx) * (wx - qx) + (wz - qz) * (wz - qz);
        if (d2 < bd) { bd = d2; by = py[j] + (py[j + 1] - py[j]) * t; }
      }
    }
    h[v] = groundYAt(wx, wz, bd < CUT_OUT * CUT_OUT ? by : null, Math.sqrt(bd));

    // Vertex rəngi — iri miqyaslı, təkrarlanmayan ləkələr
    const n1 = Math.sin(wx * 0.050 + 0.7) * Math.cos(wz * 0.044 - 1.2);
    const n2 = Math.sin((wx * 0.7 + wz) * 0.081 + 2.4);
    const n3 = Math.sin(wx * 0.118 - wz * 0.093 + 4.1);
    const k = 0.978 + (n1 * 0.5 + n2 * 0.3 + n3 * 0.2) * 0.036;
    const warm = 1 + n2 * 0.014;
    col[v * 3] = k * warm;
    col[v * 3 + 1] = k;
    col[v * 3 + 2] = k * (2 - warm);
  }

  self.postMessage({ id, gx, gz, h, col }, [h.buffer, col.buffer]);
};
