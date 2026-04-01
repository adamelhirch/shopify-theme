(function () {
  if (window.__vdWikiTeaserBooted) return;
  window.__vdWikiTeaserBooted = true;

  function toArray(items) {
    return Array.prototype.slice.call(items || []);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
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

  function cleanupSection(section) {
    if (section && typeof section.__vdWikiTeaserCleanup === 'function') {
      section.__vdWikiTeaserCleanup();
      section.__vdWikiTeaserCleanup = null;
    }
  }

  function syncVideoElement(video, shouldPlay) {
    if (!video) return;

    video.muted = true;
    video.playsInline = true;

    if (shouldPlay) {
      var playPromise = video.play();

      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () {});
      }

      return;
    }

    video.pause();
  }

  function initRegions(section) {
    var buttons = toArray(section.querySelectorAll('[data-vd-wiki-region-button]'));
    var cards = toArray(section.querySelectorAll('[data-vd-wiki-region-card]'));
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
    }

    buttons.forEach(function (button) {
      var regionId = button.getAttribute('data-vd-wiki-region-button');

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

  function initCursor(section, getDefaultLabel) {
    var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    var cursor = section.querySelector('[data-vd-wiki-cursor]');
    var cursorText = section.querySelector('[data-vd-wiki-cursor-text]');
    var hoverTargets = toArray(section.querySelectorAll('[data-vd-wiki-cursor-label]'));
    var cleanups = [];
    var overrideLabel = '';
    var isEnabled = !!(cursor && cursorText && finePointer.matches);
    var xTo;
    var yTo;

    if (!isEnabled) {
      return {
        cleanup: function () {},
        sync: function () {}
      };
    }

    section.classList.add('has-cursor');

    if (window.gsap) {
      xTo = window.gsap.quickTo(cursor, 'x', { duration: 0.18, ease: 'power3.out' });
      yTo = window.gsap.quickTo(cursor, 'y', { duration: 0.18, ease: 'power3.out' });
    }

    function getLabel() {
      return overrideLabel || getDefaultLabel() || 'Explorer';
    }

    function syncLabel() {
      cursorText.textContent = getLabel();
    }

    function handlePointerEnter() {
      syncLabel();

      if (window.gsap) {
        window.gsap.to(cursor, { autoAlpha: 1, scale: 1, duration: 0.24, ease: 'power2.out' });
      } else {
        cursor.style.opacity = '1';
      }
    }

    function handlePointerMove(event) {
      if (xTo && yTo) {
        xTo(event.clientX);
        yTo(event.clientY);
      } else {
        cursor.style.transform = 'translate3d(' + event.clientX + 'px,' + event.clientY + 'px,0)';
      }
    }

    function handlePointerLeave() {
      if (window.gsap) {
        window.gsap.to(cursor, { autoAlpha: 0, scale: 0.92, duration: 0.22, ease: 'power2.out' });
      } else {
        cursor.style.opacity = '0';
      }

      overrideLabel = '';
      syncLabel();
    }

    function bindHoverTarget(target) {
      function activate() {
        overrideLabel = target.getAttribute('data-vd-wiki-cursor-label') || '';
        syncLabel();
      }

      function clear() {
        overrideLabel = '';
        syncLabel();
      }

      target.addEventListener('mouseenter', activate);
      target.addEventListener('focus', activate);
      target.addEventListener('mouseleave', clear);
      target.addEventListener('blur', clear);

      cleanups.push(function () {
        target.removeEventListener('mouseenter', activate);
        target.removeEventListener('focus', activate);
        target.removeEventListener('mouseleave', clear);
        target.removeEventListener('blur', clear);
      });
    }

    section.addEventListener('pointerenter', handlePointerEnter);
    section.addEventListener('pointermove', handlePointerMove);
    section.addEventListener('pointerleave', handlePointerLeave);

    hoverTargets.forEach(bindHoverTarget);

    cleanups.push(function () {
      section.removeEventListener('pointerenter', handlePointerEnter);
      section.removeEventListener('pointermove', handlePointerMove);
      section.removeEventListener('pointerleave', handlePointerLeave);
      section.classList.remove('has-cursor');
    });

    syncLabel();

    return {
      cleanup: function () {
        cleanups.forEach(function (cleanup) {
          cleanup();
        });
      },
      sync: syncLabel
    };
  }

  function initSection(section) {
    if (!section) return;

    cleanupSection(section);

    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;
    var SplitText = window.SplitText;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var desktopQuery = window.matchMedia('(min-width: 990px)');
    var viewport = section.querySelector('[data-vd-wiki-viewport]');
    var track = section.querySelector('[data-vd-wiki-track]');
    var slides = toArray(section.querySelectorAll('[data-vd-wiki-slide]'));
    var navButtons = toArray(section.querySelectorAll('[data-vd-wiki-nav]'));
    var counter = section.querySelector('[data-vd-wiki-counter]');
    var backdropLayers = toArray(section.querySelectorAll('[data-vd-wiki-backdrop-layer]'));
    var chapterVideos = toArray(section.querySelectorAll('video'));
    var blurNode = section.querySelector('[data-vd-wiki-blur-node]');
    var mapPath = section.querySelector('[data-vd-wiki-map-draw]');
    var mapMarker = section.querySelector('[data-vd-wiki-map-marker]');
    var mapLength = mapPath && typeof mapPath.getTotalLength === 'function' ? mapPath.getTotalLength() : 0;
    var activeIndex = 0;
    var modeCleanup = function () {};
    var generalCleanups = [];
    var currentMode = 'mobile';
    var desktopState = null;
    var cursorController;

    if (!viewport || !track || !slides.length) return;

    if (gsap && ScrollTrigger && typeof gsap.registerPlugin === 'function') {
      gsap.registerPlugin(ScrollTrigger);

      if (SplitText) {
        gsap.registerPlugin(SplitText);
      }
    }

    if (mapPath && mapLength) {
      mapPath.style.strokeDasharray = String(mapLength);
      mapPath.style.strokeDashoffset = String(mapLength);
    }

    function getDefaultCursorLabel() {
      return slides[activeIndex] ? slides[activeIndex].getAttribute('data-vd-wiki-cursor') || 'Explorer' : 'Explorer';
    }

    cursorController = initCursor(section, getDefaultCursorLabel);
    generalCleanups.push(function () {
      cursorController.cleanup();
    });
    generalCleanups.push(initRegions(section));

    function setBlur(value) {
      if (!blurNode) return;
      blurNode.setAttribute('stdDeviation', value.toFixed(2) + ' 0');
    }

    function setActive(index) {
      var clamped = clamp(Math.round(index), 0, slides.length - 1);

      activeIndex = clamped;
      section.setAttribute('data-vd-wiki-active', String(clamped));

      slides.forEach(function (slide, slideIndex) {
        var isActive = slideIndex === clamped;
        slide.classList.toggle('is-active', isActive);
        slide.setAttribute('aria-current', isActive ? 'true' : 'false');
      });

      navButtons.forEach(function (button, buttonIndex) {
        var isActive = buttonIndex === clamped;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      if (counter) {
        counter.textContent = padNumber(clamped + 1) + ' / ' + padNumber(slides.length);
      }

      chapterVideos.forEach(function (video) {
        var owner = video.closest('[data-vd-wiki-video-index]');
        var videoIndex = owner ? Number(owner.getAttribute('data-vd-wiki-video-index')) : -1;
        syncVideoElement(video, videoIndex === clamped);
      });

      cursorController.sync();
    }

    function setBackdropState(position) {
      if (!backdropLayers.length) return;

      backdropLayers.forEach(function (layer, index) {
        var image = layer.querySelector('img, video');
        var distance = Math.abs(index - position);
        var opacity = clamp(1 - distance, 0, 1);
        var scale = 1 + (1 - opacity) * 0.2;
        var brightness = 0.4 + opacity * 0.42;
        var contrast = 0.9 + opacity * 0.16;
        var saturation = 0.94 + opacity * 0.08;

        layer.classList.toggle('is-active', opacity > 0.02);

        if (gsap) {
          gsap.set(layer, {
            autoAlpha: opacity,
            scale: scale,
            zIndex: opacity > 0.02 ? 2 + Math.round(opacity * 10) : 0
          });
        } else {
          layer.style.opacity = String(opacity);
        }

        if (image) {
          image.style.filter =
            'brightness(' +
            brightness.toFixed(3) +
            ') contrast(' +
            contrast.toFixed(3) +
            ') saturate(' +
            saturation.toFixed(3) +
            ')';
        }
      });
    }

    function setMapReveal(progress) {
      if (!mapPath || !mapLength) return;
      mapPath.style.strokeDashoffset = String(mapLength * (1 - clamp(progress, 0, 1)));
    }

    function syncStaticVisuals(position) {
      var mapProximity = clamp(1 - Math.abs(position - 1), 0, 1);
      setBackdropState(position);
      setMapReveal(mapProximity);
    }

    navButtons.forEach(function (button) {
      function handleClick(event) {
        var index = Number(button.getAttribute('data-vd-wiki-nav'));

        event.preventDefault();
        setActive(index);
        syncStaticVisuals(index);
        goToSlide(index);
      }

      button.addEventListener('click', handleClick);
      generalCleanups.push(function () {
        button.removeEventListener('click', handleClick);
      });
    });

    function scrollViewportTo(index) {
      var targetLeft = clamp(index, 0, slides.length - 1) * viewport.clientWidth;

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
      var trigger = desktopState && desktopState.trigger;
      var smoother =
        window.ScrollSmoother && typeof window.ScrollSmoother.get === 'function' ? window.ScrollSmoother.get() : null;
      var progress;
      var targetTop;

      if (!trigger) return;

      progress = slides.length > 1 ? clamp(index, 0, slides.length - 1) / (slides.length - 1) : 0;
      targetTop = trigger.start + (trigger.end - trigger.start) * progress;

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
      if (currentMode === 'desktop') {
        scrollWindowTo(index);
      } else {
        scrollViewportTo(index);
      }
    }

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

    function setupMobileMode() {
      var ticking = false;

      currentMode = reduceMotion.matches ? 'reduced' : 'mobile';
      desktopState = null;
      section.classList.remove('is-desktop');
      section.classList.add('is-mobile');
      section.classList.toggle('is-reduced', reduceMotion.matches);
      setBlur(0);

      function syncFromScroll() {
        var position = viewport.scrollLeft / Math.max(viewport.clientWidth, 1);
        ticking = false;
        setActive(position);
        syncStaticVisuals(position);
      }

      function handleScroll() {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(syncFromScroll);
      }

      viewport.addEventListener('scroll', handleScroll, { passive: true });
      syncFromScroll();

      return function () {
        viewport.removeEventListener('scroll', handleScroll);
      };
    }

    function setupDesktopMode() {
      var titleGroups = [];
      var animations = [];
      var triggers = [];
      var blurState = { value: 0 };
      var blurTween = null;
      var lastProgress = 0;
      var mainTween;
      var mainTrigger;

      currentMode = 'desktop';
      section.classList.add('is-desktop');
      section.classList.remove('is-mobile');
      section.classList.remove('is-reduced');
      viewport.scrollLeft = 0;

      titleGroups = slides.map(function (slide) {
        var title = slide.querySelector('[data-vd-wiki-title]');

        if (!title || !SplitText || typeof SplitText.create !== 'function') {
          return { split: null, chars: title ? [title] : [] };
        }

        var split = SplitText.create(title, {
          type: 'chars',
          charsClass: 'vd-wiki-char'
        });

        return {
          split: split,
          chars: split && split.chars ? split.chars.slice() : [title]
        };
      });

      mainTween = gsap.to(track, {
        x: function () {
          return -(track.scrollWidth - viewport.clientWidth);
        },
        ease: 'none',
        overwrite: true
      });

      function kickBlur(delta) {
        var target = clamp(Math.abs(delta) * 1200, 0, 14);

        if (blurTween) {
          blurTween.kill();
        }

        blurState.value = target;
        setBlur(blurState.value);

        blurTween = gsap.to(blurState, {
          value: 0,
          duration: 0.42,
          ease: 'power2.out',
          overwrite: true,
          onUpdate: function () {
            setBlur(blurState.value);
          }
        });
      }

      mainTrigger = ScrollTrigger.create({
        animation: mainTween,
        trigger: section,
        start: 'top top',
        end: function () {
          return '+=' + Math.max(track.scrollWidth - viewport.clientWidth, viewport.clientWidth * (slides.length - 1));
        },
        pin: true,
        scrub: 0.92,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        snap:
          slides.length > 1
            ? {
                snapTo: 1 / (slides.length - 1),
                duration: { min: 0.18, max: 0.36 },
                ease: 'power2.inOut'
              }
            : false,
        onUpdate: function (self) {
          var position = self.progress * (slides.length - 1);
          setActive(position);
          setBackdropState(position);
          kickBlur(self.progress - lastProgress);
          lastProgress = self.progress;
        }
      });

      desktopState = { trigger: mainTrigger };
      animations.push(mainTween);
      triggers.push(mainTrigger);
      syncStaticVisuals(0);

      slides.forEach(function (slide, index) {
        var group = titleGroups[index];
        var bodyTargets = toArray(slide.querySelectorAll('[data-vd-wiki-body], [data-vd-wiki-meta]'));
        var stageTargets = toArray(slide.querySelectorAll('[data-vd-wiki-stage-main]'));
        var bloomTargets = toArray(slide.querySelectorAll('[data-vd-wiki-bloom]'));

        if (group.chars.length) {
          animations.push(
            gsap.fromTo(
              group.chars,
              {
                autoAlpha: 0.02,
                xPercent: 18,
                yPercent: 12,
                filter: 'blur(10px)'
              },
              {
                autoAlpha: 1,
                xPercent: 0,
                yPercent: 0,
                filter: 'blur(0px)',
                stagger: 0.014,
                ease: 'power3.out',
                scrollTrigger: {
                  trigger: slide,
                  containerAnimation: mainTween,
                  start: 'left 76%',
                  end: 'left 38%',
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
              {
                autoAlpha: 0.34,
                yPercent: 10
              },
              {
                autoAlpha: 1,
                yPercent: 0,
                stagger: 0.05,
                ease: 'power2.out',
                scrollTrigger: {
                  trigger: slide,
                  containerAnimation: mainTween,
                  start: 'left 74%',
                  end: 'left 34%',
                  scrub: true
                }
              }
            )
          );
        }

        if (stageTargets.length) {
          animations.push(
            gsap.fromTo(
              stageTargets,
              {
                autoAlpha: 0.62,
                xPercent: 4,
                scale: 1.02
              },
              {
                autoAlpha: 1,
                xPercent: -2,
                scale: 1,
                ease: 'none',
                scrollTrigger: {
                  trigger: slide,
                  containerAnimation: mainTween,
                  start: 'left 88%',
                  end: 'right 18%',
                  scrub: true
                }
              }
            )
          );
        }

        if (bloomTargets.length) {
          animations.push(
            gsap.fromTo(
              bloomTargets,
              {
                autoAlpha: 0.18,
                scale: 0.88
              },
              {
                autoAlpha: 0.9,
                scale: 1.04,
                stagger: 0.06,
                ease: 'none',
                scrollTrigger: {
                  trigger: slide,
                  containerAnimation: mainTween,
                  start: 'left 82%',
                  end: 'right 28%',
                  scrub: true
                }
              }
            )
          );
        }
      });

      if (mapPath && mapLength && slides[1]) {
        animations.push(
          gsap.fromTo(
            mapPath,
            { strokeDashoffset: mapLength },
            {
              strokeDashoffset: 0,
              ease: 'none',
              scrollTrigger: {
                trigger: slides[1],
                containerAnimation: mainTween,
                start: 'left 72%',
                end: 'left 38%',
                scrub: true
              }
            }
          )
        );

        if (mapMarker) {
          gsap.set(mapMarker, { autoAlpha: 1, scale: 1 });
        }
      }

      setActive(0);
      ScrollTrigger.refresh();

      return function () {
        if (blurTween) {
          blurTween.kill();
        }

        if (pulseTween) {
          pulseTween.kill();
        }

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

        setBlur(0);
        setActive(activeIndex);
        syncStaticVisuals(activeIndex);
      };
    }

    function rebuildMode() {
      modeCleanup();
      modeCleanup = shouldUseDesktopMode() ? setupDesktopMode() : setupMobileMode();
    }

    rebuildMode();

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
      chapterVideos.forEach(function (video) {
        syncVideoElement(video, false);
      });
      section.classList.remove('is-desktop');
      section.classList.remove('is-mobile');
      section.classList.remove('is-reduced');
      setBlur(0);
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
