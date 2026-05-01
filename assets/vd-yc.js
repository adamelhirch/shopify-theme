/* Vanille Désiré — UI behaviors (no framework, defer-loaded) */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Header sticky shadow + hide-on-scroll-down / reveal-on-scroll-up
     Mirrors the yanncouvreur.com behavior. The translateY transform lives on
     the SHOPIFY SECTION wrapper (`.shopify-section--header`) — the inner
     `<header class="vd-header">` is too short for `position: sticky` to hold,
     so we move both the sticky and the transform up one level. */
  const header = $('.vd-header');
  const headerSection = header && header.closest('.shopify-section--header');
  if (header) {
    // Fallback: if the section wrapper class isn't found (theme variants),
    // fall back to the inner header for the transform target.
    const slideTarget = headerSection || header;
    let lastY = window.scrollY;
    let ticking = false;
    const HIDE_AFTER = 80;       // don't hide near the top of the page
    const REVEAL_DELTA = 4;      // smallest upward movement that reveals
    const HIDE_DELTA = 6;        // smallest downward movement that hides

    const update = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      header.classList.toggle('is-scrolled', y > 8);

      if (y <= HIDE_AFTER) {
        slideTarget.classList.remove('is-hidden');
      } else if (delta > HIDE_DELTA) {
        // scrolling down — only hide when no drawer is open
        if (!document.body.classList.contains('vd-no-scroll')) {
          slideTarget.classList.add('is-hidden');
        }
      } else if (delta < -REVEAL_DELTA) {
        slideTarget.classList.remove('is-hidden');
      }

      lastY = y;
      ticking = false;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });

    // Reveal when the cursor approaches the top of the viewport.
    document.addEventListener('mousemove', (e) => {
      if (e.clientY <= 24) slideTarget.classList.remove('is-hidden');
    });

    // Reveal whenever a drawer opens (so close button stays reachable).
    new MutationObserver(() => {
      if (document.body.classList.contains('vd-no-scroll')) {
        slideTarget.classList.remove('is-hidden');
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    update();
  }

  /* ---------- Drawers (mobile menu, cart, mega) ---------- */
  const openDrawer = (id) => {
    const drawer = document.getElementById(id);
    if (!drawer) return;
    const bg = $('.vd-drawer-bg');
    drawer.classList.add('is-open');
    if (bg) bg.classList.add('is-open');
    document.body.classList.add('vd-no-scroll');
    drawer.setAttribute('aria-hidden', 'false');
    if (id === 'vd-mega-drawer') document.body.classList.add('vd-mega-open');
  };
  const closeDrawers = () => {
    $$('.vd-drawer, .vd-megadrawer').forEach((d) => {
      d.classList.remove('is-open');
      d.setAttribute('aria-hidden', 'true');
    });
    const bg = $('.vd-drawer-bg');
    if (bg) bg.classList.remove('is-open');
    document.body.classList.remove('vd-no-scroll');
    document.body.classList.remove('vd-mega-open');
  };
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-vd-drawer-open]');
    if (opener) {
      e.preventDefault();
      openDrawer(opener.dataset.vdDrawerOpen);
      return;
    }
    if (e.target.closest('[data-vd-drawer-close]') || e.target.classList.contains('vd-drawer-bg')) {
      closeDrawers();
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawers(); });

  /* ---------- Announcement bar carousel ---------- */
  $$('.vd-announcement').forEach((el) => {
    const slides = $$('.vd-announcement__slide', el);
    if (slides.length <= 1) return;
    let i = 0;
    const show = (n) => {
      slides.forEach((s, idx) => s.classList.toggle('is-active', idx === n));
    };
    show(0);
    const next = () => { i = (i + 1) % slides.length; show(i); };
    const prev = () => { i = (i - 1 + slides.length) % slides.length; show(i); };
    setInterval(next, 5000);
    $('.vd-announcement__nav--next', el)?.addEventListener('click', next);
    $('.vd-announcement__nav--prev', el)?.addEventListener('click', prev);
  });

  /* ---------- Hero carousel (cross-fade) ---------- */
  $$('[data-vd-hero]').forEach((el) => {
    const slides = $$('.vd-hero__slide', el);
    const dots = $$('.vd-hero__dot', el);
    if (slides.length <= 1) return;
    let i = 0;
    const show = (n) => {
      slides.forEach((s, idx) => s.classList.toggle('is-active', idx === n));
      dots.forEach((d, idx) => d.classList.toggle('is-active', idx === n));
    };
    show(0);
    dots.forEach((d, idx) => d.addEventListener('click', () => { i = idx; show(i); }));
    setInterval(() => { i = (i + 1) % slides.length; show(i); }, 6000);
  });

  /* ---------- Carousels (featured products, locations) ---------- */
  $$('[data-vd-carousel]').forEach((el) => {
    const track = $('.vd-carousel', el);
    const prev = $('[data-vd-carousel-prev]', el);
    const next = $('[data-vd-carousel-next]', el);
    if (!track) return;
    const scrollAmount = () => track.clientWidth * 0.8;
    prev?.addEventListener('click', () => track.scrollBy({ left: -scrollAmount(), behavior: 'smooth' }));
    next?.addEventListener('click', () => track.scrollBy({ left: scrollAmount(), behavior: 'smooth' }));
    const update = () => {
      if (!prev || !next) return;
      prev.toggleAttribute('disabled', track.scrollLeft <= 4);
      next.toggleAttribute('disabled', track.scrollLeft + track.clientWidth >= track.scrollWidth - 4);
    };
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  });

  /* ---------- Tabs (where to find) ---------- */
  $$('[data-vd-tabs]').forEach((el) => {
    const tabs = $$('.vd-tab', el);
    const panels = $$('.vd-locations', el);
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
        panels.forEach((p) => p.classList.toggle('is-active', p.dataset.panel === target));
      });
    });
  });

  /* ---------- Full-screen hero (vertical carousel) ---------- */
  $$('[data-vd-fullhero]').forEach((el) => {
    const slides = $$('.vd-fullhero__slide', el);
    const dots = $$('.vd-fullhero__dot', el);
    if (slides.length <= 1) return;
    let i = 0;
    let timer;
    const show = (n) => {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, idx) => s.classList.toggle('is-active', idx === i));
      dots.forEach((d, idx) => d.classList.toggle('is-active', idx === i));
    };
    const auto = () => { clearInterval(timer); timer = setInterval(() => show(i + 1), 6000); };
    show(0); auto();
    dots.forEach((d, idx) => d.addEventListener('click', () => { show(idx); auto(); }));
  });

  /* ---------- Collection page : layout selector + filter drawer */
  $$('[data-vd-coll-bar]').forEach((bar) => {
    const section = bar.closest('.vd-coll');
    if (!section) return;

    /* Layout selector — toggle column count via CSS variable */
    const layoutBtns = $$('[data-vd-coll-layout]', bar);
    const applyLayout = (mode) => {
      // grid = larger cards; thumbnails = denser
      // desktop default cols = 4 (grid) / 6 (thumbnails)
      // tablet           = 3      / 4
      // mobile           = 2      / 3
      const w = window.innerWidth;
      let cols;
      if (mode === 'thumbnails') {
        cols = w >= 1100 ? 6 : (w >= 750 ? 4 : 3);
      } else {
        cols = w >= 1100 ? 4 : (w >= 750 ? 3 : 2);
      }
      section.style.setProperty('--vd-coll-cols', String(cols));
      layoutBtns.forEach((b) => {
        const isActive = b.dataset.vdCollLayout === mode;
        b.classList.toggle('is-active', isActive);
        b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
      try { localStorage.setItem('vd-coll-layout', mode); } catch (_) {}
    };
    // Restore last preference
    let saved = null;
    try { saved = localStorage.getItem('vd-coll-layout'); } catch (_) {}
    if (saved && (saved === 'grid' || saved === 'thumbnails')) applyLayout(saved);
    layoutBtns.forEach((b) => {
      b.addEventListener('click', () => applyLayout(b.dataset.vdCollLayout));
    });
    // Re-apply on resize so the "thumbnails / grid" choice keeps the right
    // column count for the breakpoint.
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const active = layoutBtns.find((b) => b.classList.contains('is-active'));
        if (active) applyLayout(active.dataset.vdCollLayout);
      }, 120);
    });

    /* Filter drawer */
    const drawer = section.querySelector('[data-vd-coll-drawer]');
    if (!drawer) return;
    const open = () => {
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      document.body.classList.add('vd-no-scroll');
      $$('[data-vd-coll-open-filters]', section).forEach((b) => b.setAttribute('aria-expanded', 'true'));
    };
    const close = () => {
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('vd-no-scroll');
      $$('[data-vd-coll-open-filters]', section).forEach((b) => b.setAttribute('aria-expanded', 'false'));
    };
    $$('[data-vd-coll-open-filters]', section).forEach((b) => b.addEventListener('click', open));
    $$('[data-vd-coll-close]', drawer).forEach((b) => b.addEventListener('click', close));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) close();
    });
  });

  /* ---------- Producteurs triptyque — sync mobile carousel markers to scroll */
  $$('[data-vd-prod-tri-grid]').forEach((grid) => {
    const root = grid.closest('.vd-prod-tri');
    if (!root) return;
    const markers = $$('.vd-prod-tri__marker', root);
    if (markers.length <= 1) return;
    const onScroll = () => {
      const items = $$('.vd-prod-tri__panel', grid);
      if (!items.length) return;
      const center = grid.scrollLeft + grid.clientWidth / 2;
      let nearest = 0;
      let bestDelta = Infinity;
      items.forEach((it, idx) => {
        const itCenter = it.offsetLeft + it.clientWidth / 2;
        const d = Math.abs(itCenter - center);
        if (d < bestDelta) { bestDelta = d; nearest = idx; }
      });
      markers.forEach((m, idx) => m.classList.toggle('is-active', idx === nearest));
    };
    grid.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  });

  /* ---------- PDP related products — sync the progress bar to scrollLeft.
     The fill width represents the fraction of the carousel currently visible;
     translateX positions it along the track to mirror scroll progress. */
  $$('[data-vd-related-carousel]').forEach((carousel) => {
    const root = carousel.closest('.vd-pdp-related');
    if (!root) return;
    const fill = root.querySelector('[data-vd-related-fill]');
    const prev = root.querySelector('[data-vd-related-prev]');
    const next = root.querySelector('[data-vd-related-next]');

    const update = () => {
      const total = carousel.scrollWidth - carousel.clientWidth;
      const atStart = carousel.scrollLeft <= 1;
      const atEnd = carousel.scrollLeft >= total - 1;

      if (fill) {
        const visibleRatio = Math.min(1, carousel.clientWidth / Math.max(1, carousel.scrollWidth));
        const progress = total > 0 ? Math.min(1, Math.max(0, carousel.scrollLeft / total)) : 0;
        const fillPct = visibleRatio * 100;
        const leftPct = (1 - visibleRatio) * progress * 100;
        fill.style.width = fillPct.toFixed(2) + '%';
        fill.style.left = leftPct.toFixed(2) + '%';
        fill.style.transform = 'none';
        fill.parentElement.style.opacity = total > 4 ? '1' : '0';
      }

      // Toggle disabled state on the nav buttons. CSS hides any button with
      // .is-disabled even when the carousel is hovered, so the user only
      // sees the arrows that lead somewhere.
      if (prev) prev.classList.toggle('is-disabled', atStart || total <= 0);
      if (next) next.classList.toggle('is-disabled', atEnd || total <= 0);
    };

    // Click handlers: scroll by ~1 card width
    const cardWidth = () => {
      const first = carousel.firstElementChild;
      const cs = first ? getComputedStyle(carousel) : null;
      const gap = cs ? parseFloat(cs.columnGap || cs.gap || '0') : 0;
      return first ? first.getBoundingClientRect().width + gap : carousel.clientWidth * 0.8;
    };
    if (prev) {
      prev.addEventListener('click', () => {
        carousel.scrollBy({ left: -cardWidth(), behavior: 'smooth' });
      });
    }
    if (next) {
      next.addEventListener('click', () => {
        carousel.scrollBy({ left: cardWidth(), behavior: 'smooth' });
      });
    }

    carousel.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  });

  /* ---------- Trust-icons mobile carousel — sync marker dots to scroll position */
  $$('[data-vd-trust-carousel]').forEach((carousel) => {
    const root = carousel.closest('.vd-trust');
    if (!root) return;
    const markers = $$('.vd-trust__marker', root);
    if (markers.length <= 1) return;
    const onScroll = () => {
      const items = $$('.vd-trust__item', carousel);
      if (!items.length) return;
      const center = carousel.scrollLeft + carousel.clientWidth / 2;
      let nearest = 0;
      let bestDelta = Infinity;
      items.forEach((it, idx) => {
        const itCenter = it.offsetLeft + it.clientWidth / 2;
        const d = Math.abs(itCenter - center);
        if (d < bestDelta) { bestDelta = d; nearest = idx; }
      });
      markers.forEach((m, idx) => m.classList.toggle('is-active', idx === nearest));
    };
    carousel.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  });

  /* ---------- Slideshow full-bleed (YC-style curtain transition)
     - Direction-aware curtain wipe between slides
     - Marker progress lines reflect autoplay countdown
     - Play/pause toggle, swipe support, pause when tab hidden
     - Restart timer on user interaction so the marker fill resets cleanly */
  $$('[data-vd-slideshow]').forEach((el) => {
    try {
    const slides = $$('.vd-ss__slide', el);
    const markers = $$('.vd-ss__marker', el);
    if (slides.length <= 1) return;

    const autoplaySec = parseFloat(el.dataset.autoplay || '6') || 6;
    el.style.setProperty('--vd-ss-autoplay', autoplaySec + 's');

    let current = 0;
    let timer = null;
    let paused = el.dataset.paused === 'true';

    const stopAuto = () => {
      if (timer) { clearTimeout(timer); timer = null; }
    };
    const startAuto = () => {
      stopAuto();
      if (paused) return;
      timer = setTimeout(() => show(current + 1, 1), autoplaySec * 1000);
    };

    const setMarkerActive = (idx) => {
      markers.forEach((m, mi) => {
        // Force reflow so the keyframe animation restarts every cycle
        m.classList.remove('is-active');
        void m.offsetWidth;
        m.classList.toggle('is-active', mi === idx);
        m.setAttribute('aria-selected', mi === idx ? 'true' : 'false');
      });
    };

    const show = (next, direction = 1) => {
      if (next === current) return;
      const total = slides.length;
      next = ((next % total) + total) % total;
      const out = slides[current];
      const inn = slides[next];

      // Curtain entry direction: forward → wipe from left; backward → from right
      inn.classList.remove('is-entering', 'is-entering-reverse', 'is-leaving');
      out.classList.remove('is-entering', 'is-entering-reverse', 'is-leaving');
      out.classList.add('is-leaving');
      inn.classList.add(direction >= 0 ? 'is-entering' : 'is-entering-reverse');

      // Swap active flag synchronously so content animations & autoplay markers fire
      out.classList.remove('is-active');
      inn.classList.add('is-active');

      // Clean up after the curtain animation finishes
      const cleanup = (e) => {
        if (e && e.animationName !== 'vd-ss-curtain-in' && e.animationName !== 'vd-ss-curtain-in-reverse') return;
        out.classList.remove('is-leaving');
        inn.classList.remove('is-entering', 'is-entering-reverse');
        inn.removeEventListener('animationend', cleanup);
      };
      inn.addEventListener('animationend', cleanup);

      current = next;
      setMarkerActive(current);
      // Schedule the next slide off the moment the marker fill begins, so
      // the line-progress and the autoplay timer stay in sync.
      startAuto();
    };

    // Initial state
    setMarkerActive(0);
    startAuto();

    // Markers — click to jump, then resume autoplay
    markers.forEach((m, idx) => {
      m.addEventListener('click', () => {
        if (idx === current) return;
        const direction = idx > current ? 1 : -1;
        show(idx, direction);
        startAuto();
      });
    });

    // Play/pause toggle
    const playBtn = el.querySelector('[data-vd-autoplay-toggle]');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        paused = !paused;
        el.dataset.paused = paused ? 'true' : 'false';
        playBtn.setAttribute('aria-pressed', paused ? 'false' : 'true');
        markers.forEach((m) => m.classList.toggle('is-paused', paused));
        if (paused) stopAuto(); else startAuto();
      });
    }

    // Pause autoplay when tab hidden, resume when visible
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopAuto();
      else if (!paused) startAuto();
    });

    // Touch swipe
    let touchX = null;
    el.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (touchX == null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) < 40) return;
      if (dx < 0) show(current + 1, 1);
      else show(current - 1, -1);
      startAuto();
    });
    } catch (err) {
      console.warn('[vd-slideshow] init failed', err);
      el.dataset.paused = 'true';
    }
  });

  /* ---------- Mega-menu drawer: hover preview swap ---------- */
  $$('#vd-mega-drawer .vd-megadrawer__cat').forEach((cat, idx, all) => {
    cat.addEventListener('mouseenter', () => {
      const img = $('[data-feat-target]');
      const titleEl = $('[data-feat-title-target]');
      const featured = $('[data-vd-featured]');
      const newSrc = cat.dataset.featImg;
      const newTitle = cat.dataset.featTitle;
      const collUrl = cat.getAttribute('href');
      if (img && newSrc && img.src !== newSrc) {
        // Preload then fade-cross
        const next = new Image();
        next.onload = () => {
          img.classList.add('is-fading');
          setTimeout(() => {
            img.src = newSrc;
            img.alt = newTitle || '';
            // Force reflow then unfade
            void img.offsetWidth;
            img.classList.remove('is-fading');
          }, 280);
        };
        next.src = newSrc;
      }
      if (titleEl && newTitle) titleEl.textContent = newTitle;
      if (featured && collUrl) featured.setAttribute('href', collUrl);
    });
    if (idx === 0) {
      // Set initial state from first category
      const img = $('[data-feat-target]');
      const titleEl = $('[data-feat-title-target]');
      const featured = $('[data-vd-featured]');
      if (img && cat.dataset.featImg) { img.src = cat.dataset.featImg; img.alt = cat.dataset.featTitle || ''; }
      if (titleEl) titleEl.textContent = cat.dataset.featTitle || '';
      if (featured) featured.setAttribute('href', cat.getAttribute('href'));
    }
  });

  /* ---------- Locations slideshow ---------- */
  $$('[data-vd-locss]').forEach((el) => {
    const slides = $$('.vd-locss__slide', el);
    if (slides.length <= 1) return;
    let i = 0;
    const show = (n) => {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, idx) => s.classList.toggle('is-active', idx === i));
    };
    show(0);
    $('[data-vd-locss-prev]', el)?.addEventListener('click', () => show(i - 1));
    $('[data-vd-locss-next]', el)?.addEventListener('click', () => show(i + 1));
  });

  /* ---------- Tabbed featured collections ---------- */
  $$('[data-vd-tcoll]').forEach((el) => {
    const tabs = $$('.vd-tcoll__tab', el);
    const panels = $$('.vd-tcoll__panel', el);
    const viewAll = $('[data-vd-viewall]', el);
    const sync = (tab) => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
      panels.forEach((p) => p.classList.toggle('is-active', p.dataset.panel === target));
      if (viewAll && tab.dataset.collUrl) viewAll.setAttribute('href', tab.dataset.collUrl);
    };
    if (tabs[0]) sync(tabs[0]);
    tabs.forEach((tab) => tab.addEventListener('click', () => sync(tab)));
  });

  /* ---------- PDP gallery — scroll-snap carousel sync with thumbs + dots
     Click a thumb → scrollIntoView the matching media. Scroll the carousel
     → highlight the closest thumb + active dot. */
  $$('[data-vd-gallery]').forEach((el) => {
    const carousel = el.querySelector('[data-vd-gallery-carousel]');
    const thumbs = $$('[data-thumb-index]', el);
    const dots = $$('[data-dot-index]', el);
    const medias = carousel ? $$('.vd-pdp__media', carousel) : [];
    if (!carousel || medias.length === 0) return;

    const setActive = (idx) => {
      medias.forEach((m, i) => m.classList.toggle('is-active', i === idx));
      thumbs.forEach((t, i) => {
        const on = i === idx;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-current', on ? 'true' : 'false');
      });
      dots.forEach((d, i) => d.classList.toggle('is-active', i === idx));
    };

    // Thumb click → scroll the matching media into view
    thumbs.forEach((thumb) => {
      thumb.addEventListener('click', () => {
        const idx = parseInt(thumb.dataset.thumbIndex, 10);
        const target = medias[idx];
        if (!target) return;
        carousel.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
        setActive(idx);
      });
    });

    // Carousel scroll → find the nearest media to viewport center
    let scrollTimer = null;
    carousel.addEventListener('scroll', () => {
      if (scrollTimer) cancelAnimationFrame(scrollTimer);
      scrollTimer = requestAnimationFrame(() => {
        const center = carousel.scrollLeft + carousel.clientWidth / 2;
        let nearest = 0;
        let bestDelta = Infinity;
        medias.forEach((m, i) => {
          const c = m.offsetLeft + m.clientWidth / 2;
          const d = Math.abs(c - center);
          if (d < bestDelta) { bestDelta = d; nearest = i; }
        });
        setActive(nearest);
      });
    }, { passive: true });

    setActive(0);
  });

  /* ---------- PDP variant picker — pill radios + variant select sync
     Each option group has radios. When the user picks a value, find the
     matching variant in the hidden <select data-vd-variant-select>, set it,
     update the displayed value label, and dispatch a change event so any
     parent form picks it up. */
  $$('[data-vd-variant-picker]').forEach((picker) => {
    const form = picker.closest('[data-vd-pdp-form]');
    const select = form && form.querySelector('[data-vd-variant-select]');
    const groups = $$('.vd-pdp__variant-group', picker);
    const pills = $$('.vd-pdp__variant-pill', picker);
    const valueLabels = $$('[data-vd-variant-value]', picker);

    pills.forEach((pill) => {
      const input = pill.querySelector('input[type="radio"]');
      if (!input) return;
      pill.addEventListener('click', (e) => {
        if (input.disabled) { e.preventDefault(); return; }
        // Toggle is-active within the same option group
        const group = pill.closest('.vd-pdp__variant-group');
        if (group) {
          $$('.vd-pdp__variant-pill', group).forEach((p) => p.classList.remove('is-active'));
        }
        pill.classList.add('is-active');
        input.checked = true;
        // Update the value label next to the option name
        const optionIdx = parseInt(input.dataset.vdOptionIndex, 10);
        if (!isNaN(optionIdx) && valueLabels[optionIdx]) {
          valueLabels[optionIdx].textContent = input.value;
        }
        // Find the matching variant
        if (select) {
          const chosen = groups.map((g) => {
            const checked = g.querySelector('input[type="radio"]:checked');
            return checked ? checked.value : null;
          });
          const opts = $$('option', select);
          const match = opts.find((o) => {
            const arr = (o.dataset.options || '').split('||');
            return chosen.every((v, i) => v == null || arr[i] === v);
          });
          if (match) {
            select.value = match.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            // Update price/availability if the variant differs
            updateBuyButton(form, match);
          }
        }
      });
    });
  });

  // Helper: reflect variant availability on the add-to-cart button
  const updateBuyButton = (form, optionEl) => {
    if (!form || !optionEl) return;
    const btn = form.querySelector('[data-vd-add]');
    if (!btn) return;
    const disabled = optionEl.disabled;
    btn.disabled = disabled;
    const label = btn.querySelector('.vd-pdp__add-label');
    if (label) label.textContent = disabled ? 'Indisponible' : 'Ajouter au panier';
  };

  /* ---------- Quantity stepper ---------- */
  $$('[data-vd-qty]').forEach((wrap) => {
    const input = $('input', wrap);
    if (!input) return;
    const min = parseInt(input.min || '1', 10);
    const max = input.max ? parseInt(input.max, 10) : Infinity;
    $('[data-vd-qty-minus]', wrap)?.addEventListener('click', () => {
      input.value = Math.max(min, (parseInt(input.value, 10) || min) - 1);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    $('[data-vd-qty-plus]', wrap)?.addEventListener('click', () => {
      input.value = Math.min(max, (parseInt(input.value, 10) || min) + 1);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  /* ---------- Reveal on scroll (intersection observer) ---------- */
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    $$('.vd-reveal').forEach((el) => io.observe(el));
  } else {
    $$('.vd-reveal').forEach((el) => el.classList.add('is-visible'));
  }

  /* ---------- Cart: AJAX add + drawer open ---------- */
  const cartUrls = window.routes || {};

  const fetchCart = async () => {
    const r = await fetch(`${window.shopUrl || ''}/cart.js`, { headers: { Accept: 'application/json' } });
    return r.json();
  };

  const formatMoney = (cents) => {
    const fmt = window.Shopify?.formatMoney;
    if (fmt) return fmt(cents, '{{amount_with_comma_separator}} €');
    return (cents / 100).toFixed(2).replace('.', ',') + ' €';
  };

  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

  const renderCartDrawerItems = (cart) => {
    return `<ul class="vd-cart-items" data-vd-cart-items>${cart.items.map((item, idx) => {
      const line = idx + 1;
      const variantLine = item.variant_title && item.variant_title !== 'Default Title'
        ? `<span class="vd-cart-item__variant">${escapeHtml(item.variant_title)}</span>`
        : '';
      const img = item.image ? item.image + '&width=240' : '';
      return `
      <li class="vd-cart-item" data-vd-cart-line="${line}">
        <a class="vd-cart-item__media" href="${escapeHtml(item.url)}" tabindex="-1" aria-hidden="true">
          ${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(item.product_title)}" loading="lazy" width="120" height="140">` : ''}
        </a>
        <div class="vd-cart-item__info">
          <a class="vd-cart-item__title" href="${escapeHtml(item.url)}">${escapeHtml(item.product_title)}</a>
          ${variantLine}
          <div class="vd-cart-item__row">
            <div class="vd-cart-item__qty" data-vd-qty>
              <button type="button" data-vd-qty-minus aria-label="Diminuer">
                <svg width="10" height="2" viewBox="0 0 10 2" fill="none" aria-hidden="true"><path d="M0 1h10" stroke="currentColor" stroke-width="1.5"/></svg>
              </button>
              <input type="number" min="0" value="${item.quantity}" data-vd-cart-qty="${line}" inputmode="numeric" aria-label="Quantité">
              <button type="button" data-vd-qty-plus aria-label="Augmenter">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M0 5h10M5 0v10" stroke="currentColor" stroke-width="1.5"/></svg>
              </button>
            </div>
            <button type="button" class="vd-cart-item__remove" data-vd-cart-remove="${line}">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 4h10M5 4V2.5h4V4M3.5 4l.6 8h5.8l.6-8M6 6.5v4M8 6.5v4"/></svg>
              <span>Supprimer</span>
            </button>
          </div>
        </div>
        <div class="vd-cart-item__price">${formatMoney(item.final_line_price)}</div>
      </li>`;
    }).join('')}</ul>`;
  };

  const renderShipping = (cart) => {
    const drawer = document.querySelector('#vd-cart-drawer');
    const label = document.querySelector('[data-vd-shipping-label]');
    const fill = document.querySelector('[data-vd-shipping-fill]');
    const bar = document.querySelector('.vd-cart-drawer__shipping-bar');
    if (!drawer || !label || !fill || !bar) return;
    const threshold = parseInt(drawer.dataset.thresholdCents || '3000', 10);
    const subtotal = cart.items_subtotal_price || 0;
    const remaining = Math.max(0, threshold - subtotal);
    const pct = Math.min(100, threshold > 0 ? Math.round((subtotal * 100) / threshold) : 0);
    if (cart.item_count === 0) {
      label.innerHTML = '&nbsp;';
      bar.setAttribute('hidden', '');
      fill.style.width = '0%';
      return;
    }
    bar.removeAttribute('hidden');
    fill.style.width = pct + '%';
    if (remaining <= 0) {
      label.innerHTML = 'Livraison offerte sur votre 1<sup>ère</sup> commande ✓';
    } else {
      label.innerHTML = `Plus que <strong>${formatMoney(remaining)}</strong> pour la livraison offerte sur votre 1<sup>ère</sup> commande.`;
    }
  };

  const renderCartDrawer = async () => {
    const body = document.querySelector('[data-vd-cart-body]');
    const foot = document.querySelector('[data-vd-cart-foot]');
    if (!body || !foot) return;
    const cart = await fetchCart();
    renderShipping(cart);
    if (cart.item_count === 0) {
      body.innerHTML = `<div class="vd-cart-drawer__empty">
        <p class="vd-cart-drawer__empty-title">Votre panier est vide</p>
        <a href="/collections/all" class="vd-cart-drawer__empty-cta" data-vd-drawer-close>Découvrir nos produits</a>
      </div>`;
      foot.setAttribute('hidden', '');
      return;
    }
    foot.removeAttribute('hidden');
    body.innerHTML = renderCartDrawerItems(cart);
    const totalEl = foot.querySelector('[data-vd-cart-total]');
    if (totalEl) totalEl.textContent = formatMoney(cart.total_price);
    // Re-evaluate CTA gating against current terms-checkbox state.
    syncCheckoutGate();
  };

  const syncCheckoutGate = () => {
    const cta = document.querySelector('[data-vd-cart-checkout]');
    const terms = document.querySelector('[data-vd-cart-terms]');
    if (!cta || !terms) return;
    if (terms.checked) {
      cta.classList.remove('is-disabled');
      cta.removeAttribute('aria-disabled');
    } else {
      cta.classList.add('is-disabled');
      cta.setAttribute('aria-disabled', 'true');
    }
  };

  // Hook terms checkbox + note textarea (delegated, drawer is in DOM at load).
  document.addEventListener('change', (e) => {
    if (e.target.matches?.('[data-vd-cart-terms]')) syncCheckoutGate();
  });
  document.addEventListener('click', (e) => {
    const cta = e.target.closest('[data-vd-cart-checkout]');
    if (cta && cta.getAttribute('aria-disabled') === 'true') {
      e.preventDefault();
      const terms = document.querySelector('[data-vd-cart-terms]');
      if (terms) {
        terms.focus();
        terms.closest('label')?.animate(
          [{ opacity: 0.4 }, { opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }],
          { duration: 600 }
        );
      }
    }
  });
  // Sync gate state on load (in case browser restores checkbox state).
  syncCheckoutGate();

  const updateCartCount = async () => {
    try {
      const cart = await fetchCart();
      $$('.vd-cart-count').forEach((el) => {
        el.textContent = cart.item_count;
        el.toggleAttribute('hidden', cart.item_count === 0);
      });
    } catch (_) {}
  };

  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[action$="/cart/add"]');
    if (!form) return;
    e.preventDefault();
    const submit = form.querySelector('[type=submit]');
    const originalLabel = submit?.textContent;
    if (submit) { submit.disabled = true; submit.textContent = '…'; }
    try {
      const fd = new FormData(form);
      const r = await fetch(cartUrls.cart_add_url || '/cart/add', {
        method: 'POST',
        body: fd,
        headers: { Accept: 'application/javascript' },
      });
      if (!r.ok) throw new Error(await r.text());
      await renderCartDrawer();
      await updateCartCount();
      openDrawer('vd-cart-drawer');
    } catch (err) {
      console.error(err);
      alert('Impossible d’ajouter au panier.');
    } finally {
      if (submit) { submit.disabled = false; submit.textContent = originalLabel; }
    }
  });

  document.addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('[data-vd-cart-remove]');
    if (removeBtn) {
      e.preventDefault();
      const line = parseInt(removeBtn.dataset.vdCartRemove, 10);
      await fetch(cartUrls.cart_change_url || '/cart/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ line, quantity: 0 }),
      });
      await renderCartDrawer();
      await updateCartCount();
      if (location.pathname.endsWith('/cart')) location.reload();
    }
  });

  document.addEventListener('change', async (e) => {
    const qtyInput = e.target.closest('[data-vd-cart-qty]');
    if (qtyInput) {
      const line = parseInt(qtyInput.dataset.vdCartQty, 10);
      const quantity = parseInt(qtyInput.value, 10) || 0;
      await fetch(cartUrls.cart_change_url || '/cart/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ line, quantity }),
      });
      await renderCartDrawer();
      await updateCartCount();
      if (location.pathname.endsWith('/cart')) location.reload();
    }
  });

  /* ---------- Reviews section: live aggregate from Judge.me public API ----------
     Le public token Judge.me donne accès à 2 endpoints publics :
       - /api/v1/widgets/all_reviews_count   → total d'avis
       - /api/v1/widgets/all_reviews_rating  → note moyenne
     Les textes des avis ne sont pas accessibles avec un public token : ils
     restent gérés via les blocs de la section (l'admin choisit quels
     témoignages mettre en avant). On met juste à jour la ligne
     "X / 5 — Y avis" en haut de la section avec les vraies valeurs. */
  document.querySelectorAll('[data-vd-judgeme]').forEach(async (section) => {
    const token = section.dataset.judgemeToken;
    const shop = section.dataset.judgemeShop;
    if (!token || !shop) return;
    const params = new URLSearchParams({ shop_domain: shop, api_token: token });
    try {
      const [countRes, rateRes] = await Promise.all([
        fetch(`https://judge.me/api/v1/widgets/all_reviews_count?${params}`),
        fetch(`https://judge.me/api/v1/widgets/all_reviews_rating?${params}`),
      ]);
      if (!countRes.ok || !rateRes.ok) {
        console.warn('[vd] Judge.me aggregate fetch failed', countRes.status, rateRes.status);
        return;
      }
      const countData = await countRes.json();
      const rateData = await rateRes.json();
      const count = countData.all_reviews_count;
      const rating = parseFloat(rateData.all_reviews_rating);
      if (!Number.isFinite(rating) || !Number.isFinite(count)) return;

      const ratingTextEl = section.querySelector('.vd-rev__rating-text');
      if (ratingTextEl) {
        ratingTextEl.textContent = `${rating.toFixed(2)} / 5 — ${count} avis`;
      }
      // Met à jour aussi l'aria-label des étoiles header.
      const starsEl = section.querySelector('.vd-rev__stars');
      if (starsEl) starsEl.setAttribute('aria-label', `${rating.toFixed(2)} étoiles sur 5`);
    } catch (err) {
      console.warn('[vd] Judge.me error:', err);
    }
  });

  /* ---------- Product card: dots ↔ swipe sync (mobile only) ----------
     Quand on swipe entre primary/secondary image dans une .vd-card__media,
     on update le dot actif dans .vd-card__dots du même parent. */
  const initCardDots = (root = document) => {
    root.querySelectorAll('.vd-card__media').forEach((media) => {
      if (media.dataset.vdCardSliderInit === '1') return;
      const figure = media.closest('.vd-card__figure');
      if (!figure) return;
      const dots = figure.querySelectorAll('.vd-card__dot');
      if (dots.length < 2) return;
      media.dataset.vdCardSliderInit = '1';
      let raf = null;
      media.addEventListener('scroll', () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = null;
          const idx = Math.round(media.scrollLeft / media.clientWidth);
          dots.forEach((d, i) => d.classList.toggle('is-active', i === idx));
        });
      }, { passive: true });
    });
  };
  initCardDots();
  // Re-run when new cards are inserted (e.g. AJAX collection load).
  if ('MutationObserver' in window) {
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1 && (node.matches?.('.vd-card') || node.querySelector?.('.vd-card'))) {
            initCardDots(node);
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* ---------- Parallax scroll on [data-vd-parallax] images ----------
     Translate verticalement l'image en fonction de la position de la section
     dans le viewport. L'image est légèrement plus haute que son container
     (height: 116%) pour avoir de la marge. Effet : profondeur, ralenti subtil. */
  const parallaxItems = Array.from(document.querySelectorAll('[data-vd-parallax]'));
  if (parallaxItems.length > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const SHIFT = 8; // %, doit être ≤ ((height - 100) / 2) pour rester dans le cadre.
    let raf = null;
    const updateParallax = () => {
      raf = null;
      const vh = window.innerHeight;
      for (const img of parallaxItems) {
        const container = img.parentElement;
        if (!container) continue;
        const rect = container.getBoundingClientRect();
        // Hors-écran : skip
        if (rect.bottom < -100 || rect.top > vh + 100) continue;
        // Progress -1 (section bottom au top du viewport) → 0 (centrée) → 1 (section top au bottom du viewport)
        const center = rect.top + rect.height / 2;
        const progress = Math.max(-1, Math.min(1, (center - vh / 2) / (vh / 2 + rect.height / 2)));
        // Quand progress = 1 → l'image est en bas (section qui arrive),
        // on la translate vers le haut (-SHIFT%). À -1 (sortie), on la pousse vers le bas (+SHIFT%).
        const translatePct = -progress * SHIFT;
        img.style.transform = `translateY(${translatePct}%)`;
      }
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(updateParallax);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    updateParallax();
  }

  /* ---------- Search drawer: live predictive search via /search/suggest.json ---------- */
  const searchDrawer = document.getElementById('vd-search-drawer');
  if (searchDrawer) {
    const input = searchDrawer.querySelector('[data-vd-search-input]');
    const idleEl = searchDrawer.querySelector('[data-vd-search-idle]');
    const resultsEl = searchDrawer.querySelector('[data-vd-search-results]');
    const escSearch = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);

    const showIdle = () => {
      idleEl.hidden = false;
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
    };
    const showResults = (html) => {
      idleEl.hidden = true;
      resultsEl.hidden = false;
      resultsEl.innerHTML = html;
    };

    let timer = null;
    let lastQuery = '';
    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (q === lastQuery) return;
      lastQuery = q;
      clearTimeout(timer);
      if (q.length < 2) {
        showIdle();
        return;
      }
      timer = setTimeout(async () => {
        try {
          const url = `/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product,collection&resources[limit]=8`;
          const r = await fetch(url, { headers: { Accept: 'application/json' } });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = await r.json();
          const products = data?.resources?.results?.products || [];
          const collections = data?.resources?.results?.collections || [];

          let html = '';
          if (collections.length) {
            html += `<section class="vd-search-drawer__results-section">
              <h3 class="vd-search-drawer__results-title">Collections</h3>
              <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;">`;
            for (const c of collections) {
              html += `<li><a href="${escSearch(c.url)}" class="vd-search-drawer__popular-link">${escSearch(c.title)}</a></li>`;
            }
            html += `</ul></section>`;
          }
          if (products.length) {
            html += `<section class="vd-search-drawer__results-section">
              <h3 class="vd-search-drawer__results-title">Produits (${products.length})</h3>`;
            for (const p of products) {
              const img = p.image ? `<img src="${escSearch(p.image)}" alt="" loading="lazy">` : '';
              const priceMin = p.price_min ?? p.price ?? '';
              const priceFormatted = typeof priceMin === 'string' ? priceMin : (priceMin / 100).toFixed(2).replace('.', ',') + ' €';
              html += `<a href="${escSearch(p.url)}" class="vd-search-drawer__result-item">
                <span class="vd-search-drawer__result-img">${img}</span>
                <span class="vd-search-drawer__result-info">
                  <span class="vd-search-drawer__result-title">${escSearch(p.title)}</span>
                  <span class="vd-search-drawer__result-price">${escSearch(priceFormatted)}</span>
                </span>
              </a>`;
            }
            html += `</section>`;
          }
          if (!products.length && !collections.length) {
            html = `<p class="vd-search-drawer__result-empty">Aucun résultat pour "${escSearch(q)}".</p>`;
          }
          showResults(html);
        } catch (err) {
          console.warn('[vd] Search suggest err:', err);
        }
      }, 200);
    });

    // Quand le drawer s'ouvre via data-vd-drawer-open, focus l'input.
    document.addEventListener('click', (e) => {
      const opener = e.target.closest('[data-vd-drawer-open="vd-search-drawer"]');
      if (opener) {
        setTimeout(() => input?.focus(), 50);
      }
    });

    // Auto-open si on a été redirigé depuis /search.
    try {
      if (sessionStorage.getItem('vd-open-search-on-load') === '1') {
        sessionStorage.removeItem('vd-open-search-on-load');
        const prefill = sessionStorage.getItem('vd-search-prefill');
        sessionStorage.removeItem('vd-search-prefill');
        requestAnimationFrame(() => {
          openDrawer('vd-search-drawer');
          setTimeout(() => {
            input?.focus();
            if (prefill && input) {
              input.value = prefill;
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }, 60);
        });
      }
    } catch (_) {}
  }

  /* ---------- Sync drawers' top with the announcement bar's bottom ----------
     Si l'utilisateur est tout en haut de la page, la barre d'annonce occupe les
     ~32px du haut. Le drawer doit commencer juste en dessous (= sous la barre)
     pour qu'elle reste visible. Quand l'utilisateur scrolle, la barre d'annonce
     s'en va, le drawer monte jusqu'à top:0. */
  const syncDrawersTop = () => {
    const announcement = document.querySelector('.vd-announcement, [class*="announcement-bar"]');
    let topPx = 0;
    if (announcement) {
      const rect = announcement.getBoundingClientRect();
      // bottom > 0 = barre visible (au moins en partie). On clamp pour éviter
      // les valeurs négatives quand elle est totalement scrollée.
      topPx = Math.max(0, rect.bottom);
    }
    document.documentElement.style.setProperty('--vd-drawer-top', topPx + 'px');
  };
  syncDrawersTop();
  window.addEventListener('scroll', syncDrawersTop, { passive: true });
  window.addEventListener('resize', syncDrawersTop);
  window.addEventListener('load', syncDrawersTop);

  /* ---------- Sync .vd-megadrawer__head height with the rendered <header> ----------
     Le drawer head doit avoir EXACTEMENT la même hauteur que .vd-header pour
     que le close + label tombent pile en face du burger + nav. On mesure au
     runtime parce que la hauteur dépend du logo (40/32px), du padding
     responsive et de la classe .is-scrolled — pas calculable en CSS pur. */
  const syncHeaderHeight = () => {
    const header = document.querySelector('.vd-header');
    if (!header) return;
    const h = header.offsetHeight;
    if (h > 0) document.documentElement.style.setProperty('--vd-header-real-h', h + 'px');
  };
  syncHeaderHeight();
  window.addEventListener('resize', syncHeaderHeight);
  window.addEventListener('load', syncHeaderHeight);
  // Re-sync if the header DOM changes (e.g. .is-scrolled toggles, or admin edits).
  const headerEl = document.querySelector('.vd-header');
  if (headerEl && 'ResizeObserver' in window) {
    new ResizeObserver(syncHeaderHeight).observe(headerEl);
  }

  /* ---------- Initial cart count sync ---------- */
  updateCartCount();

  /* ---------- Auto-open drawer after /cart redirect ---------- */
  try {
    if (sessionStorage.getItem('vd-open-cart-on-load') === '1') {
      sessionStorage.removeItem('vd-open-cart-on-load');
      // Wait for drawer DOM and other scripts to settle.
      requestAnimationFrame(() => {
        renderCartDrawer().then(() => openDrawer('vd-cart-drawer'));
      });
    }
  } catch (_) {}
})();
