/* Same-window OAuth handoff. The existing authenticated API owns all OAuth
   parameters. No credentials, provider URLs or OAuth state are stored or logged.
   A JavaScript navigation can reduce iOS universal-link handoff; the OS still
   decides whether an installed application handles a URL. */
(() => {
  'use strict';
  const card = document.querySelector('.connect-card');
  const status = document.querySelector('#connect-status');
  const help = document.querySelector('#connect-help');
  const button = document.querySelector('#authorize-button');
  const signIn = document.querySelector('#signin-link');
  const attemptKey = 'instapilotInstagramAttempted';
  let phase = 'ready', generation = 0, controller = null;
  let timeout = 0, navigation = 0, fallback = 0, interrupted = false;

  function clearTimers() {
    clearTimeout(timeout); clearTimeout(navigation); clearTimeout(fallback);
    timeout = navigation = fallback = 0;
  }

  function ready(message = 'إذا لم تُفتح صفحة التفويض، يمكنك المحاولة من الزر أدناه.') {
    phase = 'ready'; card.dataset.state = 'ready'; button.disabled = false;
    status.textContent = message;
    help.textContent = 'إذا فتح iOS تطبيق إنستغرام وتعذّر الربط، ارجع إلى هذه الصفحة في Safari وأعد المحاولة. لا تغيّر المتصفح أثناء التفويض.';
  }

  function failed(message, sessionExpired = false) {
    phase = 'ready'; card.dataset.state = 'error';
    button.disabled = sessionExpired; signIn.hidden = !sessionExpired;
    status.textContent = message;
    help.textContent = sessionExpired ? 'سجّل دخولك، ثم افتح ربط إنستغرام من إعدادات حسابك مجدداً.' : 'لم تتغير إعدادات حسابك. يمكنك إعادة المحاولة أو العودة إلى إعدادات الربط.';
  }

  function authorizationURL(value) {
    if (typeof value !== 'string') throw new Error('Invalid authorization URL');
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'www.instagram.com' || url.port || url.username || url.password || url.hash || !/^\/oauth\/authorize\/?$/.test(url.pathname)) throw new Error('Invalid authorization destination');
    const params = url.searchParams;
    for (const key of ['client_id','redirect_uri','response_type','scope','state']) {
      if (params.getAll(key).length !== 1 || !params.get(key)) throw new Error('Missing or ambiguous authorization parameters');
    }
    const callback = new URL(params.get('redirect_uri'));
    // The session cookie is host-bound. A different return origin would lose
    // that session; report the configuration mismatch without rewriting it.
    if (callback.origin !== location.origin || callback.pathname !== '/api/instagram/callback' || callback.search || callback.hash || callback.username || callback.password) throw new Error('Invalid callback');
    const scopes = params.get('scope').split(/[\s,]+/);
    if (params.get('response_type') !== 'code' || !['instagram_business_basic','instagram_business_manage_messages'].every(scope => scopes.includes(scope))) throw new Error('Invalid authorization parameters');
    return value; // Preserve the API's original encoding, order and state.
  }

  async function begin() {
    if (phase === 'loading' || phase === 'leaving') return;
    const current = ++generation;
    clearTimers(); controller?.abort();
    const requestController = new AbortController(); controller = requestController;
    const signal = requestController.signal;
    phase = 'loading'; card.dataset.state = 'loading'; button.disabled = true;
    signIn.hidden = true; status.textContent = 'نجهّز صفحة التفويض…';
    help.textContent = 'نستخدم جلسة حسابك الحالية لفتح التفويض الرسمي، دون فتح نافذة جديدة.';
    timeout = setTimeout(() => requestController.abort(), 12000);
    try {
      const response = await fetch('/api/instagram/connect', {
        credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json' }, signal
      });
      if (current !== generation) return;
      if (response.status === 401) { failed('انتهت جلسة حسابك. سجّل الدخول إلى InstaPilot لبدء الربط.', true); return; }
      if (!response.ok) throw new Error('Authorization unavailable');
      const result = await response.json();
      if (current !== generation) return;
      if (result?.configured === false) { failed('ربط إنستغرام غير مفعّل حالياً. تواصل مع إدارة المنصة.'); return; }
      if (result?.configured !== true) throw new Error('Invalid authorization response');
      let destination;
      try { destination = authorizationURL(result.url); }
      catch { failed('تعذّر التحقق من رابط التفويض أو عنوان العودة. تواصل مع إدارة المنصة.'); return; }
      if (document.hidden) { ready('عُد إلى هذه الصفحة واضغط الزر لبدء التفويض.'); return; }
      // This flag only prevents an automatic retry loop when navigating Back
      // or reloading. It is unrelated to the provider's security state.
      try { history.replaceState({ ...history.state, [attemptKey]: true }, ''); } catch {}
      phase = 'leaving'; card.dataset.state = 'leaving';
      status.textContent = 'نفتح صفحة إنستغرام الرسمية…';
      // A separate task after the authenticated fetch avoids a direct external
      // anchor activation. It cannot override iOS universal-link preferences.
      navigation = setTimeout(() => {
        if (current !== generation || document.hidden) return;
        try { location.assign(destination); }
        catch { clearTimers(); ready('لم يكتمل الانتقال. اضغط الزر لإعادة المحاولة.'); }
      }, 80);
      fallback = setTimeout(() => {
        if (current === generation && !document.hidden) ready();
      }, 3500);
    } catch {
      if (current === generation) failed('تعذّر بدء التفويض. تحقق من الاتصال وأعد المحاولة.');
    } finally {
      if (current === generation) { clearTimeout(timeout); timeout = 0; controller = null; }
    }
  }

  function pause() {
    interrupted = true; generation++; clearTimers(); controller?.abort(); controller = null;
    phase = 'ready'; button.disabled = false;
  }

  button.addEventListener('click', begin);
  addEventListener('pagehide', pause);
  addEventListener('pageshow', event => {
    if (event.persisted || interrupted) { interrupted = false; ready('عدت إلى صفحة الربط. اضغط الزر إذا أردت إعادة التفويض.'); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else if (interrupted) { interrupted = false; ready('يمكنك متابعة الربط من الزر أدناه.'); }
  });
  if (history.state?.[attemptKey]) ready('عدت إلى صفحة الربط. يمكنك بدء محاولة جديدة من الزر أدناه.');
  else begin();
})();
