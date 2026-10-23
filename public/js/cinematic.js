/* Four marketing chapters. The application API/auth/dashboard remain in app.js. */
window.InstaCinema = (() => {
  let current = null;
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover:hover) and (pointer:fine)');
  const clamp = value => Math.max(0, Math.min(1, value));

  function heroMarkup() {
    return `<section class="cine-story" aria-labelledby="cine-title">
      <div class="cine-stage">
        <canvas class="cine-canvas" aria-hidden="true"></canvas>
        <div class="cine-fallback" aria-hidden="true">
          <div class="fallback-platform">
            <div class="fallback-topbar"><span dir="ltr">InstaPilot <b>AI</b></span><span>عرض توضيحي</span><i></i></div>
            <div class="fallback-content"><div class="fallback-sidebar"><b>مساحة متجرك</b><span class="selected">نظرة عامة</span><span>المحادثات</span><span>المتجر</span><span>الحجوزات</span></div><div class="fallback-panel"><small>كل التفاصيل، في مكان واحد</small><h3>أهلاً بك في متجرك.</h3><div class="fallback-metrics"><span class="fallback-metric">رسائل الزبائن<i>استقبل وتابع</i></span><span class="fallback-metric">معلومات متجرك<i>مصدر كل إجابة</i></span></div><div class="fallback-message"><span>رسالة توضيحية</span><b>هلا، المنتج متوفر؟</b><p>ردود من معلومات متجرك المعتمدة.</p></div></div></div>
          </div>
          <div class="fallback-message floating-message"><span>رسالة جديدة</span><b>هلا، المنتج متوفر؟</b><p>من المحادثة تبدأ التفاصيل.</p></div>
          <div class="fallback-message floating-reply"><span>مساعد متجرك</span><b>رد من معلوماتك.</b><p>وسؤال يحتاجك؟ يصلك أنت.</p></div>
        </div>
        <div class="cine-intro"><div class="cine-eyebrow"><i></i><span>مساحة ذكية لمتجرك</span><span dir="ltr">SCENE 01</span></div><h1 class="cine-title" id="cine-title"><span>كل متجرك.</span><span>تحت سيطرتك.</span></h1><p class="cine-lede">رسائل زبائنك، معلومات متجرك وحجوزاتك.<br>تجربة واحدة تُبقيك قريباً من كل التفاصيل.</p><div class="cine-actions"><a class="cine-button primary" href="#/register"><span>ابدأ الآن</span><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></a><button class="cine-button secondary" type="button" data-cine-explore>استكشف المشهد <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 7 7 17M7 7v10h10" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button></div></div>
        <div class="cine-caption"><span class="cine-caption-kicker" dir="ltr">01 / INTELLIGENCE, IN ORBIT</span><h2>المحادثة بداية الصورة.</h2><p>اقترب من التفاصيل، ثم شاهد متجرك كاملاً.</p><a class="cine-button primary" href="#/register">ابدأ الآن <span aria-hidden="true">←</span></a></div>
        <div class="cine-scene-copy" data-cine-copy="conversations" aria-hidden="true" inert><span class="cine-caption-kicker" dir="ltr">02 / CONVERSATIONS IN MOTION</span><h2>كل رسالة.<br>لها طريق واضح.</h2><p>من سؤال الزبون إلى رد من معلومات متجرك.<br>وما يحتاج قرارك، يصل إليك.</p><div class="cine-steps" aria-label="مراحل معالجة الرسالة"><span>استقبال</span><span>فهم السؤال</span><span>إنشاء الرد</span></div><a class="cine-button primary" href="#/register">ابدأ الآن <span aria-hidden="true">←</span></a></div>
        <div class="cine-scene-copy" data-cine-copy="store" aria-hidden="true" inert><span class="cine-caption-kicker" dir="ltr">03 / YOUR STORE, REIMAGINED</span><h2>من المحادثة<br>إلى الطلب.</h2><p>منتجاتك وأسعارك ومعلوماتها في سياق واحد.<br>تابع الحجوزات وتفاصيلها من مساحة متجرك.</p><div class="cine-steps" aria-label="من المنتج إلى الحجز"><span>المنتج</span><span>التفاصيل</span><span>الحجز</span></div><a class="cine-button primary" href="#/register">أنشئ مساحة متجرك <span aria-hidden="true">←</span></a></div>
        <div class="cine-scene-copy" data-cine-copy="connected" aria-hidden="true" inert><span class="cine-caption-kicker" dir="ltr">04 / EVERYTHING CONNECTED</span><h2>كل التفاصيل.<br>في مكان واحد.</h2><p>الرسائل، معلومات المنتجات، الحجوزات والاستخدام.<br>انتقل من الصورة الكاملة إلى العمل اليومي.</p><div class="cine-actions"><a class="cine-button primary" href="#/register">ابدأ الآن <span aria-hidden="true">←</span></a><a class="cine-button secondary" href="#/login">الدخول إلى المنصة</a></div></div>
        <div class="cine-dashboard-reveal" aria-hidden="true"><div class="cine-dashboard-label">واجهة المنصة · عرض توضيحي</div><img src="/assets/cinematic/platform-demo.png" alt="" loading="lazy" width="1440" height="1100"></div>
        <div class="cine-marker cine-marker--one"><i></i><span>معلوماتك، مصدر الإجابة.</span></div>
        <div class="cine-chapter"><span dir="ltr">01</span><span>THE INTELLIGENT PLATFORM</span></div>
        <div class="cine-scroll-hint"><span>مرّر لتكتشف الصورة</span><i></i></div>
        <div class="cine-timeline" role="progressbar" aria-label="التقدم في استكشاف المنصة" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
        <div class="cine-demo-note">عرض توضيحي للواجهة · بيانات تجريبية</div>
        <nav class="cine-scene-nav" aria-label="مشاهد المنصة"><button type="button" data-scene="0" class="is-active" aria-current="step"><span dir="ltr">01</span><b>المنصة</b></button><button type="button" data-scene="1"><span dir="ltr">02</span><b>المحادثات</b></button><button type="button" data-scene="2"><span dir="ltr">03</span><b>المتجر</b></button><button type="button" data-scene="3"><span dir="ltr">04</span><b>كل التفاصيل</b></button></nav>
        <button type="button" class="cine-quality" aria-pressed="false">تقليل المؤثرات</button>
        <button type="button" class="cine-skip">تعرّف على المنصة <span aria-hidden="true">↓</span></button>
      </div>
    </section><section class="cine-lite-scenes" aria-label="اكتشف المنصة"><article class="cine-lite-scene"><div class="cine-lite-copy"><span class="cine-caption-kicker" dir="ltr">02 / CONVERSATIONS</span><h2>كل رسالة. لها طريق واضح.</h2><p>ردود من معلومات متجرك، وتحويل ما يحتاج قرارك إليك.</p></div><div class="cine-lite-visual"><div class="lite-message">رسالة توضيحية<b>هلا، المنتج متوفر؟</b></div><div class="lite-flow">استقبال ← فهم السؤال ← إنشاء الرد</div><div class="lite-message is-reply">مساعد المتجر<b>الإجابة من معلوماتك المعتمدة.</b></div></div></article><article class="cine-lite-scene"><div class="cine-lite-copy"><span class="cine-caption-kicker" dir="ltr">03 / YOUR STORE</span><h2>من المحادثة إلى الطلب.</h2><p>منتجاتك وأسعارك وتفاصيل الحجوزات، في مكان واحد.</p></div><div class="cine-lite-visual"><div class="lite-product-grid"><div class="lite-product"><b>منتجاتك</b><small>تفاصيل وأسعار معتمدة</small></div><div class="lite-product"><b>معلومات متجرك</b><small>مصدر كل إجابة</small></div></div><div class="lite-booking">حجز توضيحي · راجع التفاصيل وحدّث الحالة</div></div></article><article class="cine-lite-scene"><div class="cine-lite-copy"><span class="cine-caption-kicker" dir="ltr">04 / CONNECTED</span><h2>كل التفاصيل. في مكان واحد.</h2><p>ابدأ من مساحة عملية وسريعة لإدارة متجرك.</p><div class="cine-actions"><a class="cine-button primary" href="#/register">ابدأ الآن</a><a class="cine-button secondary" href="#/login">تسجيل الدخول</a></div></div><div class="cine-lite-visual lite-connected"><img src="/assets/cinematic/platform-demo.png" alt="عرض توضيحي للوحة التاجر ببيانات تجريبية" loading="lazy" width="1440" height="1100"></div></article></section>`;
  }

  function unmount() {
    if (!current) return;
    const state = current; current = null; state.dead = true; state.generation++;
    state.abort.abort(); state.intersection?.disconnect(); state.mutation?.disconnect();
    state.resize?.disconnect(); cancelAnimationFrame(state.measureFrame); cancelAnimationFrame(state.scrollFrame);
    state.world?.dispose(); state.world = null;
  }

  function mount(root) {
    unmount();
    if (!root) return;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#050605');
    const state = current = { root, dead: false, generation: 0, world: null, loading: false, inView: true, progress: 0, start: 0, travel: 1, measureFrame: 0, abort: new AbortController() };
    const story = root.querySelector('.cine-story'), stage = root.querySelector('.cine-stage');
    const qualityButton = root.querySelector('.cine-quality');
    const captionTitle = root.querySelector('.cine-caption h2'), captionText = root.querySelector('.cine-caption p');
    const signal = state.abort.signal;
    let manualLite = false;
    try { manualLite = localStorage.getItem('instapilot-cinema-lite') === '1'; } catch {}
    const prefersLite = () => {
      try { return motionPreference.matches || manualLite || localStorage.getItem('calm') === '1' || navigator.connection?.saveData; }
      catch { return motionPreference.matches || manualLite; }
    };
    const live = () => !state.dead && current === state && root.isConnected;

    function progress() {
      state.measureFrame = 0;
      if (!live()) return;
      const p = clamp((scrollY - state.start) / state.travel);
      state.progress = p;
      root.style.setProperty('--scene-progress', p.toFixed(4));
      root.querySelector('.cine-timeline')?.setAttribute('aria-valuenow', Math.round(p * 100));
      const chapter = Math.min(3, Math.floor(p * 4)), local = p === 1 ? 1 : p * 4 - chapter;
      const interactive = root.dataset.renderer === 'webgl';
      root.dataset.scene = String(chapter);
      const labels = ['THE INTELLIGENT PLATFORM', 'CONVERSATIONS IN MOTION', 'YOUR STORE, REIMAGINED', 'EVERYTHING CONNECTED'];
      const chapterLabel = root.querySelector('.cine-chapter');
      chapterLabel.firstElementChild.textContent = String(chapter + 1).padStart(2, '0');
      chapterLabel.lastElementChild.textContent = labels[chapter];
      root.classList.toggle('is-next-scene', chapter > 0 && interactive);
      root.classList.toggle('is-exploring', chapter === 0 && local > .22 && interactive);
      root.querySelector('.cine-intro').inert = (chapter > 0 || local > .22) && interactive;
      root.querySelector('.cine-caption').inert = chapter !== 0 || local <= .22 || !interactive;
      root.querySelectorAll('[data-cine-copy]').forEach((copy, index) => {
        const active = interactive && chapter === index + 1;
        copy.classList.toggle('is-active', active); copy.inert = !active; copy.setAttribute('aria-hidden', String(!active));
        copy.querySelectorAll('.cine-steps span').forEach((step, i) => {
          const phase = Math.min(2, Math.floor(local * 3));
          step.classList.toggle('is-active', i === phase); step.classList.toggle('is-complete', i < phase);
        });
      });
      root.querySelectorAll('[data-scene]').forEach(button => {
        const active = Number(button.dataset.scene) === chapter;
        button.classList.toggle('is-active', active);
        if (active) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
      });
      const overview = chapter === 0 && local > .68;
      if (root.classList.contains('is-overview') !== overview) {
        root.classList.toggle('is-overview', overview);
        captionTitle.textContent = overview ? 'كل التفاصيل. في مكان واحد.' : 'المحادثة بداية الصورة.';
        captionText.textContent = overview ? 'تابع الرسائل والمعلومات والحجوزات من مساحة متجرك.' : 'اقترب من التفاصيل، ثم شاهد متجرك كاملاً.';
      }
      const handoff = chapter === 3 && interactive ? clamp((local - .72) / .24) : 0;
      root.style.setProperty('--platform-handoff', handoff.toFixed(4));
      root.classList.toggle('is-platform-ready', handoff > .01);
      state.world?.setProgress(p);
    }

    function measure() {
      if (!live()) return;
      state.start = scrollY + story.getBoundingClientRect().top;
      state.travel = Math.max(1, story.offsetHeight - stage.offsetHeight);
      state.world?.resize(stage.clientWidth, stage.clientHeight);
      progress();
    }

    // Time-based native scrolling stays predictable even during a costly first GPU frame.
    // User wheel/touch input always takes ownership immediately.
    function stopTravel() { cancelAnimationFrame(state.scrollFrame); state.scrollFrame = 0; }
    function travelTo(top) {
      stopTravel();
      const origin = scrollY, distance = top - origin;
      if (prefersLite()) { window.scrollTo({ top, behavior: 'instant' }); return; }
      const began = performance.now();
      function step(now) {
        if (!live()) return;
        const t = clamp((now - began) / 850), eased = 1 - Math.pow(1 - t, 3);
        window.scrollTo({ top: origin + distance * eased, behavior: 'instant' });
        if (t < 1) state.scrollFrame = requestAnimationFrame(step); else state.scrollFrame = 0;
      }
      state.scrollFrame = requestAnimationFrame(step);
    }

    function staticView(reason = 'preference') {
      const previousChapter = Math.min(3, Math.floor(state.progress * 4)), wasWebgl = root.dataset.renderer === 'webgl';
      state.generation++; state.loading = false;
      state.world?.dispose(); state.world = null;
      root.dataset.renderer = 'static'; root.dataset.sceneState = reason;
      root.classList.remove('is-exploring', 'is-next-scene', 'is-platform-ready'); root.classList.add('is-ready'); root.style.setProperty('--platform-handoff', '0');
      root.querySelectorAll('[data-cine-copy]').forEach(copy=>{copy.inert=true;copy.setAttribute('aria-hidden','true');copy.classList.remove('is-active')});
      root.querySelector('.cine-intro').inert = false;
      root.querySelector('.cine-caption').inert = true;
      qualityButton.setAttribute('aria-pressed', String(!!prefersLite()));
      qualityButton.disabled = !!motionPreference.matches || reason === 'unavailable';
      qualityButton.textContent = reason === 'unavailable' ? 'نسخة خفيفة' : motionPreference.matches ? 'حركة هادئة' : manualLite ? 'تفعيل المؤثرات' : 'تقليل المؤثرات';
      requestAnimationFrame(() => {
        measure();
        if (wasWebgl && live()) {
          const equivalent = previousChapter > 0 ? root.querySelectorAll('.cine-lite-scene')[previousChapter - 1] : story;
          if (equivalent) window.scrollTo({ top: scrollY + equivalent.getBoundingClientRect().top - (previousChapter ? 85 : 0), behavior: 'instant' });
        }
      });
    }

    async function start() {
      if (!live() || state.world || state.loading || !state.inView) return;
      if (prefersLite()) { staticView(); return; }
      state.loading = true;
      const generation = ++state.generation;
      let gl;
      try {
        const probe = document.createElement('canvas');
        gl = probe.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
        if (!gl) { staticView('unavailable'); return; }
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        const [module] = await Promise.all([import('/js/cinematic-scene.js'), document.fonts.ready]);
        if (!live() || generation !== state.generation || prefersLite()) return;
        let sceneCanvas = root.querySelector('.cine-canvas');
        if (sceneCanvas.dataset.disposed === 'true') {
          const freshCanvas = document.createElement('canvas'); freshCanvas.className = 'cine-canvas'; freshCanvas.setAttribute('aria-hidden','true');
          sceneCanvas.replaceWith(freshCanvas); sceneCanvas = freshCanvas;
        }
        const world = await module.createScene(sceneCanvas, {
          width: stage.clientWidth, height: stage.clientHeight,
          coarse: !finePointer.matches,
          isCancelled: () => !live() || generation !== state.generation || prefersLite(),
          onUnavailable: () => { if (live()) staticView('unavailable'); }
        });
        if (!live() || generation !== state.generation || prefersLite()) { world.dispose(); return; }
        state.world = world; state.loading = false;
        root.dataset.renderer = 'webgl'; root.dataset.sceneState = 'ready'; root.classList.add('is-ready');
        qualityButton.disabled = false; qualityButton.setAttribute('aria-pressed', 'false'); qualityButton.textContent = 'تقليل المؤثرات';
        measure(); world.setVisible(state.inView && !document.hidden);
      } catch {
        if (live() && generation === state.generation) staticView('unavailable');
      }
    }

    root.dataset.renderer = 'static'; root.dataset.sceneState = 'loading';
    root.classList.add('is-ready');
    addEventListener('scroll', () => {
      if (!state.measureFrame) state.measureFrame = requestAnimationFrame(progress);
    }, { passive: true, signal });
    addEventListener('resize', measure, { passive: true, signal });
    addEventListener('wheel', stopTravel, { passive: true, signal });
    addEventListener('touchstart', stopTravel, { passive: true, signal });
    addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) stopTravel();
    }, { signal });
    document.addEventListener('visibilitychange', () => state.world?.setVisible(state.inView && !document.hidden), { signal });
    addEventListener('hashchange', () => {
      if (['#/login', '#/register'].includes(location.hash)) unmount();
    }, { signal });
    motionPreference.addEventListener('change', () => {
      if (prefersLite()) staticView(); else { root.dataset.sceneState = 'loading'; start(); }
    }, { signal });
    state.mutation = new MutationObserver(() => { if (document.querySelector('#app')?.dataset.v !== 'land') unmount(); });
    state.mutation.observe(document.querySelector('#app'), { attributes: true, attributeFilter: ['data-v'] });
    if ('IntersectionObserver' in window) {
      state.intersection = new IntersectionObserver(entries => {
        state.inView = entries[0].isIntersecting;
        state.world?.setVisible(state.inView && !document.hidden);
        if (state.inView) start();
      }, { rootMargin: '120px 0px' });
      state.intersection.observe(stage);
    }
    if ('ResizeObserver' in window) {
      state.resize = new ResizeObserver(measure); state.resize.observe(stage);
    }
    qualityButton.onclick = () => {
      manualLite = !manualLite;
      try { localStorage.setItem('instapilot-cinema-lite', manualLite ? '1' : '0'); } catch {}
      if (prefersLite()) staticView(); else { root.dataset.sceneState = 'loading'; start(); }
    };
    root.querySelector('[data-cine-explore]').onclick = () => {
      measure();
      const details = root.querySelector('.cine-details');
      travelTo(root.dataset.renderer === 'webgl' ? state.start + state.travel * .16 : scrollY + details.getBoundingClientRect().top - 85);
    };
    root.querySelector('.cine-brand').onclick = event => { event.preventDefault(); measure(); travelTo(state.start); };
    root.querySelectorAll('.cine-scene-nav [data-scene]').forEach(button => button.onclick = () => {
      measure(); travelTo(state.start + state.travel * [0, .32, .63, .99][Number(button.dataset.scene)]);
    });
    root.querySelector('.cine-skip').onclick = () => {
      const details = root.querySelector('.cine-details');
      travelTo(scrollY + details.getBoundingClientRect().top - 85);
    };
    root.addEventListener('pointermove', event => {
      if (!finePointer.matches || prefersLite() || event.pointerType !== 'mouse') return;
      const rect = stage.getBoundingClientRect();
      state.world?.setPointer((event.clientX / rect.width - .5) * 2, ((event.clientY - rect.top) / rect.height - .5) * 2);
      const button = event.target.closest('.cine-button');
      if (button) {
        const box = button.getBoundingClientRect();
        button.style.setProperty('--magnet-x', ((event.clientX - box.left - box.width / 2) * .07).toFixed(1) + 'px');
        button.style.setProperty('--magnet-y', ((event.clientY - box.top - box.height / 2) * .1).toFixed(1) + 'px');
      }
    }, { passive: true, signal });
    root.addEventListener('pointerout', event => {
      const button = event.target.closest('.cine-button');
      if (button && !button.contains(event.relatedTarget)) { button.style.setProperty('--magnet-x', '0px'); button.style.setProperty('--magnet-y', '0px'); }
      if (!root.contains(event.relatedTarget)) state.world?.setPointer(0, 0);
    }, { passive: true, signal });
    root.addEventListener('pointerdown', event => {
      const button = event.target.closest('.cine-button,.cine-quality');
      if (button && !prefersLite()) button.animate?.([{ scale: '.97' }, { scale: '1' }], { duration: 300, easing: 'cubic-bezier(.16,1,.3,1)' });
    }, { passive: true, signal });
    measure(); start();
  }
  return { heroMarkup, mount, unmount };
})();
