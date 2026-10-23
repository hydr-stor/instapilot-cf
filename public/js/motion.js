/* Finite, presentation-only motion. No requests, application state or dependencies. */
window.PilotMotion = (() => {
  'use strict';
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const mounted = new WeakSet();
  const observed = new Set();
  const counters = new WeakMap();
  const rings = new WeakMap();
  const progress = new WeakSet();
  const jobs = new Set();
  const effects = new Set();
  const format = new Intl.NumberFormat('en-US');
  let observer, frame = 0, navFrame = 0, pointerFrame = 0;
  let pressed = null, tilted = null, pointer = null;
  let lastNav = '', lastSidebar = '';

  const app = () => document.querySelector('#app');
  const isWorkspace = () => app()?.dataset.v === 'app';
  const reduced = () => {
    try { return media.matches || document.body.classList.contains('calm') || localStorage.getItem('calm') === '1'; }
    catch { return media.matches; }
  };
  const active = () => !reduced() && !document.hidden;
  const ease = t => 1 - Math.pow(1 - t, 3);

  function effect(node, keyframes, options = {}) {
    if (!active() || !node?.isConnected || typeof node.animate !== 'function') return null;
    const animation = node.animate(keyframes, { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)', ...options });
    effects.add(animation);
    const clean = () => effects.delete(animation);
    animation.addEventListener('finish', clean, { once: true });
    animation.addEventListener('cancel', clean, { once: true });
    return animation;
  }

  function tick(now) {
    frame = 0;
    for (const job of jobs) {
      if (!job.node.isConnected || !active()) {
        job.finish(); jobs.delete(job); continue;
      }
      const t = Math.max(0, Math.min(1, (now - job.start) / job.duration));
      job.update(ease(t));
      if (t === 1) { job.finish(); jobs.delete(job); }
    }
    if (jobs.size) frame = requestAnimationFrame(tick);
  }

  function tween(node, update, finish, duration = 760, delay = 0) {
    if (!active()) { finish(); return; }
    jobs.add({ node, update, finish, duration, start: performance.now() + delay });
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function finishJobs(root) {
    for (const job of jobs) {
      if (!root || root.contains(job.node)) { job.finish(); jobs.delete(job); }
    }
    if (!jobs.size) { cancelAnimationFrame(frame); frame = 0; }
  }

  function pruneDetached() {
    for (const node of observed) {
      if (!node.isConnected) { observer?.unobserve(node); observed.delete(node); }
    }
    for (const job of jobs) {
      if (!job.node.isConnected) { job.finish(); jobs.delete(job); }
    }
    for (const animation of effects) {
      if (!animation.effect?.target?.isConnected) animation.cancel();
    }
    if (!jobs.size) { cancelAnimationFrame(frame); frame = 0; }
  }

  function count(node, delay) {
    if (counters.has(node)) return;
    const value = Number(node.dataset.n);
    if (!Number.isFinite(value)) return;
    counters.set(node, value);
    const finish = () => { node.textContent = format.format(value); node.classList.add('motion-complete'); };
    if (!value || !active()) { finish(); return; }
    node.setAttribute('aria-label', format.format(value));
    node.textContent = '0';
    let last = -1;
    tween(node, t => {
      const next = Math.round(value * t);
      if (next !== last) { node.textContent = format.format(next); last = next; }
    }, finish, 680, delay);
  }

  function revealContents(root) {
    const delay = Math.min(160, parseFloat(root.style.getPropertyValue('--reveal-delay')) || 0);
    root.querySelectorAll('[data-n]').forEach(node => count(node, delay));
    if (root.matches('[data-n]')) count(root, delay);
    root.querySelectorAll('.usage-ring').forEach(ring => {
      if (rings.has(ring)) return;
      const value = Math.max(0, Math.min(100, parseFloat(ring.style.getPropertyValue('--usage')) || 0));
      rings.set(ring, value);
      ring.dataset.motionUsage = value;
      const finish = () => { ring.style.setProperty('--usage', value + '%'); ring.classList.add('motion-complete'); };
      if (!active()) { finish(); return; }
      ring.style.setProperty('--usage', '0%');
      tween(ring, t => ring.style.setProperty('--usage', (value * t).toFixed(2) + '%'), finish, 950, delay);
    });
    root.querySelectorAll('.bar>i[data-w], .setup-progress>i').forEach(bar => {
      if (progress.has(bar)) return;
      progress.add(bar);
      if (bar.dataset.w) bar.style.width = bar.dataset.w;
      bar.style.transformOrigin = 'right center';
      bar.style.transform = 'scaleX(1)';
      effect(bar, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 880, delay, easing: 'cubic-bezier(.16,1,.3,1)' });
    });
  }

  function show(node) {
    node.classList.add('is-visible');
    observed.delete(node);
    observer?.unobserve(node);
    revealContents(node);
  }

  function getObserver() {
    if (!observer && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => { if (entry.isIntersecting) show(entry.target); });
      }, { threshold: 0, rootMargin: '0px 0px -12px 0px' });
    }
    return observer;
  }

  function mount(root = document.querySelector('#pg')) {
    pruneDetached();
    if (!root || !isWorkspace()) return;
    app().classList.add('motion-ready');
    app().dataset.motion = reduced() ? 'off' : 'on';
    const selector = '.dashboard-intro,.assistant-banner,.metrics-heading,.metric-card,.dashboard-columns>.panel,#pg>.card,#pg>.row>.card,#ls>.card,#pg>.emp,.workspace-error,.screen-panel,.knowledge-card,.conversation-card,.booking-card,.blocked-card,.admin-plan,.admin-user';
    const targets = [...root.querySelectorAll(selector)];
    if (root.matches(selector)) targets.unshift(root);
    targets.forEach((node, i) => {
      if (mounted.has(node)) return;
      mounted.add(node);
      node.classList.add('motion-reveal');
      const sibling = node.matches('.metric-card') ? [...node.parentNode.children].indexOf(node) : i % 4;
      node.style.setProperty('--reveal-delay', Math.min(180, sibling * 55) + 'ms');
      if (node.matches('.metric-card,.assistant-banner')) node.classList.add('motion-tilt');
      if (!active() || !getObserver()) show(node);
      else { observed.add(node); observer.observe(node); }
    });
    // Content without a card container still receives correct values/progress.
    root.querySelectorAll('[data-n]').forEach(node => {
      if (!node.closest('.motion-reveal')) count(node, 0);
    });
    syncNavigation();
  }

  function begin(root = document.querySelector('#pg')) {
    pruneDetached();
    resetPress(false); resetTilt();
    if (!root) return;
    for (const node of observed) {
      if (root.contains(node)) { observer?.unobserve(node); observed.delete(node); }
    }
    finishJobs(root);
    for (const animation of effects) {
      const node = animation.effect?.target;
      if (node && root.contains(node)) animation.cancel();
    }
  }

  function positionIndicator(container, link, className) {
    if (!container || !link || !container.offsetWidth) return;
    let marker = container.querySelector('.' + className);
    if (!marker) {
      marker = document.createElement('span'); marker.className = className;
      marker.setAttribute('aria-hidden', 'true'); container.prepend(marker);
    }
    const c = container.getBoundingClientRect(), a = link.getBoundingClientRect();
    const x = a.left - c.left + container.scrollLeft - container.clientLeft;
    const y = a.top - c.top + container.scrollTop - container.clientTop;
    if (!marker.dataset.ready || reduced()) marker.style.transition = 'none';
    marker.style.width = a.width + 'px'; marker.style.height = a.height + 'px';
    marker.style.transform = `translate3d(${x}px,${y}px,0)`;
    if (!marker.dataset.ready) {
      marker.dataset.ready = '1';
      requestAnimationFrame(() => { if (marker.isConnected) marker.style.removeProperty('transition'); });
    } else if (!reduced()) marker.style.removeProperty('transition');
  }

  function syncNavigation() {
    if (!isWorkspace() || navFrame) return;
    navFrame = requestAnimationFrame(() => {
      navFrame = 0;
      const nav = document.querySelector('.bn'), side = document.querySelector('.sd');
      const current = nav?.querySelector('a.on'), currentSide = side?.querySelector('a.nb.on');
      positionIndicator(nav, current, 'nav-pill');
      positionIndicator(side, currentSide, 'sidebar-indicator');
      if (current && current.dataset.k !== lastNav) {
        effect(current.querySelector('svg'), [{ transform: 'translateY(1px) scale(.9)' }, { transform: 'translateY(-2px) scale(1.08)', offset: .55 }, { transform: 'translateY(0) scale(1)' }], { duration: 420 });
        lastNav = current.dataset.k;
      }
      if (currentSide && currentSide.dataset.k !== lastSidebar) {
        effect(currentSide.querySelector('svg'), [{ transform: 'scale(.9)' }, { transform: 'scale(1.07)', offset: .5 }, { transform: 'scale(1)' }]);
        lastSidebar = currentSide.dataset.k;
      }
    });
  }

  function resetTilt() {
    cancelAnimationFrame(pointerFrame); pointerFrame = 0; pointer = null;
    if (tilted) {
      tilted.style.setProperty('--tilt-x', '0deg'); tilted.style.setProperty('--tilt-y', '0deg');
      tilted.classList.remove('is-hovered'); tilted = null;
    }
  }

  function resetPress(spring = false) {
    if (!pressed) return;
    const node = pressed.node;
    node.classList.remove('is-pressed');
    if (spring && node.isConnected) {
      effect(node, [{ scale: '.978' }, { scale: '1.009', offset: .58 }, { scale: '1' }], { duration: 330 });
    }
    pressed = null;
  }

  function ripple(node, event) {
    if (node.matches('.sw') || !node.matches('button,.bt2,.secondary-action,.metric-card') || !active()) return;
    const bounds = node.getBoundingClientRect(), size = Math.max(bounds.width, bounds.height) * 1.5;
    const ink = document.createElement('span'); ink.className = 'press-ripple'; ink.setAttribute('aria-hidden', 'true');
    ink.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - bounds.left - size / 2}px;top:${event.clientY - bounds.top - size / 2}px`;
    node.append(ink);
    const animation = effect(ink, [{ transform: 'scale(.05)', opacity: .2 }, { transform: 'scale(1)', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' });
    if (animation) {
      animation.addEventListener('finish', () => ink.remove(), { once: true });
      animation.addEventListener('cancel', () => ink.remove(), { once: true });
    } else ink.remove();
  }

  document.addEventListener('pointerdown', event => {
    if (!isWorkspace() || !active() || event.isPrimary === false || (event.button !== 0 && event.button !== undefined)) return;
    if (event.target.closest('input,textarea,select,[contenteditable=true]')) return;
    const node = event.target.closest('button:not(:disabled),a[href],.chip,.li[onclick],.card.t,.panel,.assistant-banner');
    if (!node || !app().contains(node)) return;
    resetPress();
    pressed = { node, id: event.pointerId, x: event.clientX, y: event.clientY };
    node.classList.add('is-pressed'); ripple(node, event);
  }, { passive: true });

  document.addEventListener('pointermove', event => {
    if (pressed && event.pointerId === pressed.id && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 10) resetPress();
    if (!isWorkspace() || !active() || !finePointer.matches || event.pointerType !== 'mouse' || pressed) return;
    if (event.target.closest('input,textarea,select,[contenteditable=true]')) { resetTilt(); return; }
    const node = event.target.closest('.motion-tilt.is-visible');
    if (!node) { resetTilt(); return; }
    if (tilted && tilted !== node) resetTilt();
    tilted = node; pointer = { x: event.clientX, y: event.clientY };
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      if (!tilted?.isConnected || !pointer) return;
      const rect = tilted.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (pointer.x - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (pointer.y - rect.top) / rect.height));
      tilted.style.setProperty('--tilt-x', ((.5 - y) * 3).toFixed(2) + 'deg');
      tilted.style.setProperty('--tilt-y', ((x - .5) * 3).toFixed(2) + 'deg');
      tilted.style.setProperty('--spot-x', (x * 100).toFixed(1) + '%');
      tilted.style.setProperty('--spot-y', (y * 100).toFixed(1) + '%');
      tilted.classList.add('is-hovered');
    });
  }, { passive: true });

  document.addEventListener('pointerup', () => resetPress(true), { passive: true });
  document.addEventListener('pointercancel', () => { resetPress(); resetTilt(); }, { passive: true });
  document.addEventListener('pointerout', event => {
    if (tilted && !tilted.contains(event.relatedTarget)) resetTilt();
  }, { passive: true });
  addEventListener('scroll', () => {
    resetPress(); resetTilt();
    if (isWorkspace()) document.querySelector('.tp')?.classList.toggle('is-scrolled', scrollY > 12);
  }, { passive: true });
  addEventListener('blur', () => { resetPress(); resetTilt(); });
  document.addEventListener('focusin', event => {
    if (!isWorkspace()) return;
    const parent = event.target.closest('.motion-reveal');
    if (parent && !parent.classList.contains('is-visible')) show(parent);
  });
  document.addEventListener('keydown', event => {
    if (!isWorkspace() || !active() || event.repeat || !['Enter', ' '].includes(event.key)) return;
    const node = event.target.closest('button:not(:disabled),a[href]');
    if (node && (event.key === 'Enter' || node.tagName === 'BUTTON')) effect(node, [{ scale: '.98' }, { scale: '1' }], { duration: 220 });
  });
  // Existing filter handlers own the data and DOM; decorate their new rows afterwards.
  const decorateList = event => {
    if (!isWorkspace() || !event.target.closest('#q,#bq,.chip[data-k]')) return;
    requestAnimationFrame(() => mount(document.querySelector('#ls')));
  };
  document.addEventListener('input', decorateList);
  document.addEventListener('click', decorateList);

  function preferencesChanged() {
    if (!isWorkspace()) return;
    app().dataset.motion = reduced() ? 'off' : 'on';
    if (reduced()) {
      resetPress(); resetTilt(); finishJobs();
      for (const animation of effects) animation.cancel();
      for (const node of [...observed]) show(node);
      app().querySelectorAll('[data-n]').forEach(node => count(node, 0));
    }
    syncNavigation();
  }
  media.addEventListener?.('change', preferencesChanged);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { resetPress(); resetTilt(); finishJobs(); for (const animation of effects) animation.cancel(); }
  });
  document.fonts?.ready.then(syncNavigation);

  return {
    mount, begin, syncNavigation, preferencesChanged,
    reduced,
    themeChanged() {
      effect(document.querySelector('#theme-toggle svg'), [{ transform: 'rotate(-30deg) scale(.7)', opacity: .4 }, { transform: 'rotate(0) scale(1)', opacity: 1 }], { duration: 400 });
    },
    sheetOpened(panel) {
      if (!isWorkspace()) return;
      preferencesChanged();
      effect(panel.querySelector('h3'), [{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 300, delay: 100 });
    },
    sheetExitDuration: () => reduced() ? 0 : 300
  };
})();
