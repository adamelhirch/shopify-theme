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

  function runRegisteredCleanups(cleanups) {
    if (!cleanups || !cleanups.length) return;

    cleanups.forEach(function (cleanup) {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    });

    cleanups.length = 0;
  }

  function getNodeText(node) {
    return node ? (node.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }

  function createNode(tagName, className, text) {
    var node = document.createElement(tagName);

    if (className) {
      node.className = className;
    }

    if (typeof text === 'string' && text.length) {
      node.textContent = text;
    }

    return node;
  }

  function extractJudgeReviews(source, limit) {
    if (!source) return [];

    var items = source.querySelectorAll('.jdgm-carousel-item');
    var reviews = [];
    var seen = {};

    Array.prototype.forEach.call(items, function (item) {
      if (reviews.length >= limit) return;

      var title = getNodeText(item.querySelector('.jdgm-carousel-item__review-title'));
      var quote = getNodeText(item.querySelector('.jdgm-carousel-item__review-body'));
      var author = getNodeText(item.querySelector('.jdgm-carousel-item__reviewer-name'));
      var date = getNodeText(item.querySelector('.jdgm-carousel-item__timestamp'));
      var productAnchor = item.querySelector('.jdgm-carousel-item__product');
      var product = getNodeText(item.querySelector('.jdgm-carousel-item__product-title'));
      var productLink = productAnchor ? productAnchor.getAttribute('href') : '';
      var rating = item.querySelectorAll('.jdgm-carousel-item__review-rating .jdgm-star.jdgm--on').length || 5;
      var key = [title, quote, author, date, product, productLink].join('||');

      if ((!title && !quote) || !product || product.toLowerCase() === 'vanilledesire' || !productLink || seen[key]) return;

      seen[key] = true;
      reviews.push({
        title: title,
        quote: quote || title,
        author: author || 'Client verifie',
        date: date || 'Avis client',
        product: product || 'Selection Judge.me',
        productLink: productLink,
        rating: Math.max(1, Math.min(5, rating))
      });
    });

    return reviews;
  }

  function buildTestimonialCard(review) {
    var item = createNode('li', 'vd-testimonials__card');
    var card = createNode('article', 'vd-testimonials__card-shell');
    var top = createNode('div', 'vd-testimonials__card-top');
    var stars = createNode('div', 'vd-testimonials__stars');
    var productLink = review.productLink ? createNode('a', 'vd-testimonials__product-link', review.product) : createNode('span', 'vd-testimonials__product-link', review.product);
    var quote = createNode('blockquote', 'vd-testimonials__quote', review.quote);
    var meta = createNode('div', 'vd-testimonials__meta');
    var author = createNode('strong', '', review.author);
    var location = createNode('span', '', review.date);
    var index;

    item.setAttribute('data-vd-testimonial-card', '');
    item.setAttribute('role', 'listitem');
    if (review.productLink) {
      item.setAttribute('data-vd-testimonial-link', review.productLink);
    }

    for (index = 0; index < 5; index += 1) {
      var star = createNode('span', index < review.rating ? 'is-active' : '', '★');
      stars.appendChild(star);
    }

    if (review.productLink) {
      productLink.href = review.productLink;
    }

    top.appendChild(stars);
    top.appendChild(productLink);

    card.appendChild(top);
    card.appendChild(quote);
    meta.appendChild(author);
    meta.appendChild(location);

    card.appendChild(meta);
    item.appendChild(card);

    return item;
  }

  function renderTestimonialCards(cardsContainer, reviews) {
    if (!cardsContainer || !reviews.length) return;

    cardsContainer.innerHTML = '';

    reviews.forEach(function (review) {
      cardsContainer.appendChild(buildTestimonialCard(review));
    });
  }

  function syncTestimonialsCta(cta, card) {
    if (!cta || cta.hasAttribute('data-vd-testimonials-static-link')) return;

    var target = '';

    if (card) {
      target = card.getAttribute('data-vd-testimonial-link') || '';

      if (!target) {
        var productAnchor = card.querySelector('.vd-testimonials__product-link[href]');
        target = productAnchor ? productAnchor.getAttribute('href') : '';
      }
    }

    cta.setAttribute('href', target || '#');

    if (target) {
      cta.removeAttribute('aria-disabled');
      cta.classList.remove('is-disabled');
    } else {
      cta.setAttribute('aria-disabled', 'true');
      cta.classList.add('is-disabled');
    }
  }

  function setTestimonialsActiveState(cards, activeIndex) {
    cards.forEach(function (card, index) {
      card.classList.toggle('is-active', index === activeIndex);
      card.classList.toggle('is-near', Math.abs(index - activeIndex) === 1);
    });
  }

  function findClosestTestimonialIndex(offsets, value) {
    var nearestIndex = 0;
    var nearestDistance = Math.abs((offsets[0] || 0) - value);

    offsets.forEach(function (offset, index) {
      var distance = Math.abs(offset - value);

      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    });

    return nearestIndex;
  }

  function clearTestimonialStyles(gsap, section, stage, viewport, cardsContainer, cards) {
    var targets = cardsContainer ? [cardsContainer].concat(cards) : cards;

    section.classList.remove('is-enhanced');

    if (stage) {
      stage.style.removeProperty('min-height');
    }

    if (viewport) {
      viewport.classList.remove('is-dragging');
    }

    setTestimonialsActiveState(cards, -1);

    if (targets.length) {
      gsap.set(targets, { clearProps: 'all' });
    }
  }

  function buildSeamlessLoop(items, spacing, animateFunc) {
    var overlap = Math.ceil(1 / spacing);
    var startTime = items.length * spacing + 0.5;
    var loopTime = (items.length + overlap) * spacing + 1;
    var rawSequence = window.gsap.timeline({ paused: true });
    var seamlessLoop = window.gsap.timeline({
      paused: true,
      repeat: -1,
      onRepeat: function () {
        if (this._time === this._dur) {
          this._tTime += this._dur - 0.01;
        }
      }
    });
    var total = items.length + overlap * 2;
    var time;
    var index;
    var i;

    for (i = 0; i < total; i += 1) {
      index = i % items.length;
      time = i * spacing;
      rawSequence.add(animateFunc(items[index]), time);

      if (i <= items.length) {
        seamlessLoop.add('label' + i, time);
      }
    }

    rawSequence.time(startTime);
    seamlessLoop
      .to(rawSequence, {
        time: loopTime,
        duration: loopTime - startTime,
        ease: 'none'
      })
      .fromTo(
        rawSequence,
        { time: overlap * spacing + 1 },
        {
          time: startTime,
          duration: startTime - (overlap * spacing + 1),
          immediateRender: false,
          ease: 'none'
        }
      );

    return seamlessLoop;
  }

  function initCraftStories(gsap, ScrollTrigger, prefersReducedMotion) {
    gsap.utils.toArray('[data-vd-craft-story]').forEach(function (section) {
      var sticky = section.querySelector('.vd-craft-story__sticky');
      var panels = gsap.utils.toArray(section.querySelectorAll('[data-vd-craft-panel]'));
      var steps = gsap.utils.toArray(section.querySelectorAll('[data-vd-craft-step]'));
      var quoteCards = gsap.utils.toArray(section.querySelectorAll('[data-vd-craft-quote]'));
      var introItems = gsap.utils.toArray(section.querySelectorAll('[data-vd-craft-intro] > *'));

      if (!sticky || !panels.length || !steps.length) return;

      clearCraftStoryStyles(gsap, section, panels, steps, quoteCards, introItems);

      if (prefersReducedMotion || window.innerWidth < 990 || panels.length < 2) {
        return;
      }

      section.classList.add('is-enhanced');

      var defaults = { ease: 'expo.out', duration: 1.6 };

      gsap.set(panels, { autoAlpha: 0, scale: 1.08, yPercent: 8, filter: 'blur(18px)' });
      gsap.set(panels[0], { autoAlpha: 1, scale: 1, yPercent: 0, filter: 'blur(0px)' });
      gsap.set(quoteCards, { autoAlpha: 0, y: 24, filter: 'blur(14px)' });
      gsap.set(steps, { autoAlpha: 0.34, x: 0, filter: 'blur(0px)' });
      gsap.set(steps[0], { autoAlpha: 1, x: 0, filter: 'blur(0px)' });

      if (quoteCards[0]) {
        gsap.set(quoteCards[0], { autoAlpha: 1, y: 0, filter: 'blur(0px)' });
      }

      syncCraftStoryState(panels, steps, 0, true);

      var timeline = gsap.timeline({
        defaults: defaults,
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: function () {
            return '+=' + Math.max(window.innerHeight * (panels.length * 1.05 + 0.8), 1800);
          },
          pin: sticky,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true
        }
      });

      panels.forEach(function (panel, index) {
        var quote = panel.querySelector('[data-vd-craft-quote]');

        if (index === 0) {
          timeline.to(
            panel,
            {
              scale: 1.02,
              yPercent: -2,
              duration: 1.2,
              ease: 'none'
            },
            0.08
          );

          return;
        }

        var previousPanel = panels[index - 1];
        var previousQuote = previousPanel.querySelector('[data-vd-craft-quote]');
        var previousStep = steps[index - 1];
        var currentStep = steps[index];
        var label = 'craft-step-' + index;

        timeline.addLabel(label, '+=0.18');
        timeline.call(syncCraftStoryState, [panels, steps, index, true], label);
        timeline.to(
          previousPanel,
          {
            autoAlpha: 0.14,
            scale: 0.95,
            yPercent: -6,
            filter: 'blur(18px)',
            duration: 1.5
          },
          label
        );

        if (previousQuote) {
          timeline.to(
            previousQuote,
            {
              autoAlpha: 0,
              y: -16,
              filter: 'blur(16px)',
              duration: 1.2
            },
            label
          );
        }

        timeline.to(
          previousStep,
          {
            autoAlpha: 0.34,
            x: 0,
            filter: 'blur(0px)',
            duration: 1.25
          },
          label
        );

        timeline.to(
          panel,
          {
            autoAlpha: 1,
            scale: 1,
            yPercent: 0,
            filter: 'blur(0px)',
            duration: 1.8
          },
          label
        );

        timeline.to(
          currentStep,
          {
            autoAlpha: 1,
            x: 0,
            filter: 'blur(0px)',
            duration: 1.45
          },
          label + '+=0.15'
        );

        if (quote) {
          timeline.to(
            quote,
            {
              autoAlpha: 1,
              y: 0,
              filter: 'blur(0px)',
              duration: 1.35
            },
            label + '+=0.2'
          );
        }

        timeline.to(
          panel,
          {
            scale: 1.02,
            yPercent: -2,
            duration: 1.15,
            ease: 'none'
          },
          label + '+=0.25'
        );
      });
    });
  }

  function initFeatureGalleries(gsap, ScrollTrigger, prefersReducedMotion) {
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

      gsap.set(cards, { autoAlpha: 1, y: 0, filter: 'blur(0px)' });

      var getScrollLength = function () {
        return Math.max(strip.scrollWidth - window.innerWidth, 0);
      };

      gsap.to(strip, {
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
    });
  }

  function initTestimonials(gsap, ScrollTrigger, prefersReducedMotion) {
    gsap.utils.toArray('[data-vd-testimonials-section]').forEach(function (section) {
      if (typeof section.__vdTestimonialsCleanup === 'function') {
        section.__vdTestimonialsCleanup();
      }

      var stage = section.querySelector('[data-vd-testimonials-stage]');
      var viewport = section.querySelector('[data-vd-testimonials-viewport]');
      var cardsContainer = section.querySelector('[data-vd-testimonials-cards]');
      var source = section.querySelector('[data-vd-testimonials-judge-source]');
      var cta = section.querySelector('[data-vd-testimonials-cta]');
      var limit = Number(section.getAttribute('data-vd-testimonials-limit')) || 10;
      var lifecycleCleanups = [];
      var interactiveCleanups = [];

      if (!stage || !viewport || !cardsContainer) return;

      function clearInteractiveCarousel() {
        runRegisteredCleanups(interactiveCleanups);
        clearTestimonialStyles(
          gsap,
          section,
          stage,
          viewport,
          cardsContainer,
          gsap.utils.toArray(section.querySelectorAll('[data-vd-testimonial-card]'))
        );
      }

      section.__vdTestimonialsCleanup = function () {
        clearInteractiveCarousel();
        runRegisteredCleanups(lifecycleCleanups);
        section.__vdTestimonialsCleanup = null;
      };

      function syncFromJudge() {
        var reviews = extractJudgeReviews(source, limit);

        if (!reviews.length) return false;

        renderTestimonialCards(cardsContainer, reviews);
        return true;
      }

      function mountCurrentCards() {
        clearInteractiveCarousel();

        var cards = gsap.utils.toArray(section.querySelectorAll('[data-vd-testimonial-card]'));

        if (!cards.length) {
          syncTestimonialsCta(cta, null);
          return;
        }

        setTestimonialsActiveState(cards, 0);
        syncTestimonialsCta(cta, cards[0] || null);

        if (prefersReducedMotion || window.innerWidth < 990 || cards.length < 3) {
          return;
        }

        section.classList.add('is-enhanced');

        var focusPoint = Math.min(Math.max(viewport.clientWidth * 0.38, 320), 520);
        var snapOffsets = cards.map(function (card) {
          return card.offsetLeft + card.offsetWidth * 0.5 - focusPoint;
        });
        var rangeStart = snapOffsets[0] || 0;
        var rangeEnd = snapOffsets[snapOffsets.length - 1] || rangeStart;
        var rangeSpan = Math.max(rangeEnd - rangeStart, 0);
        var activeIndex = 0;
        var currentOffset = rangeStart;
        var clampOffset = function (offset) {
          return gsap.utils.clamp(rangeStart, rangeEnd, offset);
        };
        var progressForOffset = function (offset) {
          if (!rangeSpan) return 0;
          return (clampOffset(offset) - rangeStart) / rangeSpan;
        };
        var updateOffset = function (offset) {
          var nextOffset = clampOffset(offset);
          var nextIndex = findClosestTestimonialIndex(snapOffsets, nextOffset);

          currentOffset = nextOffset;
          gsap.set(cardsContainer, { x: -nextOffset });

          if (nextIndex !== activeIndex || !cards[activeIndex]) {
            activeIndex = nextIndex;
            syncTestimonialsCta(cta, cards[activeIndex] || null);
          }

          setTestimonialsActiveState(cards, activeIndex);
        };

        if (rangeSpan < 24) {
          section.classList.remove('is-enhanced');
          updateOffset(rangeStart);
          return;
        }

        var playhead = { offset: rangeStart };
        var scrub = gsap.to(playhead, {
          offset: rangeEnd,
          ease: 'none',
          paused: true,
          onUpdate: function () {
            updateOffset(playhead.offset);
          }
        });
        var trigger = ScrollTrigger.create({
          trigger: stage,
          start: 'top bottom-=72',
          end: 'bottom top+=72',
          scrub: 0.6,
          animation: scrub,
          invalidateOnRefresh: true,
          snap: {
            snapTo: function (progress) {
              var offset = rangeStart + progress * rangeSpan;
              var snappedIndex = findClosestTestimonialIndex(snapOffsets, offset);

              return progressForOffset(snapOffsets[snappedIndex]);
            },
            duration: { min: 0.16, max: 0.3 },
            delay: 0.04,
            ease: 'power2.out'
          }
        });
        var progressToScroll = function (progress) {
          var totalRange = trigger.end - trigger.start;
          return gsap.utils.clamp(trigger.start, trigger.end, trigger.start + gsap.utils.clamp(0, 1, progress) * totalRange);
        };
        var scrollToOffset = function (offset) {
          trigger.scroll(progressToScroll(progressForOffset(offset)));
        };
        var dragState = {
          active: false,
          pointerId: null,
          startX: 0,
          startOffset: rangeStart
        };
        var onPointerDown = function (event) {
          if (typeof event.button === 'number' && event.button !== 0) {
            return;
          }

          if (event.target && typeof event.target.closest === 'function' && event.target.closest('a, button')) {
            return;
          }

          dragState.active = true;
          dragState.pointerId = event.pointerId;
          dragState.startX = event.clientX;
          dragState.startOffset = currentOffset;
          viewport.classList.add('is-dragging');

          if (typeof viewport.setPointerCapture === 'function') {
            try {
              viewport.setPointerCapture(event.pointerId);
            } catch (error) {}
          }
        };
        var onPointerMove = function (event) {
          if (!dragState.active) return;

          var sensitivity = rangeSpan / Math.max(viewport.clientWidth * 0.92, 1);
          var nextOffset = dragState.startOffset + (dragState.startX - event.clientX) * sensitivity;

          scrollToOffset(nextOffset);
        };
        var onPointerUp = function () {
          if (!dragState.active) return;

          dragState.active = false;
          viewport.classList.remove('is-dragging');

          if (typeof viewport.releasePointerCapture === 'function' && dragState.pointerId !== null) {
            try {
              viewport.releasePointerCapture(dragState.pointerId);
            } catch (error) {}
          }

          scrollToOffset(snapOffsets[findClosestTestimonialIndex(snapOffsets, currentOffset)]);
          dragState.pointerId = null;
        };

        updateOffset(rangeStart);

        viewport.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);

        interactiveCleanups.push(function () {
          viewport.removeEventListener('pointerdown', onPointerDown);
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          window.removeEventListener('pointercancel', onPointerUp);

          trigger.kill();
          scrub.kill();
        });
      }

      var hasLiveReviews = syncFromJudge();

      mountCurrentCards();

      if (!hasLiveReviews && source) {
        var observer = new MutationObserver(function () {
          if (syncFromJudge()) {
            mountCurrentCards();
            observer.disconnect();
          }
        });

        observer.observe(source, { childList: true, subtree: true });

        lifecycleCleanups.push(function () {
          observer.disconnect();
        });
      }
    });
  }

  function initHeaderHoverMenus() {
    if (typeof window.__vdHeaderMenuCleanup === 'function') {
      window.__vdHeaderMenuCleanup();
    }

    if (window.innerWidth < 990) {
      window.__vdHeaderMenuCleanup = null;
      return;
    }

    var cleanups = [];

    document.querySelectorAll('.header__inline-menu header-menu > details').forEach(function (details) {
      var summary = details.querySelector('summary');

      if (!summary) return;

      var closeTimer = 0;
      var focusOutHandler = function () {
        window.setTimeout(function () {
          if (!details.contains(document.activeElement)) {
            details.removeAttribute('open');
          }
        }, 0);
      };
      var openMenu = function () {
        window.clearTimeout(closeTimer);
        details.setAttribute('open', '');
      };
      var closeMenu = function () {
        window.clearTimeout(closeTimer);
        closeTimer = window.setTimeout(function () {
          if (!details.matches(':focus-within')) {
            details.removeAttribute('open');
          }
        }, 120);
      };

      details.addEventListener('mouseenter', openMenu);
      details.addEventListener('mouseleave', closeMenu);
      summary.addEventListener('focus', openMenu);
      details.addEventListener('focusout', focusOutHandler);

      cleanups.push(function () {
        window.clearTimeout(closeTimer);
        details.removeEventListener('mouseenter', openMenu);
        details.removeEventListener('mouseleave', closeMenu);
        summary.removeEventListener('focus', openMenu);
        details.removeEventListener('focusout', focusOutHandler);
      });
    });

    window.__vdHeaderMenuCleanup = function () {
      cleanups.forEach(function (cleanup) {
        cleanup();
      });
      cleanups.length = 0;
      window.__vdHeaderMenuCleanup = null;
    };
  }

  function initHeaderHoverFx(gsap) {
    if (typeof window.__vdHeaderHoverFxCleanup === 'function') {
      window.__vdHeaderHoverFxCleanup();
    }

    if (window.innerWidth < 990) {
      window.__vdHeaderHoverFxCleanup = null;
      return;
    }

    var targets = Array.prototype.slice.call(document.querySelectorAll('.header__menu-item, .header__icon'));
    var cleanups = [];

    targets.forEach(function (target) {
      var enter = function () {
        gsap.to(target, {
          scale: 1.03,
          filter: 'drop-shadow(0 14px 26px rgba(255, 255, 255, 0.08))',
          duration: 1,
          ease: 'power2.out',
          overwrite: true
        });
      };
      var leave = function () {
        gsap.to(target, {
          scale: 1,
          filter: 'drop-shadow(0 0 0 rgba(255, 255, 255, 0))',
          duration: 1,
          ease: 'power2.out',
          overwrite: true
        });
      };

      target.addEventListener('mouseenter', enter);
      target.addEventListener('mouseleave', leave);
      target.addEventListener('focus', enter);
      target.addEventListener('blur', leave);

      cleanups.push(function () {
        target.removeEventListener('mouseenter', enter);
        target.removeEventListener('mouseleave', leave);
        target.removeEventListener('focus', enter);
        target.removeEventListener('blur', leave);
      });
    });

    window.__vdHeaderHoverFxCleanup = function () {
      cleanups.forEach(function (cleanup) {
        cleanup();
      });
      cleanups.length = 0;
      gsap.set(targets, { clearProps: 'scale,filter' });
      window.__vdHeaderHoverFxCleanup = null;
    };
  }

  function initVanilleGsap() {
    if (!window.gsap || !window.ScrollTrigger || !window.ScrollSmoother) return;
    if (window.Shopify && window.Shopify.designMode) return;

    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;
    var ScrollSmoother = window.ScrollSmoother;

    gsap.registerPlugin(ScrollTrigger, ScrollSmoother);

    ScrollTrigger.getAll().forEach(function (trigger) {
      trigger.kill();
    });

    var existingSmoother = ScrollSmoother.get();
    if (existingSmoother) existingSmoother.kill();

    var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var allowSmoother = !prefersReducedMotion && window.innerWidth >= 990;

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

    initHeaderHoverMenus();
    initHeaderHoverFx(gsap);

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
          { autoAlpha: 0, y: 24, filter: 'blur(20px)', letterSpacing: '0.18em' },
          { autoAlpha: 1, y: 0, filter: 'blur(0px)', letterSpacing: '0.03em', duration: 1.8, stagger: 0.1 },
          0
        );
      }

      if (words.length) {
        heroTimeline.fromTo(
          words,
          { autoAlpha: 0, y: 18, filter: 'blur(10px)', letterSpacing: '0.34em' },
          { autoAlpha: 1, y: 0, filter: 'blur(0px)', letterSpacing: '0.18em', duration: 1.5, stagger: 0.1 },
          '-=1.05'
        );
      }

      if (media) {
        gsap.to(media, {
          yPercent: -8,
          ease: 'none',
          scrollTrigger: {
            trigger: hero,
            start: 'top top',
            end: 'bottom top',
            scrub: true
          }
        });
      }
    }

    initCraftStories(gsap, ScrollTrigger, prefersReducedMotion);
    initFeatureGalleries(gsap, ScrollTrigger, prefersReducedMotion);
    initTestimonials(gsap, ScrollTrigger, prefersReducedMotion);

    gsap.utils.toArray('.vd-reveal').forEach(function (section) {
      var items = section.querySelectorAll('.vd-reveal-item');

      if (!items.length) return;

      gsap.fromTo(
        items,
        { autoAlpha: 0, y: 32, filter: 'blur(20px)' },
        {
          autoAlpha: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 1.6,
          ease: 'expo.out',
          stagger: 0.1,
          scrollTrigger: {
            trigger: section,
            start: 'top 78%'
          }
        }
      );
    });

    gsap.utils.toArray('[data-speed]').forEach(function (element) {
      gsap.to(element, {
        yPercent: Number(element.getAttribute('data-speed')) * -10,
        ease: 'none',
        scrollTrigger: {
          trigger: element,
          scrub: true
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVanilleGsap);
  } else {
    initVanilleGsap();
  }

  window.addEventListener('resize', function () {
    window.clearTimeout(window.__vdGsapResizeTimer);
    window.__vdGsapResizeTimer = window.setTimeout(initVanilleGsap, 220);
  });
})();
