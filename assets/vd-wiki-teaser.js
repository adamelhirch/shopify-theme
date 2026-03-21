(function () {
  if (window.__vdWikiTeaserBooted) return;
  window.__vdWikiTeaserBooted = true;

  function toArray(items) {
    return Array.prototype.slice.call(items || []);
  }

  function padNumber(value) {
    return String(value).padStart(2, '0');
  }

  function cleanupSection(section) {
    if (section && typeof section.__vdWikiTeaserCleanup === 'function') {
      section.__vdWikiTeaserCleanup();
      section.__vdWikiTeaserCleanup = null;
    }
  }

  function setStaticState(section, slides, navButtons) {
    var counter = section.querySelector('[data-vd-wiki-counter]');
    var progressBar = section.querySelector('[data-vd-wiki-progress]');
    var total = slides.length || 1;

    slides.forEach(function (slide, index) {
      var isActive = index === 0;
      var link = slide.querySelector('.vd-wiki-teaser__panel-link');

      slide.classList.toggle('is-active', isActive);
      slide.setAttribute('aria-hidden', isActive ? 'false' : 'true');

      if (link) {
        link.tabIndex = isActive ? 0 : -1;
      }
    });

    navButtons.forEach(function (button, index) {
      var isActive = index === 0;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    if (counter) {
      counter.textContent = padNumber(1) + ' / ' + padNumber(total);
    }

    if (progressBar) {
      progressBar.style.transform = 'scaleX(' + 1 / total + ')';
    }
  }

  function initSection(section) {
    if (!section) return;

    cleanupSection(section);

    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var slides = toArray(section.querySelectorAll('[data-vd-wiki-slide]'));
    var navButtons = toArray(section.querySelectorAll('[data-vd-wiki-nav]'));
    var viewport = section.querySelector('[data-vd-wiki-viewport]');
    var counter = section.querySelector('[data-vd-wiki-counter]');
    var progressBar = section.querySelector('[data-vd-wiki-progress]');

    if (!slides.length || !viewport) return;

    if (!gsap || !ScrollTrigger || typeof ScrollTrigger.observe !== 'function' || reduceMotion.matches || slides.length < 2) {
      section.classList.remove('is-ready');
      setStaticState(section, slides, navButtons);
      return;
    }

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
    var copyGroups = slides.map(function (slide) {
      return toArray(slide.querySelectorAll('[data-vd-wiki-copy]'));
    });
    var currentIndex = 0;
    var animating = false;
    var suppressObserver = false;
    var cleanups = [];

    function updateUi(index, immediate) {
      var total = slides.length;

      slides.forEach(function (slide, slideIndex) {
        var link = slide.querySelector('.vd-wiki-teaser__panel-link');
        var isActive = slideIndex === index;

        slide.classList.toggle('is-active', isActive);
        slide.setAttribute('aria-hidden', isActive ? 'false' : 'true');

        if (link) {
          link.tabIndex = isActive ? 0 : -1;
        }
      });

      navButtons.forEach(function (button, buttonIndex) {
        var isActive = buttonIndex === index;

        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');

        if (isActive && !immediate && window.innerWidth < 990 && typeof button.scrollIntoView === 'function') {
          button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      });

      if (counter) {
        counter.textContent = padNumber(index + 1) + ' / ' + padNumber(total);
      }

      if (progressBar) {
        progressBar.style.transform = 'scaleX(' + (index + 1) / total + ')';
      }
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

    function gotoSection(index, direction, immediate) {
      if (index < 0 || index >= slides.length) {
        releaseScroll(direction);
        return;
      }

      if (animating && !immediate) return;
      if (!immediate && index === currentIndex) return;

      var previousIndex = currentIndex;
      var fromTop = direction < 0;
      var directionFactor = fromTop ? -1 : 1;
      var timeline;

      animating = true;
      updateUi(index, immediate);

      if (immediate) {
        slides.forEach(function (slide, slideIndex) {
          var isActive = slideIndex === index;

          gsap.set(slide, { autoAlpha: isActive ? 1 : 0, zIndex: isActive ? 1 : 0 });
          gsap.set(outerWrappers[slideIndex], { yPercent: 0 });
          gsap.set(innerWrappers[slideIndex], { yPercent: 0 });
          gsap.set(mediaNodes[slideIndex], { yPercent: 0, scale: 1 });
          gsap.set(copyGroups[slideIndex], { autoAlpha: isActive ? 1 : 0, y: 0 });
        });

        currentIndex = index;
        animating = false;
        return;
      }

      timeline = gsap.timeline({
        defaults: { duration: 1.15, ease: 'power2.inOut' },
        onComplete: function () {
          animating = false;
        }
      });

      if (previousIndex !== index) {
        gsap.set(slides[previousIndex], { zIndex: 0 });
        timeline
          .to(mediaNodes[previousIndex], { yPercent: -12 * directionFactor, scale: 1.06 }, 0)
          .to(copyGroups[previousIndex], { autoAlpha: 0, y: -24 * directionFactor, duration: 0.52, stagger: 0.04 }, 0)
          .set(slides[previousIndex], { autoAlpha: 0 }, 0.78);
      }

      gsap.set(slides[index], { autoAlpha: 1, zIndex: 1 });
      timeline
        .fromTo(
          [outerWrappers[index], innerWrappers[index]],
          {
            yPercent: function (itemIndex) {
              return itemIndex ? -100 * directionFactor : 100 * directionFactor;
            }
          },
          { yPercent: 0 },
          0
        )
        .fromTo(mediaNodes[index], { yPercent: 14 * directionFactor, scale: 1.1 }, { yPercent: 0, scale: 1 }, 0)
        .fromTo(
          copyGroups[index],
          { autoAlpha: 0, y: 42 * directionFactor },
          { autoAlpha: 1, y: 0, duration: 0.82, stagger: 0.06, ease: 'power2.out' },
          0.14
        );

      currentIndex = index;
    }

    function handleDirectionalChange(step) {
      if (suppressObserver || animating) return;
      gotoSection(currentIndex + step, step);
    }

    function handleKeydown(event) {
      if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        event.preventDefault();
        handleDirectionalChange(1);
      }

      if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault();
        handleDirectionalChange(-1);
      }
    }

    gsap.set(outerWrappers, { yPercent: 100 });
    gsap.set(innerWrappers, { yPercent: -100 });
    gsap.set(slides, { autoAlpha: 0, zIndex: 0 });

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
      var handleButtonClick = function () {
        var targetIndex = Number(button.getAttribute('data-vd-wiki-nav'));

        if (Number.isNaN(targetIndex) || targetIndex === currentIndex) return;
        gotoSection(targetIndex, targetIndex > currentIndex ? 1 : -1, false);
      };

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
      intentObserver.kill();
      preventScroll.kill();
      activationTrigger.kill();
      section.classList.remove('is-ready');
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
