/* Presentation helpers. API calls and application data stay in app.js. */
function uiIcon(name, size = 20) {
  const paths = {
    arrow: '<path d="M19 12H5m6-6-6 6 6 6"/>',
    chevron: '<path d="m14 7-5 5 5 5"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    moon: '<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>',
    sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    activity: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    alert: '<path d="m10.3 4.5-8 14A1.7 1.7 0 0 0 3.8 21h16.4a1.7 1.7 0 0 0 1.5-2.5l-8-14a1.7 1.7 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sparkle}</svg>`;
}

function pilotMark() {
  return '<span class="pilot-mark" aria-hidden="true"><svg width="25" height="25" viewBox="0 0 24 24" fill="none"><path d="m4 10 16-6-6 16-3-7-7-3Z" fill="currentColor"/><path d="m11 13 9-9" stroke="#123c31" stroke-width="1.5"/></svg></span>';
}

function workspaceTheme() {
  try { return localStorage.getItem('instapilot-theme') === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

function applyWorkspaceTheme() {
  const app = document.querySelector('#app');
  const theme = workspaceTheme();
  app.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#101415' : '#f5f7f5';
  const button = document.querySelector('#theme-toggle');
  if (button) {
    const label = theme === 'dark' ? 'تفعيل المظهر الفاتح' : 'تفعيل المظهر الداكن';
    button.innerHTML = uiIcon(theme === 'dark' ? 'sun' : 'moon');
    button.setAttribute('aria-label', label);
    button.title = label;
  }
}

function toggleWorkspaceTheme() {
  const theme = workspaceTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('instapilot-theme', theme); } catch {}
  applyWorkspaceTheme();
  window.PilotMotion?.themeChanged();
}

function workspaceSync(page, title) {
  const main = document.querySelector('#pg');
  main.dataset.page = page;
  document.querySelector('#ttl').textContent = title;
  document.querySelectorAll('[data-store-name]').forEach(label => { label.textContent = me.store.name; });
  document.querySelectorAll('.account-avatar, .header-account').forEach(avatar => {
    avatar.textContent = Array.from(me.store.name || 'I')[0];
  });
  document.querySelectorAll('.sd [data-k], .bn [data-k]').forEach(link => {
    const active = link.classList.contains('on');
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  applyWorkspaceTheme();
}

function workspaceLoading(page) {
  if (page !== 'dash') return '<div class="workspace-loading" role="status" aria-label="جارٍ تحميل الصفحة"><div class="sk"></div><div class="sk"></div><div class="sk"></div><span class="sr-only">جارٍ تحميل الصفحة…</span></div>';
  return '<div class="dashboard-loading" role="status" aria-label="جارٍ تحميل لوحة التحكم"><div class="sk skeleton-heading"></div><div class="skeleton-stats"><div class="sk"></div><div class="sk"></div><div class="sk"></div><div class="sk"></div></div><div class="skeleton-panels"><div class="sk"></div><div class="sk"></div></div><span class="sr-only">جارٍ تحميل لوحة التحكم…</span></div>';
}

async function refreshWorkspace(button) {
  if (button.disabled) return;
  button.disabled = true;
  button.classList.add('is-refreshing');
  button.setAttribute('aria-label', 'جارٍ التحديث');
  try { await route(); }
  finally {
    button.disabled = false;
    button.classList.remove('is-refreshing');
    button.setAttribute('aria-label', 'تحديث البيانات');
  }
}

async function dashboardToggle(button) {
  button.disabled = true;
  try { await tgl(); }
  finally { button.disabled = false; }
}

/* The indicator must also follow layout changes, including iPhone rotation. */
addEventListener('resize', () => {
  if (typeof moveInd === 'function') requestAnimationFrame(moveInd);
}, { passive: true });
