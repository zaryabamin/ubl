// Homepage: account carousel + mobile nav
const ICONS = {
  freelancer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M2 20h20M9 9l-2 2 2 2M15 9l2 2-2 2"/></svg>',
  asaan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12h6M12 9l3 3-3 3"/></svg>',
  roshan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  urooj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M12 12v9M9 18h6"/></svg>',
  mukammal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/></svg>'
};

const ACCOUNTS = [
  { id: 'freelancer', name: 'UBL Freelancer Account', icon: 'freelancer', desc: 'An account dedicated for the financial and lifestyle needs of freelancers.' },
  { id: 'asaan', name: 'UBL Asaan Digital Account', icon: 'asaan', desc: 'A PKR account that can be opened completely digitally with just your CNIC.' },
  { id: 'roshan', name: 'UBL Roshan Digital Account', icon: 'roshan', desc: 'A multi-currency account for Pakistanis who live or have assets abroad, offering exciting investment opportunities in Pakistan.' },
  { id: 'urooj', name: 'UBL Urooj Account', icon: 'urooj', desc: 'An account designed around the banking and lifestyle needs of women.' },
  { id: 'mukammal', name: 'UBL Digital Mukammal Account', icon: 'mukammal', desc: 'A full-featured everyday account with no limits, cheque book and premium card.' }
];

const track = document.getElementById('track');
const dotsBox = document.getElementById('dots');
const PER = () => (window.innerWidth <= 920 ? 1 : 3);

function render() {
  track.innerHTML = ACCOUNTS.map(a => `
    <article class="acct-card" data-id="${a.id}">
      <div class="ic">${ICONS[a.icon]}</div>
      <h3>${a.name}</h3>
      <p class="desc">${a.desc}</p>
      <a href="#" class="learn">Learn More</a>
      <a href="form.html?account-type=${a.id}&track=1" class="track">Track Application</a>
      <a href="form.html?account-type=${a.id}&resume=1" class="btn btn-outline resume">Resume Application</a>
      <a href="form.html?account-type=${a.id}" class="btn btn-primary">Apply Now</a>
    </article>`).join('');
  buildDots();
  go(0);
}

let page = 0;
function pages() { return Math.ceil(ACCOUNTS.length / PER()); }
function buildDots() {
  dotsBox.innerHTML = Array.from({ length: pages() }, (_, i) =>
    `<button class="dot${i === 0 ? ' active' : ''}" data-p="${i}" aria-label="Page ${i + 1}"></button>`).join('');
}
function go(p) {
  const total = pages();
  page = (p + total) % total;
  const cardW = track.children[0]?.getBoundingClientRect().width || 0;
  const gap = 26;
  const per = PER();
  track.style.transition = 'transform .35s ease';
  track.style.transform = `translateX(-${page * per * (cardW + gap)}px)`;
  dotsBox.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === page));
}

// Make the track a horizontal strip for sliding
function applyStripLayout() {
  const per = PER();
  track.style.display = 'flex';
  track.style.gap = '26px';
  [...track.children].forEach(c => {
    c.style.flex = `0 0 calc((100% - ${(per - 1) * 26}px) / ${per})`;
  });
}

document.getElementById('prev').addEventListener('click', () => go(page - 1));
document.getElementById('next').addEventListener('click', () => go(page + 1));
dotsBox.addEventListener('click', e => { const d = e.target.closest('.dot'); if (d) go(+d.dataset.p); });
track.addEventListener('click', e => { if (e.target.closest('.learn')) e.preventDefault(); });

render();
applyStripLayout();
go(0);
window.addEventListener('resize', () => { applyStripLayout(); buildDots(); go(0); });

// Mobile nav
const nav = document.getElementById('nav');
document.getElementById('menuToggle').addEventListener('click', () => nav.classList.toggle('open'));
nav.querySelectorAll(':scope > ul > li > a').forEach(a => a.addEventListener('click', e => {
  if (window.innerWidth <= 1080 && a.nextElementSibling) { e.preventDefault(); a.parentElement.classList.toggle('open'); }
}));
