/* The authenticated API owns every OAuth parameter. iOS may hand a navigation
   to the native app, even after an asynchronous redirect. Offer an explicit
   copy-and-paste route instead of repeatedly sending a merchant into that app.
   The URL stays in page memory unless the merchant chooses to copy it; it is
   never logged or saved in storage, history, or a link to another service. */
(() => {
  'use strict';
  const card = document.querySelector('.connect-card');
  const status = document.querySelector('#connect-status');
  const help = document.querySelector('#connect-help');
  const button = document.querySelector('#authorize-button');
  const copyButton = document.querySelector('#copy-button');
  const guide = document.querySelector('#browser-guide');
  const manualCopy = document.querySelector('#manual-copy');
  const linkInput = document.querySelector('#authorization-link');
  const signIn = document.querySelector('#signin-link');
  const attemptKey = 'instapilotInstagramAttempted';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let destination = null, copying = false;
  let phase = 'ready', generation = 0, controller = null;
  let timeout = 0, navigation = 0, fallback = 0, interrupted = false;
  card.dataset.browserCopy = String(ios);

  function showGuide() { guide.hidden = false; }

  function clearDestination() {
    destination = null; linkInput.value = ''; manualCopy.hidden = true;
    copyButton.disabled = true;
  }

  function clearTimers() {
    clearTimeout(timeout); clearTimeout(navigation); clearTimeout(fallback);
    timeout = navigation = fallback = 0;
  }

  function ready(message = 'إذا فتح الرابط تطبيق إنستغرام أو لم يكتمل الانتقال، استخدم «نسخ رابط الربط».') {
    phase = 'ready'; card.dataset.state = 'ready'; button.disabled = false;
    copyButton.disabled = !destination || copying;
    status.textContent = message;
    help.textContent = destination ? 'الصق الرابط في شريط العنوان في علامة التبويب الحالية، ثم اضغط «انتقال». زر المتابعة قد يفتح تطبيق إنستغرام بحسب إعدادات الجهاز.' : 'اضغط «المتابعة إلى إنستغرام» لتجهيز محاولة جديدة. يمكنك بعدها نسخ الرابط وإكماله في المتصفح الحالي.';
    showGuide();
  }

  function failed(message, sessionExpired = false) {
    clearDestination();
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

  async function begin(navigate = true) {
    if (phase === 'loading' || phase === 'leaving') return;
    const current = ++generation;
    clearTimers(); controller?.abort();
    clearDestination();
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
      try { destination = authorizationURL(result.url); }
      catch { failed('تعذّر التحقق من رابط التفويض أو عنوان العودة. تواصل مع إدارة المنصة.'); return; }
      if (document.hidden) { ready('عُد إلى هذه الصفحة واضغط الزر لبدء التفويض.'); return; }
      if (!navigate) {
        ready('لتفادي فتح تطبيق إنستغرام، انسخ رابط الربط وافتحه من شريط عنوان المتصفح.');
        return;
      }
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

  async function copyLink() {
    if (!destination || copying || phase !== 'ready') return;
    const value = destination, current = generation;
    copying = true; copyButton.disabled = true; showGuide();
    try {
      // Call writeText directly from the click. Fetching here first would lose
      // Safari's required user activation for clipboard access.
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      if (current !== generation || destination !== value) return;
      status.textContent = 'تم نسخ رابط الربط. الصقه الآن في شريط عنوان المتصفح الحالي.';
    } catch {
      if (current !== generation || destination !== value) return;
      linkInput.value = value; manualCopy.hidden = false;
      linkInput.focus({ preventScroll: true }); linkInput.select();
      linkInput.setSelectionRange(0, value.length);
      status.textContent = 'انسخ الرابط من الحقل أدناه، ثم الصقه في شريط عنوان المتصفح الحالي.';
    } finally {
      copying = false; copyButton.disabled = !destination || phase !== 'ready';
    }
  }

  button.addEventListener('click', () => begin(true));
  copyButton.addEventListener('click', copyLink);
  addEventListener('pagehide', pause);
  addEventListener('pageshow', event => {
    if (event.persisted || interrupted) { interrupted = false; ready('عدت إلى صفحة الربط. يمكنك نسخ الرابط لإكماله في المتصفح الحالي.'); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else if (interrupted) { interrupted = false; ready(); }
  });
  // iPhone/iPad must remain on the guide until the merchant chooses an action.
  // Back/reload also only prepare a fresh URL; they never re-open Instagram.
  begin(!ios && !history.state?.[attemptKey]);
})();
