import { formatTime } from '../race/RaceManager.js';
import { updateRecords } from '../data/records.js';
import { auth } from '../net/Auth.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const MEDAL = { 1: 'gold', 2: 'silver', 3: 'bronze' };

// Yarış nəticəsi ekranı.
import { t } from '../core/i18n.js';

export class Results {
  constructor(root, { standings, thumbs = {}, onRestart, onMenu, restartLabel = null, menuLabel = null, config = null }) {
    this.root = root;
    this.thumbs = thumbs;
    this.config = config;
    this.restartLabel = restartLabel || t('ui.again');
    this.menuLabel = menuLabel || t('ui.menu');
    this.render(standings, onRestart, onMenu);
  }

  render(standings, onRestart, onMenu) {
    const player = standings.find((r) => r.isPlayer);
    const pos = player ? player.position : '-';
    const title = pos === 1 ? t('fb.win') : pos <= 3 ? t('res.podium') : t('res.title');
    const winner = standings.find((r) => r.position === 1 && r.finishTime != null);

    // SƏNİN YARIŞIN: dövrə vaxtları, ən yaxşı dövrə, şəxsi rekord (bu cihazda saxlanır)
    let laps = '';
    if (player?.lapTimes?.length && this.config?.mode === 'race') {
      const rec = updateRecords(this.config.trackId, this.config.laps ?? player.lapTimes.length, player.lapTimes, player.finishTime);
      if (rec) {
        const chips = player.lapTimes.map((v, i) => `
          <div class="laps__chip ${i === rec.bestLapIdx ? 'is-best' : ''}"><span>${t('res.lap', { n: i + 1 })}</span><b>${formatTime(v)}</b></div>`).join('');
        const lapRec = rec.newLap
          ? `<span class="laps__new">${t('res.newLapRecord')}</span>${rec.prevLap != null ? `<small>${t('res.was', { v: formatTime(rec.prevLap) })}</small>` : ''}`
          : `<span>${t('res.lapRecord')}</span> <b>${formatTime(rec.prevLap)}</b>`;
        const raceRec = rec.newRace
          ? `<span class="laps__new">${t('res.newRaceRecord')}</span>${rec.prevRace != null ? `<small>${t('res.was', { v: formatTime(rec.prevRace) })}</small>` : ''}`
          : rec.prevRace != null ? `<span>${t('res.raceRecord')}</span> <b>${formatTime(rec.prevRace)}</b>` : '';
        laps = `
          <div class="laps">
            <div class="laps__chips">${chips}</div>
            <div class="laps__recs"><div>${lapRec}</div>${raceRec ? `<div>${raceRec}</div>` : ''}</div>
            <div class="laps__board" data-board></div>
          </div>`;
        this._board = { track: this.config.trackId, laps: this.config.laps ?? player.lapTimes.length, lap: rec.bestLap, race: player.finishTime };
      }
    }

    const rows = standings.map((r) => {
      const icon = this.thumbs[r.model]
        ? `<img class="results__car" src="${this.thumbs[r.model]}" alt="" draggable="false" />`
        : `<span class="mini-chip" style="background:${hex(r.color)}"></span>`;
      return `
      <div class="results__row ${r.isPlayer ? 'is-player' : ''}">
        <div class="results__pos ${MEDAL[r.position] || ''}">${r.position}</div>
        <div class="results__name">
          ${icon}
          ${r.name}${r.isPlayer ? ` <small style="color:var(--muted)">(${t('res.you')})</small>` : ''}
        </div>
        <div class="results__time">${formatTime(r.finishTime)}${winner && r !== winner && r.finishTime != null ? `<small>+${(r.finishTime - winner.finishTime).toFixed(2)}</small>` : ''}</div>
      </div>`;
    }).join('');

    this.root.innerHTML = `
      <div class="screen">
        <div class="screen__scroll">
          <div class="screen__heading">${title}<small>${pos === '-' ? '' : t('res.place', { p: pos, n: standings.length })}${player?.score ? ' · ⚡ ' + t('res.pts', { n: player.score }) : ''}${player?.goldEarned ? ' · <b class="gold-earn">🪙+' + player.goldEarned + '</b>' : ''}</small>${player?.goldMissed ? '<div class="gold-nudge">🪙 ' + t('res.goldMissed', { n: player.goldMissed }) + '</div>' : ''}</div>
          ${laps}
          <div class="results">${rows}</div>
          <div class="btn-row">
            <button class="btn btn--primary" data-restart>${this.restartLabel}</button>
            <button class="btn btn--ghost" data-menu>${this.menuLabel}</button>
          </div>
        </div>
      </div>`;
    this._loadBoard();
    this.root.querySelector('[data-restart]').onclick = onRestart;
    this.root.querySelector('[data-menu]').onclick = onMenu;
  }

  // TREK CƏDVƏLİ: hesabla oynayanın nəticəsi serverə gedir, sonra trekin ən yaxşı 3 dövrəsi və
  // oyunçunun yeri göstərilir. Şəbəkə yoxdursa sətir sadəcə görünmür — nəticə ekranı gözləmir.
  async _loadBoard() {
    const B = this._board;
    const el = this.root.querySelector('[data-board]');
    if (!B || !el) return;
    try {
      const rank = auth.isLoggedIn ? await auth.submitRecord(B.track, B.laps, B.lap, B.race) : null;
      const { top, me } = await auth.trackTop(B.track);
      if (!el.isConnected || !top?.length) return;
      const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const myNick = auth.profile?.nick;
      const list = top.slice(0, 3).map((r, i) => `<span class="${r.nick === myNick ? 'is-me' : ''}">${i + 1}. ${esc(r.nick)} <b>${formatTime(r.lap)}</b></span>`).join('');
      const place = rank ?? me?.rank;
      const mine = auth.isLoggedIn
        ? (place ? `<em>${t('res.yourRank', { n: place })}</em>` : '')
        : `<em>${t('res.loginForBoard')}</em>`;
      el.innerHTML = `<i>${t('res.trackTop')}</i>${list}${mine}`;
      el.classList.add('is-on');
    } catch { /* cədvəl alınmadı — göstərilmir */ }
  }

  destroy() {
    this.root.innerHTML = '';
  }
}
