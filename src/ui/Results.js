import { formatTime } from '../race/RaceManager.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const MEDAL = { 1: 'gold', 2: 'silver', 3: 'bronze' };

// Yarış nəticəsi ekranı.
import { t } from '../core/i18n.js';

export class Results {
  constructor(root, { standings, thumbs = {}, onRestart, onMenu, restartLabel = null, menuLabel = null }) {
    this.root = root;
    this.thumbs = thumbs;
    this.restartLabel = restartLabel || t('ui.again');
    this.menuLabel = menuLabel || t('ui.menu');
    this.render(standings, onRestart, onMenu);
  }

  render(standings, onRestart, onMenu) {
    const player = standings.find((r) => r.isPlayer);
    const pos = player ? player.position : '-';
    const title = pos === 1 ? t('fb.win') : pos <= 3 ? '🎉 Podium!' : t('res.title');

    const rows = standings.map((r) => {
      const icon = this.thumbs[r.model]
        ? `<img class="results__car" src="${this.thumbs[r.model]}" alt="" draggable="false" />`
        : `<span class="mini-chip" style="background:${hex(r.color)}"></span>`;
      return `
      <div class="results__row ${r.isPlayer ? 'is-player' : ''}">
        <div class="results__pos ${MEDAL[r.position] || ''}">${r.position}</div>
        <div class="results__name">
          ${icon}
          ${r.name}${r.isPlayer ? ' <small style="color:var(--muted)">(Sən)</small>' : ''}
        </div>
        <div class="results__time">${formatTime(r.finishTime)}</div>
      </div>`;
    }).join('');

    this.root.innerHTML = `
      <div class="screen">
        <div class="screen__scroll">
          <div class="screen__heading">${title}<small>${pos === '-' ? '' : pos + '-ci yer / ' + standings.length}${player?.score ? ' · ⚡ ' + player.score + ' xal' : ''}${player?.goldEarned ? ' · <b class="gold-earn">🪙+' + player.goldEarned + '</b>' : ''}</small>${player?.goldMissed ? '<div class="gold-nudge">🪙 Hesabla ' + player.goldMissed + ' qızıl qazanardın — menyudan qeydiyyatdan keç!</div>' : ''}</div>
          <div class="results">${rows}</div>
          <div class="btn-row">
            <button class="btn btn--primary" data-restart>${this.restartLabel}</button>
            <button class="btn btn--ghost" data-menu>${this.menuLabel}</button>
          </div>
        </div>
      </div>`;
    this.root.querySelector('[data-restart]').onclick = onRestart;
    this.root.querySelector('[data-menu]').onclick = onMenu;
  }

  destroy() {
    this.root.innerHTML = '';
  }
}
