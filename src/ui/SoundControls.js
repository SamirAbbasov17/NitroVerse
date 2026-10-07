import { audio } from '../core/AudioManager.js';
import { t } from '../core/i18n.js';

// Səs ayarları bloku: Musiqi / Effektlər sürgüləri + səsi bağla. Menyunun 🔊 pəncərəsində və
// bütün rejimlərin pauza menyusunda eyni blok işlədilir.
export function soundControlsHTML() {
  const pct = (v) => Math.round(v * 100);
  return `
    <div class="snd-box">
      <label class="snd-row"><span>🎵 ${t('snd.music')}</span><input type="range" min="0" max="100" step="5" value="${pct(audio.vol.music)}" data-vol="music"><b>${pct(audio.vol.music)}</b></label>
      <label class="snd-row"><span>💥 ${t('snd.fx')}</span><input type="range" min="0" max="100" step="5" value="${pct(audio.vol.fx)}" data-vol="fx"><b>${pct(audio.vol.fx)}</b></label>
      <button class="btn snd-box__mute" data-mute>${audio.muted ? '🔊 ' + t('snd.unmute') : '🔇 ' + t('snd.mute')}</button>
    </div>`;
}

// onMute(muted) — çağıran öz ikonunu yeniləsin deyə
export function bindSoundControls(root, onMute = null) {
  if (!root) return;
  let tm = 0;
  root.querySelectorAll('[data-vol]').forEach((el) => {
    el.oninput = () => {
      audio.resume();
      audio.setVolume(el.dataset.vol, el.value / 100);
      el.nextElementSibling.textContent = el.value;
      // effekt səviyyəsini eşitmək üçün qısa səs (sürüşdürmə bitəndə bir dəfə)
      if (el.dataset.vol === 'fx') { clearTimeout(tm); tm = setTimeout(() => audio.sfx('pickup'), 120); }
    };
  });
  const mb = root.querySelector('[data-mute]');
  if (mb) {
    mb.onclick = () => {
      const m = audio.toggleMute();
      mb.textContent = m ? '🔊 ' + t('snd.unmute') : '🔇 ' + t('snd.mute');
      const fb = document.getElementById('mute-btn');
      if (fb) fb.textContent = m ? '🔇' : '🔊';
      onMute?.(m);
    };
  }
}
