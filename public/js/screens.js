/* Merchant screen presentation only. Data requests and actions remain in app.js. */
function screenIntro(kicker, title, description, actions = '') {
  return `<section class="screen-intro dashboard-intro"><div><div class="screen-kicker"><i></i>${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${actions ? `<div class="screen-intro-actions">${actions}</div>` : ''}</section>`;
}

function screenGlyph(name, size = 20) {
  const paths = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    book: '<path d="M12 6c-3-3-7-3-10-1v15c3-2 7-2 10 1 3-3 7-3 10-1V5c-3-2-7-2-10 1ZM12 6v15"/>',
    link: '<path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m4 2 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.book}</svg>`;
}

function screenSearch(id, placeholder, value) {
  return `<label class="screen-search" for="${id}">${screenGlyph('search',19)}<span class="sr-only">${esc(placeholder)}</span><input id="${id}" type="search" placeholder="${esc(placeholder)}" value="${esc(value)}" autocomplete="off"></label>`;
}

function screenEmpty(icon, title, description, action = '') {
  return `<div class="screen-empty emp"><span class="empty-icon ico">${ic(icon,28)}</span><h3>${esc(title)}</h3><p>${esc(description)}</p>${action ? `<div class="screen-actions">${action}</div>` : ''}</div>`;
}

function screenSummary(items, label = 'ملخص الصفحة') {
  return `<section class="screen-summary card" aria-label="${esc(label)}">${items.map(([title, value, tone = '']) => `<div class="summary-item ${tone}"><span class="summary-label">${esc(title)}</span><b class="summary-value ${tone}" data-n="${Number(value) || 0}">${Number(value || 0).toLocaleString('en-US')}</b></div>`).join('')}</section>`;
}

function screenDate(value) {
  if (!value) return '';
  const raw = String(value);
  const iso = raw.replace(' ', 'T');
  const date = new Date(/[zZ]$|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + 'Z');
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('ar-IQ', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Baghdad' }).format(date);
}

function screenBusy(button, busy) {
  if (!button) return;
  button.disabled = !!busy;
  button.classList.toggle('is-saving', !!busy);
  button.setAttribute('aria-busy', String(!!busy));
}

function screenPickTone(button) {
  const input = document.querySelector('#tone');
  input.value = button.dataset.tone;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function screenSyncTones() {
  const value = document.querySelector('#tone').value;
  document.querySelectorAll('.tone-card').forEach(button => {
    const selected = button.dataset.tone === value;
    button.classList.toggle('on', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}
