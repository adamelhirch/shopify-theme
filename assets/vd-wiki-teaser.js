(function () {
  if (window.__vdWikiTeaserBooted) return;
  window.__vdWikiTeaserBooted = true;

  function toArray(items) {
    return Array.prototype.slice.call(items || []);
  }

  function padNumber(value) {
    return String(value).padStart(2, '0');
  }

  function getSlideLink(slide) {
    return slide ? slide.querySelector('.vd-wiki-teaser__panel-link[href]') : null;
  }

  function setMediaPlayback(slide, shouldPlay) {
    var video = slide ? slide.querySelector('video') : null;

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

  function syncCta(cta, slide) {
    if (!cta) return;

    var target = getSlideLink(slide);
    var href = target ? target.getAttribute('href') : '';

    cta.setAttribute('href', href || '#');

    if (href) {
      cta.classList.remove('is-disabled');
      cta.removeAttribute('aria-disabled');
    } else {
      cta.classList.add('is-disabled');
      cta.setAttribute('aria-disabled', 'true');
    }
  }

  function cleanupSection(section) {
    if (section && typeof section.__vdWikiTeaserCleanup === 'function') {
      section.__vdWikiTeaserCleanup();
      section.__vdWikiTeaserCleanup = null;
    }
  }

  function setStaticState(section, slides, navButtons, cta) {
    var counter = section.querySelector('[data-vd-wiki-counter]');
    var total = slides.length || 1;

    section.classList.add('is-static');
    section.classList.remove('is-ready');

    slides.forEach(function (slide, index) {
      var isActive = index === 0;
      var link = slide.querySelector('.vd-wiki-teaser__panel-link');

      slide.classList.toggle('is-active', isActive);
      slide.setAttribute('aria-hidden', isActive ? 'false' : 'true');

      if (link) {
        link.tabIndex = isActive ? 0 : -1;
      }

      setMediaPlayback(slide, isActive);
    });

    navButtons.forEach(function (button, index) {
      var isActive = index === 0;

      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    if (counter) {
      counter.textContent = padNumber(1) + ' / ' + padNumber(total);
    }

    syncCta(cta, slides[0]);
  }

  function createTitleGroup(title, SplitText) {
    if (!title) {
      return { node: null, split: null, lines: [] };
    }

    if (SplitText && typeof SplitText.create === 'function') {
      var split = SplitText.create(title, {
        type: 'lines',
        linesClass: 'vd-wiki-teaser__title-line'
      });

      return {
        node: title,
        split: split,
        lines: split && split.lines ? split.lines.slice() : [title]
      };
    }

    return {
      node: title,
      split: null,
      lines: [title]
    };
  }

  function getTitleTargets(group) {
    if (!group) return [];
    if (group.lines && group.lines.length) return group.lines;
    return group.node ? [group.node] : [];
  }

  function initSection(section) {
    if (!section) return;

    cleanupSection(section);

    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;
    var SplitText = window.SplitText;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var slides = toArray(section.querySelectorAll('[data-vd-wiki-slide]'));
    var navButtons = toArray(section.querySelectorAll('[data-vd-wiki-nav]'));
    var viewport = section.querySelector('[data-vd-wiki-viewport]');
    var counter = section.querySelector('[data-vd-wiki-counter]');
    var cta = section.querySelector('[data-vd-wiki-cta]');

    if (!slides.length || !viewport) return;

    if (!gsap || !ScrollTrigger || typeof ScrollTrigger.observe !== 'function' || reduceMotion.matches || slides.length < 2) {
      setStaticState(section, slides, navButtons, cta);
      return;
    }

    if (typeof gsap.registerPlugin === 'function') {
      gsap.registerPlugin(ScrollTrigger);

      if (SplitText) {
        gsap.registerPlugin(SplitText);
      }
    }

    section.classList.remove('is-static');
    section.classList.add('is-ready');

    var outerWrappers = slides.map(function (slide) {
      return slide.querySelector('[data-vd-wiki-outer]');
    });
    var innerWrappers = slides.map(function (slide) {
      return slide.querySelector('[data-vd-wiki-inner]');
    });
    var mediaNodes = slides.map(function (slide) {
      return slide.querySelector('[data-vd-wiki-media]');
    });
    var titleGroups = slides.map(function (slide) {
      return createTitleGroup(slide.querySelector('[data-vd-wiki-title]'), SplitText);
    });
    var currentIndex = 0;
    var animating = false;
    var suppressObserver = false;
    var cleanups = [];

    function updateUi(index) {
      var total = slides.length;
      var activeSlide = slides[index];

      slides.forEach(function (slide, slideIndex) {
        var link = slide.querySelector('.vd-wiki-teaser__panel-link');
        var isActive = slideIndex === index;

        slide.classList.toggle('is-active', isActive);
        slide.setAttribute('aria-hidden', isActive ? 'false' : 'true');

        if (link) {
          link.tabIndex = isActive ? 0 : -1;
        }

        setMediaPlayback(slide, isActive);
      });

      navButtons.forEach(function (button, buttonIndex) {
        var isActive = buttonIndex === index;

        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      if (counter) {
        counter.textContent = padNumber(index + 1) + ' / ' + padNumber(total);
      }

      syncCta(cta, activeSlide);
    }

    function releaseScroll(direction) {
      if (suppressObserver) return;

      suppressObserver = true;
      intentObserver.disable();
      preventScroll.disable();
      animating = false;

      var nextScroll = direction > 0 ? activationTrigger.end + 2 : activationTrigger.start - 2;

      activationTrigger.scroll(nextScroll);
      window.setTimeout(function () {
        suppressObserver = false;
      }, 180);
    }

    function setImmediateState(index) {
      slides.forEach(function (slide, slideIndex) {
        var isActive = slideIndex === index;
        var titleTargets = getTitleTargets(titleGroups[slideIndex]);

        gsap.set(slide, { autoAlpha: isActive ? 1 : 0, zIndex: isActive ? 1 : 0 });

        if (outerWrappers[slideIndex]) {
          gsap.set(outerWrappers[slideIndex], { yPercent: 0 });
        }

        if (innerWrappers[slideIndex]) {
          gsap.set(innerWrappers[slideIndex], { yPercent: 0 });
        }

        if (mediaNodes[slideIndex]) {
          gsap.set(mediaNodes[slideIndex], { yPercent: 0, scale: 1 });
        }

        if (titleTargets.length) {
          gsap.set(titleTargets, { autoAlpha: isActive ? 1 : 0, yPercent: 0, rotate: 0 });
        }
      });

      currentIndex = index;
      animating = false;
    }

    function gotoSection(index, direction, immediate) {
      if (index < 0 || index >= slides.length) {
        releaseScroll(direction);
        return;
      }

      if (animating && !immediate) return;
      if (!immediate && index === currentIndex) return;

      var previousIndex = currentIndex;
      var directionFactor = direction < 0 ? -1 : 1;
      var previousTitleTargets = getTitleTargets(titleGroups[previousIndex]);
      var nextTitleTargets = getTitleTargets(titleGroups[index]);
      var wrappers = [outerWrappers[index], innerWrappers[index]].filter(Boolean);
      var timeline;

      animating = true;
      updateUi(index);

      if (immediate) {
        setImmediateState(index);
        return;
      }

      timeline = gsap.timeline({
        defaults: { duration: 1.24, ease: 'power2.inOut' },
        onComplete: function () {
          animating = false;
        }
      });

      if (previousIndex !== index) {
        gsap.set(slides[previousIndex], { zIndex: 0 });

        if (mediaNodes[previousIndex]) {
          timeline.to(mediaNodes[previousIndex], { yPercent: -12 * directionFactor, scale: 1.08 }, 0);
        }

        if (previousTitleTargets.length) {
          timeline.to(
            previousTitleTargets,
            {
              autoAlpha: 0,
              yPercent: -112 * directionFactor,
              rotate: 2 * directionFactor,
              duration: 0.76,
              ease: 'power2.in',
              stagger: 0.06
            },
            0.02
          );
        }

        timeline.set(slides[previousIndex], { autoAlpha: 0 }, 0.84);
      }

      gsap.set(slides[index], { autoAlpha: 1, zIndex: 1 });

      if (wrappers.length) {
        timeline.fromTo(
          wrappers,
          {
            yPercent: function (_item, itemIndex) {
              return itemIndex ? -100 * directionFactor : 100 * directionFactor;
            }
          },
          { yPercent: 0 },
          0
        );
      }

      if (mediaNodes[index]) {
        timeline.fromTo(mediaNodes[index], { yPercent: 14 * directionFactor, scale: 1.12 }, { yPercent: 0, scale: 1 }, 0);
      }

      if (nextTitleTargets.length) {
        timeline.fromTo(
          nextTitleTargets,
          {
            autoAlpha: 0,
            yPercent: 120 * directionFactor,
            rotate: -2 * directionFactor
          },
          {
            autoAlpha: 1,
            yPercent: 0,
            rotate: 0,
            duration: 0.96,
            ease: 'power3.out',
            stagger: 0.08
          },
          0.16
        );
      }

      currentIndex = index;
    }

    function handleDirectionalChange(step) {
      if (suppressObserver || animating) return;
      gotoSection(currentIndex + step, step, false);
    }

    function handleKeydown(event) {
      if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        handleDirectionalChange(1);
      }

      if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault();
        handleDirectionalChange(-1);
      }
    }

    gsap.set(outerWrappers.filter(Boolean), { yPercent: 100 });
    gsap.set(innerWrappers.filter(Boolean), { yPercent: -100 });
    gsap.set(slides, { autoAlpha: 0, zIndex: 0 });

    titleGroups.forEach(function (group) {
      var titleTargets = getTitleTargets(group);

      if (titleTargets.length) {
        gsap.set(titleTargets, { autoAlpha: 0, yPercent: 0, rotate: 0 });
      }
    });

    gotoSection(0, 1, true);

    var intentObserver = ScrollTrigger.observe({
      target: viewport,
      type: 'wheel,touch,pointer',
      wheelSpeed: -1,
      tolerance: 12,
      preventDefault: true,
      allowClicks: true,
      onUp: function () {
        handleDirectionalChange(1);
      },
      onDown: function () {
        handleDirectionalChange(-1);
      },
      onPress: function (observer) {
        if (ScrollTrigger.isTouch && observer.event) {
          observer.event.preventDefault();
        }
      }
    });

    var preventScroll = ScrollTrigger.observe({
      type: 'wheel,scroll,touch',
      preventDefault: true,
      allowClicks: true,
      onEnable: function (observer) {
        observer.savedScroll = observer.scrollY();
      },
      onChangeY: function (observer) {
        observer.scrollY(observer.savedScroll);
      }
    });

    intentObserver.disable();
    preventScroll.disable();

    var activationTrigger = ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: '+=1',
      onEnter: function (self) {
        if (suppressObserver) return;
        self.scroll(self.start + 1);
        preventScroll.enable();
        intentObserver.enable();
      },
      onEnterBack: function (self) {
        if (suppressObserver) return;
        self.scroll(self.end - 1);
        preventScroll.enable();
        intentObserver.enable();
      }
    });

    navButtons.forEach(function (button) {
      function handleButtonClick() {
        var targetIndex = Number(button.getAttribute('data-vd-wiki-nav'));

        if (Number.isNaN(targetIndex) || targetIndex === currentIndex) return;
        gotoSection(targetIndex, targetIndex > currentIndex ? 1 : -1, false);
      }

      button.addEventListener('click', handleButtonClick);
      cleanups.push(function () {
        button.removeEventListener('click', handleButtonClick);
      });
    });

    viewport.addEventListener('keydown', handleKeydown);
    cleanups.push(function () {
      viewport.removeEventListener('keydown', handleKeydown);
    });

    section.__vdWikiTeaserCleanup = function () {
      cleanups.forEach(function (cleanup) {
        cleanup();
      });

      intentObserver.disable();
      intentObserver.kill();
      preventScroll.disable();
      preventScroll.kill();
      activationTrigger.kill();

      gsap.set(
        slides
          .concat(outerWrappers)
          .concat(innerWrappers)
          .concat(mediaNodes)
          .filter(Boolean),
        { clearProps: 'all' }
      );

      titleGroups.forEach(function (group) {
        var titleTargets = getTitleTargets(group);

        if (titleTargets.length) {
          gsap.set(titleTargets, { clearProps: 'all' });
        }

        if (group.split && typeof group.split.revert === 'function') {
          group.split.revert();
        }
      });

      slides.forEach(function (slide) {
        setMediaPlayback(slide, false);
      });

      section.classList.remove('is-ready');
      section.classList.remove('is-static');
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
