(function () {
  if (window.__vdWikiTeaserBooted) return;
  window.__vdWikiTeaserBooted = true;

  function toArray(items) {
    return Array.prototype.slice.call(items || []);
  }

  function padNumber(value) {
    return String(value).padStart(2, '0');
  }

  function safeAddListener(query, handler) {
    if (!query) return function () {};

    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handler);
      return function () {
        query.removeEventListener('change', handler);
      };
    }

    if (typeof query.addListener === 'function') {
      query.addListener(handler);
      return function () {
        query.removeListener(handler);
      };
    }

    return function () {};
  }

  function setMediaPlayback(slide, shouldPlay) {
    toArray(slide ? slide.querySelectorAll('video') : []).forEach(function (video) {
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
    });
  }

  function cleanupSection(section) {
    if (section && typeof section.__vdWikiTeaserCleanup === 'function') {
      section.__vdWikiTeaserCleanup();
      section.__vdWikiTeaserCleanup = null;
    }
  }

  function initRegions(section) {
    var buttons = toArray(section.querySelectorAll('[data-vd-wiki-region-button]'));
    var cards = toArray(section.querySelectorAll('[data-vd-wiki-region-card]'));
    var marks = toArray(section.querySelectorAll('[data-vd-wiki-region-mark]'));
    var cleanups = [];

    if (!buttons.length || !cards.length) {
      return function () {};
    }

    function setActiveRegion(regionId) {
      buttons.forEach(function (button) {
        var isActive = button.getAttribute('data-vd-wiki-region-button') === regionId;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      cards.forEach(function (card) {
        var isActive = card.getAttribute('data-vd-wiki-region-card') === regionId;
        card.classList.toggle('is-active', isActive);
      });

      marks.forEach(function (mark) {
        var isActive = mark.getAttribute('data-vd-wiki-region-mark') === regionId;
        mark.classList.toggle('is-active', isActive);
      });
    }

    buttons.forEach(function (button, index) {
      var regionId = button.getAttribute('data-vd-wiki-region-button');

      if (!button.hasAttribute('aria-pressed')) {
        button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
      }

      function handleActivate(event) {
        if (event && event.type === 'click') {
          event.preventDefault();
        }

        setActiveRegion(regionId);
      }

      button.addEventListener('mouseenter', handleActivate);
      button.addEventListener('focus', handleActivate);
      button.addEventListener('click', handleActivate);

      cleanups.push(function () {
        button.removeEventListener('mouseenter', handleActivate);
        button.removeEventListener('focus', handleActivate);
        button.removeEventListener('click', handleActivate);
      });
    });

    setActiveRegion(buttons[0].getAttribute('data-vd-wiki-region-button'));

    return function () {
      cleanups.forEach(function (cleanup) {
        cleanup();
      });
    };
  }

  function initSection(section) {
    if (!section) return;

    cleanupSection(section);

    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;
    var SplitText = window.SplitText;
    var viewport = section.querySelector('[data-vd-wiki-viewport]');
    var track = section.querySelector('[data-vd-wiki-track]');
    var slides = toArray(section.querySelectorAll('[data-vd-wiki-slide]'));
    var navButtons = toArray(section.querySelectorAll('[data-vd-wiki-nav]'));
    var counter = section.querySelector('[data-vd-wiki-counter]');
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var desktopQuery = window.matchMedia('(min-width: 990px)');
    var activeIndex = 0;
    var modeCleanup = function () {};
    var generalCleanups = [];
    var currentMode = 'mobile';
    var desktopState = null;

    if (!viewport || !track || !slides.length) return;

    if (gsap && ScrollTrigger && typeof gsap.registerPlugin === 'function') {
      gsap.registerPlugin(ScrollTrigger);

      if (SplitText) {
        gsap.registerPlugin(SplitText);
      }
    }

    generalCleanups.push(initRegions(section));

    function setActive(index) {
      var clamped = Math.max(0, Math.min(index, slides.length - 1));

      activeIndex = clamped;
      section.setAttribute('data-vd-wiki-active', String(clamped));

      slides.forEach(function (slide, slideIndex) {
        var isActive = slideIndex === clamped;
        slide.classList.toggle('is-active', isActive);
        slide.setAttribute('aria-current', isActive ? 'true' : 'false');
        setMediaPlayback(slide, isActive);
      });

      navButtons.forEach(function (button, buttonIndex) {
        var isActive = buttonIndex === clamped;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      if (counter) {
        counter.textContent = padNumber(clamped + 1) + ' / ' + padNumber(slides.length);
      }
    }

    function scrollViewportTo(index) {
      var targetLeft = Math.max(0, index) * viewport.clientWidth;

      if (typeof viewport.scrollTo === 'function') {
        viewport.scrollTo({
          left: targetLeft,
          behavior: reduceMotion.matches ? 'auto' : 'smooth'
        });
      } else {
        viewport.scrollLeft = targetLeft;
      }
    }

    function scrollWindowTo(index) {
      if (!desktopState || !desktopState.trigger) return;

      var trigger = desktopState.trigger;
      var progress = slides.length > 1 ? index / (slides.length - 1) : 0;
      var targetTop = trigger.start + (trigger.end - trigger.start) * progress;
      var smoother =
        window.ScrollSmoother && typeof window.ScrollSmoother.get === 'function' ? window.ScrollSmoother.get() : null;

      if (smoother && typeof smoother.scrollTo === 'function') {
        smoother.scrollTo(targetTop, !reduceMotion.matches);
        return;
      }

      if (typeof window.scrollTo === 'function') {
        window.scrollTo({
          top: targetTop,
          behavior: reduceMotion.matches ? 'auto' : 'smooth'
        });
      }
    }

    function goToSlide(index) {
      var clamped = Math.max(0, Math.min(index, slides.length - 1));

      if (currentMode === 'desktop') {
        scrollWindowTo(clamped);
      } else {
        scrollViewportTo(clamped);
      }
    }

    navButtons.forEach(function (button) {
      function handleClick(event) {
        event.preventDefault();
        goToSlide(Number(button.getAttribute('data-vd-wiki-nav')));
      }

      button.addEventListener('click', handleClick);
      generalCleanups.push(function () {
        button.removeEventListener('click', handleClick);
      });
    });

    function handleKeydown(event) {
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        goToSlide(activeIndex + 1);
      }

      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        goToSlide(activeIndex - 1);
      }
    }

    viewport.addEventListener('keydown', handleKeydown);
    generalCleanups.push(function () {
      viewport.removeEventListener('keydown', handleKeydown);
    });

    function shouldUseDesktopMode() {
      return !!(gsap && ScrollTrigger && desktopQuery.matches && !reduceMotion.matches && slides.length > 1);
    }

    function clearInlineTransforms() {
      if (!gsap) return;

      gsap.set(
        toArray(section.querySelectorAll('[data-vd-wiki-title], [data-vd-wiki-body], [data-vd-wiki-media], [data-vd-wiki-petal], [data-vd-wiki-plane], [data-vd-wiki-region-button], [data-vd-wiki-region-mark], [data-vd-wiki-track]')),
        { clearProps: 'all' }
      );
    }

    function setupMobileMode() {
      var ticking = false;

      currentMode = reduceMotion.matches ? 'reduced' : 'mobile';
      desktopState = null;

      section.classList.remove('is-desktop');
      section.classList.add('is-mobile');
      section.classList.toggle('is-reduced', reduceMotion.matches);

      clearInlineTransforms();

      function syncActiveSlide() {
        ticking = false;
        setActive(Math.round(viewport.scrollLeft / Math.max(viewport.clientWidth, 1)));
      }

      function handleScroll() {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(syncActiveSlide);
      }

      viewport.addEventListener('scroll', handleScroll, { passive: true });
      syncActiveSlide();

      return function () {
        viewport.removeEventListener('scroll', handleScroll);
      };
    }

    function setupDesktopMode() {
      var titleGroups = [];
      var animations = [];
      var triggers = [];
      var titles = [];
      var mainTween;
      var mainTrigger;

      currentMode = 'desktop';
      section.classList.add('is-desktop');
      section.classList.remove('is-mobile');
      section.classList.remove('is-reduced');
      viewport.scrollLeft = 0;

      titles = slides.map(function (slide) {
        return slide.querySelector('[data-vd-wiki-title]');
      });

      titleGroups = titles.map(function (title) {
        if (!title || !SplitText || typeof SplitText.create !== 'function') {
          return { node: title, split: null, lines: title ? [title] : [] };
        }

        var split = SplitText.create(title, {
          type: 'lines',
          linesClass: 'vd-wiki-teaser__title-line'
        });

        return {
          node: title,
          split: split,
          lines: split && split.lines ? split.lines.slice() : [title]
        };
      });

      mainTween = gsap.to(track, {
        x: function () {
          return -(track.scrollWidth - viewport.clientWidth);
        },
        ease: 'none',
        overwrite: true
      });

      mainTrigger = ScrollTrigger.create({
        animation: mainTween,
        trigger: section,
        start: 'top top',
        end: function () {
          var distance = track.scrollWidth - viewport.clientWidth;
          return '+=' + Math.max(distance, viewport.clientWidth * (slides.length - 1));
        },
        pin: true,
        scrub: 0.85,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        snap:
          slides.length > 1
            ? {
                snapTo: function (value) {
                  var step = 1 / (slides.length - 1);
                  return Math.round(value / step) * step;
                },
                duration: { min: 0.18, max: 0.42 },
                ease: 'power2.out'
              }
            : false,
        onUpdate: function (self) {
          setActive(Math.round(self.progress * (slides.length - 1)));
        }
      });

      desktopState = { trigger: mainTrigger };
      animations.push(mainTween);
      triggers.push(mainTrigger);

      slides.forEach(function (slide, index) {
        var titleTargets = titleGroups[index].lines && titleGroups[index].lines.length ? titleGroups[index].lines : [];
        var bodyTargets = toArray(slide.querySelectorAll('[data-vd-wiki-body], [data-vd-wiki-meta]'));
        var mediaTarget = slide.querySelector('[data-vd-wiki-media]');
        var petalTargets = toArray(slide.querySelectorAll('[data-vd-wiki-petal]'));
        var planeTargets = toArray(slide.querySelectorAll('[data-vd-wiki-plane]'));
        var regionTargets = toArray(slide.querySelectorAll('[data-vd-wiki-region-button]'));
        var markTargets = toArray(slide.querySelectorAll('[data-vd-wiki-region-mark]'));

        if (titleTargets.length) {
          animations.push(
            gsap.fromTo(
              titleTargets,
              { xPercent: 18, yPercent: 20, autoAlpha: 0.34 },
              {
                xPercent: -8,
                yPercent: 0,
                autoAlpha: 1,
                ease: 'none',
                stagger: 0.08,
                scrollTrigger: {
                  trigger: slide,
                  containerAnimation: mainTween,
                  start: 'left 82%',
                  end: 'right 18%',
                  scrub: true
                }
              }
            )
          );
        }

        if (bodyTargets.length) {
          animations.push(
            gsap.fromTo(
              bodyTargets,
              { xPercent: 10, yPercent: 8, autoAlpha: 0.2 },
              {
                xPercent: -6,
                yPercent: 0,
                autoAlpha: 1,
                ease: 'none',
                stagger: 0.04,
                scrollTrigger: {
                  trigger: slide,
                  containerAnimation: mainTween,
                  start: 'left 74%',
                  end: 'right 24%',
                  scrub: true
                }
              }
            )
          );
        }

        if (mediaTarget) {
          animations.push(
            gsap.fromTo(
              mediaTarget,
              { xPercent: index % 2 === 0 ? 10 : -10, scale: 1.06 },
              {
                xPercent: index % 2 === 0 ? -6 : 6,
                scale: 1,
                ease: 'none',
                scrollTrigger: {
                  trigger: slide,
                  containerAnimation: mainTween,
                  start: 'left 88%',
                  end: 'right 14%',
                  scrub: true
                }
              }
            )
          );
        }

        if (petalTargets.length) {
          animations.push(
            gsap.fromTo(
              petalTargets,
              { scale: 0.74, rotate: -18, autoAlpha: 0.28 },
              {
                scale: 1.08,
                rotate: 18,
                autoAlpha: 0.84,
                ease: 'none',
                stagger: 0.05,
                scrollTrigger: {
                  trigger: slide,
                  containerAnimation: mainTween,
                  start: 'left 88%',
                  end: 'right 16%',
                  scrub: true
                }
              }
            )
          );
        }

        if (planeTargets.length) {
          animations.push(
            gsap.fromTo(
              planeTargets,
              { xPercent: 10, yPercent: 6, rotate: -3 },
              {
                xPercent: -4,
                yPercent: -4,
                rotate: 2,
                ease: 'none',
                stagger: 0.06,
                scrollTrigger: {
                  trigger: slide,
                  containerAnimation: mainTween,
                  start: 'left 78%',
                  end: 'right 22%',
                  scrub: true
                }
              }
            )
          );
        }

        if (regionTargets.length) {
          animations.push(
            gsap.fromTo(
              regionTargets,
              { autoAlpha: 0.35, yPercent: 10 },
              {
                autoAlpha: 1,
                yPercent: 0,
                ease: 'none',
                stagger: 0.04,
                scrollTrigger: {
                  trigger: slide,
                  containerAnimation: mainTween,
                  start: 'left 78%',
                  end: 'right 20%',
                  scrub: true
                }
              }
            )
          );
        }

        if (markTargets.length) {
          animations.push(
            gsap.fromTo(
              markTargets,
              { scale: 0.82, autoAlpha: 0.46 },
              {
                scale: 1.1,
                autoAlpha: 0.98,
                ease: 'none',
                stagger: 0.04,
                scrollTrigger: {
                  trigger: slide,
                  containerAnimation: mainTween,
                  start: 'left 78%',
                  end: 'right 20%',
                  scrub: true
                }
              }
            )
          );
        }

        triggers.push(
          ScrollTrigger.create({
            trigger: slide,
            containerAnimation: mainTween,
            start: 'left center',
            end: 'right center',
            onToggle: function (self) {
              if (self.isActive) {
                setActive(index);
              }
            }
          })
        );
      });

      setActive(activeIndex);
      ScrollTrigger.refresh();

      return function () {
        triggers.forEach(function (trigger) {
          if (trigger && typeof trigger.kill === 'function') {
            trigger.kill();
          }
        });

        animations.forEach(function (animation) {
          if (animation && typeof animation.kill === 'function') {
            animation.kill();
          }
        });

        titleGroups.forEach(function (group) {
          if (group.split && typeof group.split.revert === 'function') {
            group.split.revert();
          }
        });

        clearInlineTransforms();
        desktopState = null;
      };
    }

    function rebuildMode() {
      modeCleanup();
      modeCleanup = shouldUseDesktopMode() ? setupDesktopMode() : setupMobileMode();
    }

    rebuildMode();
    setActive(0);

    var resizeTimer = null;

    function handleResize() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(rebuildMode, 180);
    }

    window.addEventListener('resize', handleResize);
    generalCleanups.push(function () {
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
    });

    generalCleanups.push(safeAddListener(reduceMotion, rebuildMode));
    generalCleanups.push(safeAddListener(desktopQuery, rebuildMode));

    section.__vdWikiTeaserCleanup = function () {
      modeCleanup();
      generalCleanups.forEach(function (cleanup) {
        cleanup();
      });
      slides.forEach(function (slide) {
        setMediaPlayback(slide, false);
      });
      section.classList.remove('is-desktop');
      section.classList.remove('is-mobile');
      section.classList.remove('is-reduced');
    };
  }

  function initAll(root) {
    toArray((root || document).querySelectorAll('[data-vd-wiki-teaser]')).forEach(initSection);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initAll(document);
    });
  } else {
    initAll(document);
  }

  document.addEventListener('shopify:section:load', function (event) {
    initAll(event.target);
  });

  document.addEventListener('shopify:section:unload', function (event) {
    toArray(event.target.querySelectorAll('[data-vd-wiki-teaser]')).forEach(cleanupSection);
  });
})();
