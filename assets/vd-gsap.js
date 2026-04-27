(function () {
  function splitTextNodes(element, mode) {
    var text = (element.textContent || '').trim();

    if (!text) return [];

    var fragment = document.createDocumentFragment();
    var units = mode === 'chars' ? text.split('') : text.split(/\s+/);
    var className = mode === 'chars' ? 'vd-split-char' : 'vd-split-word';
    var parts = [];

    element.textContent = '';

    units.forEach(function (unit, index) {
      if (mode === 'chars' && unit === ' ') {
        fragment.appendChild(document.createTextNode(' '));
        return;
      }

      var span = document.createElement('span');
      span.className = className;
      span.textContent = unit;
      fragment.appendChild(span);
      parts.push(span);

      if (mode === 'words' && index < units.length - 1) {
        fragment.appendChild(document.createTextNode(' '));
      }
    });

    element.appendChild(fragment);
    element.classList.add('is-split');

    return parts;
  }

  function setMediaPlayback(panel, shouldPlay) {
    var video = panel ? panel.querySelector('video') : null;

    if (!video) return;

    video.muted = true;
    video.playsInline = true;

    if (shouldPlay) {
      var playPromise = video.play();

      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () {});
      }
    } else {
      video.pause();
    }
  }

  function syncCraftStoryState(panels, steps, activeIndex, managePlayback) {
    panels.forEach(function (panel, index) {
      panel.classList.toggle('is-active', index === activeIndex);

      if (managePlayback) {
        setMediaPlayback(panel, index === activeIndex);
      }
    });

    steps.forEach(function (step, index) {
      step.classList.toggle('is-active', index === activeIndex);
    });
  }

  function clearCraftStoryStyles(gsap, section, panels, steps, quoteCards, introItems) {
    var targets = panels.concat(steps, quoteCards, introItems);

    section.classList.remove('is-enhanced');
    gsap.set(targets, { clearProps: 'all' });
    syncCraftStoryState(panels, steps, 0, false);
  }

  function clearFeatureGalleryStyles(gsap, section, strip, cards) {
    section.classList.remove('is-enhanced');
    gsap.set([strip].concat(cards), { clearProps: 'all' });
  }

  function clearNewProductBentoStyles(gsap, section, gallery, items) {
    section.classList.remove('is-enhanced');

    if (gallery) {
      gallery.classList.remove('vd-new-product__gallery--final');
    }

    if (items.length) {
      gsap.set(items, { clearProps: 'all' });
    }
  }

  function runRegisteredCleanups(cleanups) {
    if (!cleanups || !cleanups.length) return;

    cleanups.forEach(function (cleanup) {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    });

    cleanups.length = 0;
  }

  function registerCleanup(cleanups, cleanup) {
    if (!cleanups || typeof cleanup !== 'function') return;
    cleanups.push(cleanup);
  }

  function getMotionAssets() {
    return window.__vdMotionAssets || {};
  }

  function emitMotionReady() {
    window.dispatchEvent(
      new CustomEvent('vd:motion-ready', {
        detail: {
          hasGsap: Boolean(window.gsap),
          hasScrollTrigger: Boolean(window.ScrollTrigger),
          hasSplitText: Boolean(window.SplitText)
        }
      })
    );
  }

  function hasMotionTargets() {
    return Boolean(
      document.querySelector('.section-vd-hero') ||
        document.querySelector('[data-vd-craft-story]') ||
        document.querySelector('[data-vd-feature-gallery]') ||
        document.querySelector('[data-vd-bento-section]') ||
        document.querySelector('[data-vd-collection-hero]') ||
        document.querySelector('[data-vd-wiki-teaser]') ||
        document.querySelector('.vd-reveal')
    );
  }

  function hasSmootherTargets() {
    return Boolean(
      document.querySelector('[data-vd-craft-story]') ||
        document.querySelector('[data-vd-feature-gallery]') ||
        document.querySelector('[data-vd-bento-section]') ||
        document.querySelector('[data-vd-wiki-teaser]')
    );
  }

  function isReducedMotionPreferred() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function shouldUseDesktopMotion() {
    return window.innerWidth >= 990 && !isReducedMotionPreferred();
  }

  function loadScriptOnce(key, src) {
    if (!src) return Promise.resolve();

    var registry = window.__vdMotionScriptPromises || (window.__vdMotionScriptPromises = {});
    if (registry[key]) return registry[key];

    registry[key] = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-vd-motion-key="' + key + '"]');

      if (existing && existing.getAttribute('data-loaded') === 'true') {
        resolve();
        return;
      }

      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.defer = true;
      script.setAttribute('data-vd-motion-key', key);
      script.addEventListener(
        'load',
        function () {
          script.setAttribute('data-loaded', 'true');
          resolve();
        },
        { once: true }
      );
      script.addEventListener('error', reject, { once: true });
      document.head.appendChild(script);
    });

    return registry[key];
  }

  function waitForFontsReady(timeoutMs) {
    if (!document.fonts || !document.fonts.ready) {
      return Promise.resolve();
    }

    return Promise.race([
      document.fonts.ready.catch(function () {}),
      new Promise(function (resolve) {
        window.setTimeout(resolve, timeoutMs || 1800);
      })
    ]);
  }

  function shouldLoadDeferredVideo(video) {
    if (!video) return false;
    if (isReducedMotionPreferred()) return false;

    var minimumWidth = Number(video.getAttribute('data-min-width') || 0);
    if (minimumWidth && window.innerWidth < minimumWidth) return false;

    var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection && (connection.saveData || /(^|slow-)?2g/.test(connection.effectiveType || ''))) {
      return false;
    }

    return Boolean(video.getAttribute('data-video-src'));
  }

  function activateDeferredVideo(video) {
    if (!shouldLoadDeferredVideo(video) || video.getAttribute('data-vd-video-mounted') === 'true') {
      return;
    }

    var source = video.querySelector('source');
    var sourceUrl = video.getAttribute('data-video-src');

    if (!source || !sourceUrl) return;

    video.setAttribute('data-vd-video-mounted', 'true');
    source.src = sourceUrl;
    video.load();

    var revealVideo = function () {
      video.classList.add('is-ready');
      var playPromise = video.play();

      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () {});
      }
    };

    video.addEventListener('loadeddata', revealVideo, { once: true });
    video.addEventListener('canplay', revealVideo, { once: true });
  }

  function getDeferredVideoDelay(video) {
    var delay = Number(video && video.getAttribute('data-vd-video-delay'));
    return Number.isFinite(delay) && delay > 0 ? delay : 0;
  }

  function runWhenWindowLoaded(callback) {
    if (document.readyState === 'complete') {
      callback();
      return;
    }

    window.addEventListener('load', callback, { once: true });
  }

  function scheduleDeferredVideoActivation(video) {
    var delay = getDeferredVideoDelay(video);

    var activate = function () {
      if (delay > 0) {
        window.setTimeout(function () {
          activateDeferredVideo(video);
        }, delay);
        return;
      }

      activateDeferredVideo(video);
    };

    if (video.getAttribute('data-vd-video-load') === 'idle') {
      runWhenWindowLoaded(function () {
        if ('requestIdleCallback' in window) {
          window.requestIdleCallback(activate, { timeout: Math.max(1800, delay || 0) });
        } else {
          window.setTimeout(activate, Math.max(320, delay));
        }
      });
      return;
    }

    activate();
  }

  function initDeferredHeroMedia() {
    var deferredVideos = Array.prototype.slice.call(document.querySelectorAll('[data-vd-deferred-video]'));

    if (!deferredVideos.length) return;

    var eagerVideos = [];
    var observedVideos = [];

    deferredVideos.forEach(function (video) {
      if (video.getAttribute('data-vd-video-mounted') === 'true') return;

      if (video.getAttribute('data-vd-video-load') === 'idle') {
        eagerVideos.push(video);
      } else {
        observedVideos.push(video);
      }
    });

    var startIdle = function () {
      eagerVideos.forEach(scheduleDeferredVideoActivation);
    };

    if (eagerVideos.length) {
      startIdle();
    }

    if (!observedVideos.length) return;

    if (!('IntersectionObserver' in window)) {
      window.setTimeout(function () {
        observedVideos.forEach(activateDeferredVideo);
      }, 420);
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          activateDeferredVideo(entry.target);
        });
      },
      { rootMargin: '240px 0px' }
    );

    observedVideos.forEach(function (video) {
      observer.observe(video);
    });
  }

  function bootstrapVanilleGsap(forceRebuild) {
    if (window.Shopify && window.Shopify.designMode) {
      return Promise.resolve(false);
    }

    if (!hasMotionTargets()) {
      return Promise.resolve(false);
    }

    var assets = getMotionAssets();
    var desktopMotion = shouldUseDesktopMotion();
    var needsSplitText =
      desktopMotion &&
      Boolean(
        document.querySelector('[data-vd-collection-hero] .collection-hero__title-text') ||
          document.querySelector('[data-vd-wiki-teaser] [data-vd-wiki-title]')
      );
    var loadBaseMotion = loadScriptOnce('gsap', assets.gsap).then(function () {
      return loadScriptOnce('scroll-trigger', assets.scrollTrigger);
    });
    var optionalLoads = [loadBaseMotion];

    if (desktopMotion && document.querySelector('#smooth-wrapper') && document.querySelector('#smooth-content')) {
      optionalLoads.push(loadBaseMotion.then(function () {
        return loadScriptOnce('scroll-smoother', assets.scrollSmoother);
      }));
    }

    if (desktopMotion && document.querySelector('[data-vd-bento-section]')) {
      optionalLoads.push(loadBaseMotion.then(function () {
        return loadScriptOnce('flip', assets.flip);
      }));
    }

    if (needsSplitText) {
      optionalLoads.push(loadBaseMotion.then(function () {
        return loadScriptOnce('split-text', assets.splitText);
      }));
    }

    return Promise.all(optionalLoads)
      .then(function () {
        return needsSplitText ? waitForFontsReady(2400) : null;
      })
      .then(function () {
        initVanilleGsap(forceRebuild);
        emitMotionReady();
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function initCraftStories(gsap, ScrollTrigger, prefersReducedMotion, cleanups) {
    gsap.utils.toArray('[data-vd-savoir]').forEach(function (section) {
      var line = section.querySelector('[data-vd-savoir-line]');
      var steps = gsap.utils.toArray(section.querySelectorAll('[data-vd-savoir-step]'));

      if (prefersReducedMotion) return;

      /* Line grows with scroll */
      if (line) {
        gsap.fromTo(line,
          { scaleX: 0 },
          {
            scaleX: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: section,
              start: 'top 80%',
              end: 'center 40%',
              scrub: 0.6
            }
          }
        );
      }

      /* Steps fade-up staggered */
      if (steps.length) {
        steps.forEach(function (step, index) {
          gsap.fromTo(step,
            { opacity: 0, y: 30 },
            {
              opacity: 1,
              y: 0,
              duration: 0.6,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: step,
                start: 'top 85%',
                once: true
              },
              delay: index * 0.1
            }
          );
        });
      }
    });
  }

  function initFeatureGalleries(gsap, ScrollTrigger, prefersReducedMotion, cleanups) {
    gsap.utils.toArray('[data-vd-feature-gallery]').forEach(function (section) {
      var wrapper = section.querySelector('[data-vd-feature-gallery-wrapper]');
      var strip = section.querySelector('[data-vd-feature-gallery-strip]');
      var cards = gsap.utils.toArray(section.querySelectorAll('[data-vd-feature-card]'));

      if (!wrapper || !strip || cards.length < 2) return;

      clearFeatureGalleryStyles(gsap, section, strip, cards);

      if (prefersReducedMotion || window.innerWidth < 990) {
        return;
      }

      section.classList.add('is-enhanced');

      gsap.set(cards, { autoAlpha: 1, y: 0 });

      var getScrollLength = function () {
        return Math.max(strip.scrollWidth - window.innerWidth, 0);
      };

      var animation = gsap.to(strip, {
        x: function () {
          return -getScrollLength();
        },
        ease: 'none',
        scrollTrigger: {
          trigger: wrapper,
          pin: wrapper,
          start: 'center center',
          end: function () {
            return '+=' + Math.max(strip.scrollWidth, window.innerWidth * 1.4);
          },
          scrub: true,
          anticipatePin: 1,
          invalidateOnRefresh: true
        }
      });

      registerCleanup(cleanups, function () {
        if (animation.scrollTrigger) {
          animation.scrollTrigger.kill();
        }

        animation.kill();
        clearFeatureGalleryStyles(gsap, section, strip, cards);
      });
    });
  }

  function initNewProductBentos(gsap, ScrollTrigger, prefersReducedMotion, Flip, cleanups) {
    gsap.utils.toArray('[data-vd-bento-section]').forEach(function (section) {
      var stage = section.querySelector('[data-vd-bento-stage]');
      var gallery = section.querySelector('[data-vd-bento-gallery]');
      var items = gsap.utils.toArray(section.querySelectorAll('[data-vd-bento-item]'));

      if (!stage || !gallery || items.length < 4 || !Flip) return;

      clearNewProductBentoStyles(gsap, section, gallery, items);
      section.classList.remove('is-enhanced');
    });
  }

  function initCollectionHeroes(gsap, ScrollTrigger, prefersReducedMotion, cleanups) {
    gsap.utils.toArray('[data-vd-collection-hero]').forEach(function (section) {
      var SplitText = window.SplitText;
      var backdrop = section.querySelector('[data-vd-collection-backdrop], .collection-hero__backdrop-media');
      var panels = gsap.utils.toArray(section.querySelectorAll('[data-vd-collection-panel]'));
      var items = gsap.utils.toArray(section.querySelectorAll('[data-vd-collection-item]'));
      var introItems = items.filter(function (item) {
        return !item.classList.contains('collection-hero__title');
      });
      var media = section.querySelector('[data-vd-collection-media]');
      var titleText = section.querySelector('.collection-hero__title-text');
      var titleTargets = titleText ? [titleText] : [];
      var titleSplit = null;
      var auras = gsap.utils.toArray(section.querySelectorAll('.collection-hero__aura'));
      var timeline;
      var introTimeline;
      var auraTween;

      if (!backdrop && !panels.length && !media) return;

      if (backdrop) {
        gsap.set(backdrop, { clearProps: 'transform' });
      }

      if (panels.length) {
        gsap.set(panels, { clearProps: 'transform,opacity,filter' });
      }

      if (items.length) {
        gsap.set(items, { clearProps: 'transform,opacity,filter' });
      }

      if (media) {
        gsap.set(media, { clearProps: 'transform,opacity,filter,clipPath' });
      }

      if (auras.length) {
        gsap.set(auras, { clearProps: 'transform,opacity' });
      }

      if (!prefersReducedMotion) {
        if (titleText && SplitText && typeof SplitText.create === 'function') {
          titleSplit = SplitText.create(titleText, {
            type: 'lines,words',
            linesClass: 'vd-collection-line',
            wordsClass: 'vd-collection-word',
            mask: 'lines'
          });

          if (titleSplit && titleSplit.words && titleSplit.words.length) {
            titleTargets = titleSplit.words.slice();
          }
        }

        introTimeline = gsap.timeline({
          defaults: { ease: 'expo.out' },
          scrollTrigger: {
            trigger: section,
            start: 'top 82%',
            once: true
          }
        });

        if (panels.length) {
          introTimeline.fromTo(
            panels,
            { y: 52, autoAlpha: 0, filter: 'blur(12px)' },
            { y: 0, autoAlpha: 1, filter: 'blur(0px)', duration: 1.2, stagger: 0.08 },
            0
          );
        }

        if (titleTargets.length) {
          introTimeline.fromTo(
            titleTargets,
            { yPercent: 110, autoAlpha: 0, rotateX: -14, transformOrigin: '50% 100%' },
            { yPercent: 0, autoAlpha: 1, rotateX: 0, duration: 1.18, stagger: 0.03 },
            0.06
          );
        }

        if (introItems.length) {
          introTimeline.fromTo(
            introItems,
            { y: 30, autoAlpha: 0, filter: 'blur(8px)' },
            { y: 0, autoAlpha: 1, filter: 'blur(0px)', duration: 0.92, stagger: 0.07 },
            0.12
          );
        }

        if (media) {
          introTimeline.fromTo(
            media,
            {
              x: 44,
              y: 32,
              rotate: -3,
              scale: 0.88,
              autoAlpha: 0,
              filter: 'blur(16px) saturate(0.8)',
              clipPath: 'inset(12% 10% 14% 10% round 3rem)'
            },
            {
              x: 0,
              y: 0,
              rotate: 0,
              scale: 1,
              autoAlpha: 1,
              filter: 'blur(0px) saturate(1)',
              clipPath: 'inset(0% 0% 0% 0% round 3rem)',
              duration: 1.3
            },
            0.08
          );
        }

        if (auras.length) {
          auraTween = gsap.timeline({
            repeat: -1,
            yoyo: true,
            defaults: { ease: 'sine.inOut', duration: 4.8 }
          });

          if (auras[0]) {
            auraTween.to(
              auras[0],
              { x: 22, y: -16, scale: 1.06, autoAlpha: 0.9 },
              0
            );
          }

          if (auras[1]) {
            auraTween.to(
              auras[1],
              { x: -18, y: 14, scale: 0.94, autoAlpha: 0.72 },
              0
            );
          }
        }
      }

      timeline = gsap.timeline({
        defaults: { ease: 'expo.out' },
        scrollTrigger: {
          trigger: section,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1
        }
      });

      if (backdrop) {
        timeline.fromTo(
          backdrop,
          { scale: 1.18, yPercent: -3 },
          { scale: 1.08, yPercent: 4, ease: 'none' },
          0
        );
      }

      if (panels.length) {
        timeline.fromTo(
          panels,
          { yPercent: 2 },
          { yPercent: -3, ease: 'none', stagger: 0.04 },
          0
        );
      }

      if (media) {
        timeline.fromTo(
          media,
          { yPercent: -2, rotate: -1.5 },
          { yPercent: 3, rotate: 1.5, ease: 'none' },
          0
        );
      }

      registerCleanup(cleanups, function () {
        if (introTimeline) {
          if (introTimeline.scrollTrigger) {
            introTimeline.scrollTrigger.kill();
          }

          introTimeline.kill();
        }

        if (timeline.scrollTrigger) {
          timeline.scrollTrigger.kill();
        }

        timeline.kill();

        if (auraTween) {
          auraTween.kill();
        }

        if (titleSplit) {
          titleSplit.revert();
          titleSplit = null;
        }

        if (backdrop) {
          gsap.set(backdrop, { clearProps: 'transform' });
        }

        if (panels.length) {
          gsap.set(panels, { clearProps: 'transform,opacity,filter' });
        }

        if (items.length) {
          gsap.set(items, { clearProps: 'transform,opacity,filter' });
        }

        if (media) {
          gsap.set(media, { clearProps: 'transform,opacity,filter,clipPath' });
        }

        if (auras.length) {
          gsap.set(auras, { clearProps: 'transform,opacity' });
        }
      });
    });
  }

  function initFooterScenes(gsap, ScrollTrigger, prefersReducedMotion, cleanups) {
    gsap.utils.toArray('[data-vd-footer-scene]').forEach(function (section) {
      var items = gsap.utils.toArray(section.querySelectorAll('[data-vd-footer-item]'));
      var introTimeline;

      if (!items.length) return;

      gsap.set(items, { clearProps: 'opacity,filter' });

      if (!prefersReducedMotion && window.innerWidth >= 990) {
        introTimeline = gsap.timeline({
          defaults: { ease: 'power2.out' },
          scrollTrigger: {
            trigger: section,
            start: 'top 85%',
            once: true
          }
        });

        introTimeline.fromTo(
          items,
          { autoAlpha: 0, filter: 'blur(10px)' },
          { autoAlpha: 1, filter: 'blur(0px)', duration: 1.5, stagger: 0.1 },
          0
        );
      }

      registerCleanup(cleanups, function () {
        if (introTimeline) {
          if (introTimeline.scrollTrigger) {
            introTimeline.scrollTrigger.kill();
          }

          introTimeline.kill();
        }

        gsap.set(items, { clearProps: 'opacity,filter' });
      });
    });
  }

  function initVanilleGsap(forceRebuild) {
    if (!window.gsap || !window.ScrollTrigger) return;
    if (window.Shopify && window.Shopify.designMode) return;

    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;
    var ScrollSmoother = window.ScrollSmoother || null;
    var Flip = window.Flip || null;
    var state = window.__vdGsapState || {
      cleanups: [],
      initialized: false,
      allowSmoother: null,
      isDesktop: null,
      prefersReducedMotion: null
    };

    var plugins = [ScrollTrigger];
    if (ScrollSmoother) plugins.push(ScrollSmoother);
    if (Flip) plugins.push(Flip);
    gsap.registerPlugin.apply(gsap, plugins);

    var prefersReducedMotion = isReducedMotionPreferred();
    var isDesktop = window.innerWidth >= 990;
    var allowSmoother = Boolean(ScrollSmoother) && !prefersReducedMotion && isDesktop && hasSmootherTargets();
    var shouldRebuild =
      forceRebuild ||
      !state.initialized ||
      state.allowSmoother !== allowSmoother ||
      state.isDesktop !== isDesktop ||
      state.prefersReducedMotion !== prefersReducedMotion;

    window.__vdGsapState = state;

    if (!shouldRebuild) {
      ScrollTrigger.refresh();
      return;
    }

    runRegisteredCleanups(state.cleanups);

    var existingSmoother = ScrollSmoother && typeof ScrollSmoother.get === 'function' ? ScrollSmoother.get() : null;
    if (existingSmoother) existingSmoother.kill();

    if (allowSmoother && document.querySelector('#smooth-wrapper') && document.querySelector('#smooth-content')) {
      ScrollSmoother.create({
        wrapper: '#smooth-wrapper',
        content: '#smooth-content',
        smooth: 1.35,
        effects: true,
        normalizeScroll: true,
        smoothTouch: false
      });
    }

    var headerWrapper = document.querySelector('[data-vd-header-wrapper]');

    if (headerWrapper) {
      gsap.set(headerWrapper, { clearProps: 'all' });

      if (!prefersReducedMotion) {
        var headerTween = gsap.to(headerWrapper, {
          '--vd-header-shell-height': '5.4rem',
          '--vd-header-shell-padding-x': '1.4rem',
          '--vd-header-shell-blur': '20px',
          duration: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: document.documentElement,
            start: 0,
            end: '+=180',
            scrub: true
          }
        });

        registerCleanup(state.cleanups, function () {
          if (headerTween.scrollTrigger) {
            headerTween.scrollTrigger.kill();
          }

          headerTween.kill();
          gsap.set(headerWrapper, { clearProps: 'all' });
        });
      }
    }

    var hero = document.querySelector('.section-vd-hero');
    if (hero) {
      var statement = hero.querySelector('.vd-hero__statement');
      var scrollLabel = hero.querySelector('.vd-hero__scroll span');
      var media = hero.querySelector('.vd-hero__media');

      var wordsStatement = statement ? splitTextNodes(statement, 'words') : [];
      var words = scrollLabel ? splitTextNodes(scrollLabel, 'words') : [];

      var heroTimeline = gsap.timeline({ defaults: { ease: 'expo.out' } });

      if (wordsStatement.length) {
        heroTimeline.fromTo(
          wordsStatement,
          { autoAlpha: 0, y: 24, letterSpacing: '0.18em' },
          { autoAlpha: 1, y: 0, letterSpacing: '0.03em', duration: 1.8, stagger: 0.1 },
          0
        );
      }

      if (words.length) {
        heroTimeline.fromTo(
          words,
          { autoAlpha: 0, y: 18, letterSpacing: '0.34em' },
          { autoAlpha: 1, y: 0, letterSpacing: '0.18em', duration: 1.5, stagger: 0.1 },
          '-=1.05'
        );
      }

      if (media) {
        gsap.set(media, { clearProps: 'transform' });
      }

      registerCleanup(state.cleanups, function () {
        heroTimeline.kill();
      });
    }

    initCraftStories(gsap, ScrollTrigger, prefersReducedMotion, state.cleanups);
    initFeatureGalleries(gsap, ScrollTrigger, prefersReducedMotion, state.cleanups);
    initNewProductBentos(gsap, ScrollTrigger, prefersReducedMotion, Flip, state.cleanups);
    initCollectionHeroes(gsap, ScrollTrigger, prefersReducedMotion, state.cleanups);
    initFooterScenes(gsap, ScrollTrigger, prefersReducedMotion, state.cleanups);

    gsap.utils.toArray('.vd-reveal').forEach(function (section) {
      var items = section.querySelectorAll('.vd-reveal-item');

      if (!items.length) return;

      var revealTween = gsap.fromTo(
        items,
        { autoAlpha: 0, y: 32 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 1.6,
          ease: 'expo.out',
          stagger: 0.1,
          scrollTrigger: {
            trigger: section,
            start: 'top 78%'
          }
        }
      );

      registerCleanup(state.cleanups, function () {
        if (revealTween.scrollTrigger) {
          revealTween.scrollTrigger.kill();
        }

        revealTween.kill();
        gsap.set(items, { clearProps: 'all' });
      });
    });

    /* Guide banner — blur reveal on scroll */
    gsap.utils.toArray('[data-vd-guide-banner]').forEach(function (banner) {
      var img = banner.querySelector('.vd-guide-banner__img');
      if (!img || prefersReducedMotion) {
        if (img) img.style.filter = 'none';
        return;
      }

      gsap.to(img, {
        filter: 'blur(0px) brightness(1)',
        ease: 'none',
        scrollTrigger: {
          trigger: banner,
          start: 'top bottom',
          end: 'center center',
          scrub: 0.4
        }
      });
    });

    /* Social mosaic — stack-grid layout + scroll reveal */
    gsap.utils.toArray('[data-vd-social-mosaic]').forEach(function (mosaic) {
      var tiles = gsap.utils.toArray(mosaic.querySelectorAll('[data-vd-social-tile]'));

      if (!tiles.length) return;

      function getColumnCount() {
        if (window.innerWidth >= 990) return 4;
        if (window.innerWidth >= 750) return 3;
        return 2;
      }

      function layoutMosaic() {
        var cols = getColumnCount();
        var gap = 4;
        var containerWidth = mosaic.offsetWidth;
        var colWidth = (containerWidth - gap * (cols - 1)) / cols;
        var colHeights = [];
        var i;

        for (i = 0; i < cols; i++) { colHeights.push(0); }

        tiles.forEach(function (tile) {
          tile.style.width = colWidth + 'px';
          tile.style.position = 'absolute';

          /* Find shortest column */
          var minCol = 0;
          var minH = colHeights[0];
          for (i = 1; i < cols; i++) {
            if (colHeights[i] < minH) { minH = colHeights[i]; minCol = i; }
          }

          var x = minCol * (colWidth + gap);
          var y = colHeights[minCol];

          tile.style.left = x + 'px';
          tile.style.top = y + 'px';

          /* Use custom ratio from data attribute for varied heights */
          var customRatio = parseFloat(tile.getAttribute('data-vd-tile-ratio')) || 1;
          var img = tile.querySelector('img');
          var tileHeight;
          if (img && img.naturalHeight && img.naturalWidth) {
            tileHeight = colWidth * (img.naturalHeight / img.naturalWidth);
          } else {
            tileHeight = colWidth * customRatio;
          }
          tile.style.height = tileHeight + 'px';

          colHeights[minCol] += tileHeight + gap;
        });

        var maxHeight = Math.max.apply(null, colHeights);

        /* Stretch last tile of each column to align bottom edge */
        var colLastTile = [];
        for (i = 0; i < cols; i++) { colLastTile.push(null); }

        tiles.forEach(function (tile) {
          var tileLeft = parseFloat(tile.style.left);
          var col = Math.round(tileLeft / (colWidth + gap));
          colLastTile[col] = tile;
        });

        for (i = 0; i < cols; i++) {
          if (colLastTile[i] && colHeights[i] < maxHeight) {
            var currentTop = parseFloat(colLastTile[i].style.top);
            var currentH = parseFloat(colLastTile[i].style.height);
            var extra = maxHeight - colHeights[i];
            colLastTile[i].style.height = (currentH + extra) + 'px';
          }
        }

        mosaic.style.height = maxHeight + 'px';
      }

      /* Wait for images to get dimensions, then layout */
      var images = mosaic.querySelectorAll('img');
      var loaded = 0;
      var total = images.length || 1;

      function onImageReady() {
        loaded++;
        if (loaded >= total) { layoutMosaic(); }
      }

      if (images.length === 0) {
        layoutMosaic();
      } else {
        Array.prototype.forEach.call(images, function (img) {
          if (img.complete) { onImageReady(); }
          else { img.addEventListener('load', onImageReady); img.addEventListener('error', onImageReady); }
        });
      }

      window.addEventListener('resize', function () {
        clearTimeout(mosaic.__resizeTimer);
        mosaic.__resizeTimer = setTimeout(layoutMosaic, 150);
      });

      /* Scroll reveal */
      if (prefersReducedMotion) {
        tiles.forEach(function (t) { t.classList.add('is-visible'); });
        return;
      }

      ScrollTrigger.create({
        trigger: mosaic,
        start: 'top 85%',
        once: true,
        onEnter: function () {
          tiles.forEach(function (t) { t.classList.add('is-visible'); });
        }
      });
    });

    state.allowSmoother = allowSmoother;
    state.isDesktop = isDesktop;
    state.prefersReducedMotion = prefersReducedMotion;
    state.initialized = true;

    ScrollTrigger.refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initDeferredHeroMedia();
      bootstrapVanilleGsap(true);
    });
  } else {
    initDeferredHeroMedia();
    bootstrapVanilleGsap(true);
  }

  var reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var handleReducedMotionChange = function () {
    bootstrapVanilleGsap(true);
  };

  if (typeof reducedMotionQuery.addEventListener === 'function') {
    reducedMotionQuery.addEventListener('change', handleReducedMotionChange);
  } else if (typeof reducedMotionQuery.addListener === 'function') {
    reducedMotionQuery.addListener(handleReducedMotionChange);
  }

  window.addEventListener('resize', function () {
    window.clearTimeout(window.__vdGsapResizeTimer);
    window.__vdGsapResizeTimer = window.setTimeout(function () {
      initDeferredHeroMedia();
      bootstrapVanilleGsap(false);
    }, 220);
  });
})();
