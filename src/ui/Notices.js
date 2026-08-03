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
      if (n._text === text) return n;
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
    this.el.appendChild(n);
    // Yığın böyüməsin: maksimum 3 bildiriş
    while (this.el.children.length > 3) this.dismiss(this.el.firstChild);
    n._timer = setTimeout(() => this.dismiss(n), life * 1000);
    return n;
  }

  dismiss(n) {
    if (!n || !n.parentNode) return;
    clearTimeout(n._timer);
    n.classList.add('notice--out');
    setTimeout(() => n.remove(), 250);
  }
}
