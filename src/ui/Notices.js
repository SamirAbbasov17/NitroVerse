// Qlobal bildiriş zolağı — ekranın yuxarısında, UI-dan asılı olmayaraq
// (document.body-yə qoşulur ki, səhnə dəyişəndə silinməsin).
// show({icon, text, actions:[{label, primary, onClick}], life}) → element.
export class Notices {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'notices';
    document.body.appendChild(this.el);
  }

  show({ icon = '', text = '', actions = [], life = 8 }) {
    // İkon ayrıca xanada göstərilir — mətn də eyni emoji ilə başlayırsa
    // ekranda iki ikon görünürdü (tərcümələrdə rast gəlinirdi).
    if (icon && text.startsWith(icon)) text = text.slice(icon.length).trimStart();
    // Eyni mətnli bildiriş təkrarlanmasın
    for (const n of this.el.children) {
      if (n._text === text && !n._out) return n;
    }
    const n = document.createElement('div');
    n.className = 'notice';
    n._text = text;
    const btns = actions.map((a, i) =>
      `<button class="notice__btn ${a.primary ? 'notice__btn--pri' : ''}" data-i="${i}">${a.label}</button>`
    ).join('');
    n.innerHTML = `
      <span class="notice__icon">${icon}</span>
      <span class="notice__text"></span>
      ${btns ? `<span class="notice__btns">${btns}</span>` : ''}`;
    n.querySelector('.notice__text').textContent = text;
    n.querySelectorAll('.notice__btn').forEach((b) => {
      b.onclick = () => {
        this.dismiss(n);
        actions[+b.dataset.i]?.onClick?.();
      };
    });
    // MÜDDƏT: bildiriş məlumat verib tez getməlidir — düyməsiz 3 s (uzun mətn 3.5 s), cavab gözləyən
    // (düyməli) ən çox 8 s. Gözləmək də məcburi deyil: toxunuş və ya yana/yuxarı sürüşdürmə bağlayır.
    life = actions.length ? Math.min(life, 8) : (text.length > 70 ? 3.5 : 3);
    this._swipe(n);
    this.el.appendChild(n);
    // Yığın böyüməsin: maksimum 3 bildiriş
    // (dismiss elementi 250 ms sonra silir — `while (children.length > 3)` heç vaxt bitmirdi və
    // 4-cü bildirişdə səhifə donurdu; indi yalnız hələ çıxmayanlar sayılır, dövr yoxdur)
    const live = [...this.el.children].filter((c) => !c._out);
    for (const old of live.slice(0, Math.max(0, live.length - 3))) this.dismiss(old);
    n._timer = setTimeout(() => this.dismiss(n), life * 1000);
    return n;
  }

  // Sürüşdürüb bağlama: barmaq/siçan bildirişi yana və ya yuxarı çəkir; 48 px-dən çox çəkilibsə gedir,
  // azdırsa yerinə qayıdır. Yerində toxunuş (sürüşdürməsiz) də bağlayır; düymələr öz işini görür.
  _swipe(n) {
    let x0 = 0, y0 = 0, on = false, dx = 0, dy = 0;
    n.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.notice__btn')) return;
      on = true; x0 = e.clientX; y0 = e.clientY; dx = dy = 0;
      n.setPointerCapture?.(e.pointerId);
      n.style.transition = 'none';
    });
    n.addEventListener('pointermove', (e) => {
      if (!on) return;
      dx = e.clientX - x0; dy = Math.min(0, e.clientY - y0);
      const up = Math.abs(dy) > Math.abs(dx);
      n.style.transform = up ? `translateY(${dy}px)` : `translateX(${dx}px)`;
      n.style.opacity = String(Math.max(0.25, 1 - Math.max(Math.abs(dx), Math.abs(dy)) / 160));
    });
    const end = () => {
      if (!on) return; on = false;
      const far = Math.max(Math.abs(dx), Math.abs(dy));
      n.style.transition = '';
      if (far > 48 || far < 6) {
        // çəkildiyi səmtə uçub gedir (toxunuşda — adi sönmə)
        if (far > 48) n.style.transform = Math.abs(dy) > Math.abs(dx) ? 'translateY(-80px)' : `translateX(${Math.sign(dx) * 110}%)`;
        n.style.opacity = '0';
        this.dismiss(n, far > 48);
      } else { n.style.transform = ''; n.style.opacity = ''; }
    };
    n.addEventListener('pointerup', end);
    n.addEventListener('pointercancel', end);
  }

  dismiss(n, flown = false) {
    if (!n || !n.parentNode || n._out) return;
    n._out = true;
    clearTimeout(n._timer);
    if (!flown) n.classList.add('notice--out');
    setTimeout(() => n.remove(), 250);
  }
}
