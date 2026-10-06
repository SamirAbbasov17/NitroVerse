import { test } from '@playwright/test';
import { MODES, boot, startMode, autopilot, mergeJson } from './helpers.js';

// Səhnə profili: görünən mesh-lər material/həndəsə növünə görə qruplaşdırılır — draw call və
// üçbucağın HARADAN gəldiyini göstərir (optimallaşdırmadan əvvəl bax). Heç nə təsdiqləmir.
//   MODE=zen npx playwright test tests/scene-profile.spec.js
const want = process.env.MODE || 'zen';

test(`profil: ${want}`, async ({ page }) => {
  test.setTimeout(120_000);
  const m = MODES.find((x) => x.name === want);
  await boot(page);
  await startMode(page, m.config);
  await autopilot(page, true);
  await page.waitForTimeout(12_000);
  const r = await page.evaluate(() => {
    const sc = window.__active, T = window.__THREE;
    const fr = new T.Frustum();
    sc.camera.updateMatrixWorld();
    fr.setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(sc.camera.projectionMatrix, sc.camera.matrixWorldInverse));
    const groups = {};
    let calls = 0, tris = 0;
    sc.scene.traverseVisible((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      if (o.isMesh && o.frustumCulled !== false) {
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        if (!fr.intersectsObject(o)) return;
      }
      const g = o.geometry;
      const n = g ? ((g.index ? g.index.count : g.attributes.position?.count || 0) / 3) * (o.isInstancedMesh ? o.count : 1) : 0;
      // qrup açarı: ən yaxın adlı valideyn və ya tip
      let p = o, name = '';
      for (let k = 0; k < 6 && p; k++, p = p.parent) { if (p.name) { name = p.name; break; } }
      const mats = Array.isArray(o.material) ? o.material.length : 1;
      const key = `${name || o.type}|${g?.type || '-'}|${o.material?.type || '-'}`;
      const e = (groups[key] ||= { calls: 0, tris: 0 });
      e.calls += mats; e.tris += Math.round(n);
      calls += mats; tris += Math.round(n);
    });
    // Birləşdirilmiş (adsız) mesh-lərin material xülasəsi: neçə fərqli rəng/tekstura var
    const mats = {};
    sc.scene.traverseVisible((o) => {
      if (!o.isMesh || o.name || o.geometry?.type !== 'BufferGeometry' || !o.material?.isMeshStandardMaterial) return;
      const m = o.material;
      const k = `${m.map ? 'tex' : m.emissiveMap ? 'emap' : (m.emissive?.getHex() ? 'emis' : 'flat')}|${m.vertexColors ? 'vc' : '-'}|${m.transparent ? 'tr' : '-'}|${o.receiveShadow ? 'rs' : '-'}|${o.castShadow ? 'cs' : '-'}`;
      mats[k] = (mats[k] || 0) + 1;
    });
    const top = Object.entries(groups).sort((a, b) => b[1].calls - a[1].calls).slice(0, 22).map(([k, v]) => ({ k, ...v }));
    const topTris = Object.entries(groups).sort((a, b) => b[1].tris - a[1].tris).slice(0, 8).map(([k, v]) => ({ k, ...v }));
    return { calls, tris, top, topTris, mats, info: { calls: sc.renderer.info.render.calls, tris: sc.renderer.info.render.triangles } };
  });
  mergeJson('scene-profile.json', want, r);
  console.log(`${want}: görünən obyekt ${r.calls} çağırış · ${r.tris} üçbucaq`);
  console.log('— çağırışa görə —');
  for (const e of r.top) console.log(`${String(e.calls).padStart(4)}  ${String(e.tris).padStart(7)}  ${e.k}`);
  console.log('— birləşdirilmiş mesh-lərin növləri —', JSON.stringify(r.mats));
  console.log('— üçbucağa görə —');
  for (const e of r.topTris) console.log(`${String(e.calls).padStart(4)}  ${String(e.tris).padStart(7)}  ${e.k}`);
});
