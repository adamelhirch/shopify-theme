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

  function formatTestimonialProductLabel(value) {
    if (!value) return '';

    var label = String(value)
      .replace(/\s+/g, ' ')
      .replace(/\s+\(([^)]+)\)\s*$/, '')
      .trim();

    if (label.indexOf(' - ') !== -1) {
      label = label.split(' - ')[0].trim();
    }

    if (label.indexOf(' – ') !== -1) {
      label = label.split(' – ')[0].trim();
    }

    return label;
  }

  function formatTestimonialDateLabel(value) {
    if (!value) return '';

    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      var parts = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

      if (parts) {
        date = new Date(Number(parts[3]), Number(parts[1]) - 1, Number(parts[2]));
      }
    }

    if (Number.isNaN(date.getTime())) {
      return String(value).trim();
    }

    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
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
        date: formatTestimonialDateLabel(date) || 'Avis client',
        product: formatTestimonialProductLabel(product) || 'Selection Judge.me',
        productLink: productLink,
        rating: Math.max(1, Math.min(5, rating)),
        sourceLabel: 'Avis verifie via Judge.me'
      });
    });

    reviews.sort(function (left, right) {
      return (right.quote || '').length - (left.quote || '').length;
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
    card.setAttribute('data-vd-testimonial-shell', '');
    card.tabIndex = 0;
    card.setAttribute('data-vd-testimonial-rating', review.rating);
    card.setAttribute('data-vd-testimonial-author', review.author || '');
    card.setAttribute('data-vd-testimonial-date', review.date || '');
    card.setAttribute('data-vd-testimonial-product', review.product || '');
    card.setAttribute('data-vd-testimonial-quote', review.quote || '');
    card.setAttribute('data-vd-testimonial-source-label', review.sourceLabel || 'Avis client');
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

    if (review.product) {
      productLink.title = review.product;
    }

    top.appendChild(stars);
    top.appendChild(productLink);

    card.appendChild(top);
    quote.setAttribute('data-vd-testimonial-quote', '');
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

  function buildTestimonialStarsMarkup(rating) {
    var safeRating = Math.max(1, Math.min(5, Number(rating) || 5));
    var markup = '';
    var index;

    for (index = 0; index < 5; index += 1) {
      markup += '<span class="' + (index < safeRating ? 'is-active' : '') + '">★</span>';
    }

    return markup;
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

  function clearTestimonialStyles(gsap, section, stage, viewport, cardsContainer, cards, revealTargets) {
    var targets = cardsContainer ? [cardsContainer].concat(cards) : cards;
    var mergedTargets = revealTargets && revealTargets.length ? targets.concat(revealTargets) : targets;

    section.classList.remove('is-enhanced');

    if (stage) {
      stage.style.removeProperty('min-height');
    }

    if (viewport) {
      viewport.classList.remove('is-dragging');
    }

    setTestimonialsActiveState(cards, -1);

    if (mergedTargets.length) {
      gsap.set(mergedTargets, { clearProps: 'all' });
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

  function initCraftStories(gsap, ScrollTrigger, prefersReducedMotion, cleanups) {
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

      gsap.set(panels, { autoAlpha: 0, scale: 1.08, yPercent: 8 });
      gsap.set(panels[0], { autoAlpha: 1, scale: 1, yPercent: 0 });
      gsap.set(quoteCards, { autoAlpha: 0, y: 24 });
      gsap.set(steps, { autoAlpha: 0.34, x: 0 });
      gsap.set(steps[0], { autoAlpha: 1, x: 0 });

      if (quoteCards[0]) {
        gsap.set(quoteCards[0], { autoAlpha: 1, y: 0 });
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
            duration: 1.8
          },
          label
        );

        timeline.to(
          currentStep,
          {
            autoAlpha: 1,
            x: 0,
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

      registerCleanup(cleanups, function () {
        if (timeline.scrollTrigger) {
          timeline.scrollTrigger.kill();
        }

        timeline.kill();
        clearCraftStoryStyles(gsap, section, panels, steps, quoteCards, introItems);
      });
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

      if (prefersReducedMotion || window.innerWidth < 990) {
        return;
      }

      section.classList.add('is-enhanced');

      gallery.classList.add('vd-new-product__gallery--final');
      var flipState = Flip.getState(items);
      gallery.classList.remove('vd-new-product__gallery--final');

      var timeline = gsap.timeline({
        scrollTrigger: {
          trigger: gallery,
          start: 'center center',
          end: '+=100%',
          pin: stage,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true
        }
      });

      timeline.add(
        Flip.to(flipState, {
          simple: true,
          ease: 'expo.inOut',
          duration: 1
        }),
        0
      );

      registerCleanup(cleanups, function () {
        if (timeline.scrollTrigger) {
          timeline.scrollTrigger.kill();
        }

        timeline.kill();
        clearNewProductBentoStyles(gsap, section, gallery, items);
      });
    });
  }

  function initTestimonials(gsap, ScrollTrigger, prefersReducedMotion, cleanups) {
    gsap.utils.toArray('[data-vd-testimonials-section]').forEach(function (section) {
      if (typeof section.__vdTestimonialsCleanup === 'function') {
        section.__vdTestimonialsCleanup();
      }

      var stage = section.querySelector('[data-vd-testimonials-stage]');
      var viewport = section.querySelector('[data-vd-testimonials-viewport]');
      var cardsContainer = section.querySelector('[data-vd-testimonials-cards]');
      var source = section.querySelector('[data-vd-testimonials-judge-source]');
      var cta = section.querySelector('[data-vd-testimonials-cta]');
      var header = section.querySelector('[data-vd-testimonials-header]');
      var featuredShell = section.querySelector('[data-vd-testimonials-featured-shell]');
      var featuredSource = section.querySelector('[data-vd-testimonials-featured-source]');
      var featuredStars = section.querySelector('[data-vd-testimonials-featured-stars]');
      var featuredProductWrap = section.querySelector('[data-vd-testimonials-featured-product-wrap]');
      var featuredProduct = section.querySelector('[data-vd-testimonials-featured-product]');
      var featuredQuote = section.querySelector('[data-vd-testimonials-featured-quote]');
      var featuredAuthor = section.querySelector('[data-vd-testimonials-featured-author]');
      var featuredDate = section.querySelector('[data-vd-testimonials-featured-date]');
      var limit = Number(section.getAttribute('data-vd-testimonials-limit')) || 10;
      var lifecycleCleanups = [];
      var interactiveCleanups = [];
      var revealTargets = [header, featuredShell, stage].filter(Boolean);

      if (!stage || !viewport || !cardsContainer) return;

      function clearInteractiveCarousel() {
        runRegisteredCleanups(interactiveCleanups);
        clearTestimonialStyles(
          gsap,
          section,
          stage,
          viewport,
          cardsContainer,
          gsap.utils.toArray(section.querySelectorAll('[data-vd-testimonial-card]')),
          revealTargets
        );
      }

      section.__vdTestimonialsCleanup = function () {
        clearInteractiveCarousel();
        runRegisteredCleanups(lifecycleCleanups);
        section.__vdTestimonialsCleanup = null;
      };

      registerCleanup(cleanups, function () {
        if (typeof section.__vdTestimonialsCleanup === 'function') {
          section.__vdTestimonialsCleanup();
        }
      });

      function syncFromJudge() {
        var reviews = extractJudgeReviews(source, limit);

        if (!reviews.length) return false;

        renderTestimonialCards(cardsContainer, reviews);
        return true;
      }

      function syncFeaturedFromCard(card) {
        if (!card || !featuredQuote || !featuredAuthor || !featuredDate || !featuredStars || !featuredSource) return;
        var shell = card.matches('[data-vd-testimonial-shell]') ? card : card.querySelector('[data-vd-testimonial-shell]');
        var target = card.getAttribute('data-vd-testimonial-link') || '';
        var productText = '';

        if (!shell) return;

        productText = shell.getAttribute('data-vd-testimonial-product') || '';

        featuredSource.textContent = shell.getAttribute('data-vd-testimonial-source-label') || 'Avis client';
        featuredStars.innerHTML = buildTestimonialStarsMarkup(shell.getAttribute('data-vd-testimonial-rating'));
        featuredQuote.textContent = shell.getAttribute('data-vd-testimonial-quote') || '';
        featuredAuthor.textContent = shell.getAttribute('data-vd-testimonial-author') || '';
        featuredDate.textContent = shell.getAttribute('data-vd-testimonial-date') || '';

        if (featuredProduct && featuredProductWrap) {
          if (!target) {
            var inlineProductAnchor = card.querySelector('.vd-testimonials__product-link[href]');
            target = inlineProductAnchor ? inlineProductAnchor.getAttribute('href') : '';
          }

          if (productText.length) {
            featuredProduct.textContent = productText;

            if (target) {
              featuredProduct.href = target;
              featuredProduct.removeAttribute('aria-disabled');
            } else {
              featuredProduct.removeAttribute('href');
              featuredProduct.setAttribute('aria-disabled', 'true');
            }

            featuredProductWrap.hidden = false;
          } else {
            featuredProductWrap.hidden = true;
            featuredProduct.removeAttribute('href');
          }
        }
      }

      function mountCurrentCards() {
        clearInteractiveCarousel();

        var cards = gsap.utils.toArray(section.querySelectorAll('[data-vd-testimonial-card]'));
        var cardShells = gsap.utils.toArray(section.querySelectorAll('[data-vd-testimonial-shell]'));
        var activeIndex = 0;

        if (!cards.length) {
          syncTestimonialsCta(cta, null);
          return;
        }

        if (!prefersReducedMotion) {
          if (revealTargets.length) {
            gsap.set(revealTargets, { autoAlpha: 1, y: 0 });
          }

          if (cards.length) {
            gsap.set(cards, { autoAlpha: 1, y: 0 });
          }

          if (cardShells.length) {
            gsap.set(cardShells, { clearProps: 'filter' });
          }

          var revealTimeline = gsap.timeline({
            defaults: { ease: 'expo.out', duration: 1.15 },
            scrollTrigger: {
              trigger: section,
              start: 'top 78%',
              once: true
            }
          });

          if (header) {
            revealTimeline.fromTo(
              header,
              { autoAlpha: 0, y: 28 },
              { autoAlpha: 1, y: 0 },
              0
            );
          }

          if (featuredShell) {
            revealTimeline.fromTo(
              featuredShell,
              { autoAlpha: 0, y: 36 },
              { autoAlpha: 1, y: 0, duration: 1.2 },
              header ? 0.08 : 0
            );
          }

          if (cards.length) {
            revealTimeline.fromTo(
              cards,
              { autoAlpha: 0, y: 34 },
              {
                autoAlpha: 1,
                y: 0,
                duration: 0.95,
                stagger: 0.08
              },
              featuredShell ? 0.18 : header ? 0.08 : 0
            );
          }

          interactiveCleanups.push(function () {
            if (revealTimeline.scrollTrigger) {
              revealTimeline.scrollTrigger.kill();
            }

            revealTimeline.kill();
          });
        }

        function setActiveCard(nextIndex) {
          var boundedIndex = Math.max(0, Math.min(cards.length - 1, nextIndex));

          activeIndex = boundedIndex;
          setTestimonialsActiveState(cards, activeIndex);
          syncTestimonialsCta(cta, cards[activeIndex] || null);
          syncFeaturedFromCard(cards[activeIndex] || null);
        }

        setActiveCard(0);

        if (prefersReducedMotion || window.innerWidth < 990 || cards.length < 3) {
          cards.forEach(function (card, index) {
            var onActivate = function (event) {
              if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
              if (event.type === 'keydown') {
                event.preventDefault();
              }

              setActiveCard(index);
            };

            card.addEventListener('click', onActivate);
            card.addEventListener('keydown', onActivate);

            interactiveCleanups.push(function () {
              card.removeEventListener('click', onActivate);
              card.removeEventListener('keydown', onActivate);
            });
          });

          return;
        }

        section.classList.add('is-enhanced');

        var focusPoint = viewport.clientWidth * 0.5;
        var snapOffsets = cards.map(function (card) {
          return card.offsetLeft + card.offsetWidth * 0.5 - focusPoint;
        });
        var rangeStart = snapOffsets[0] || 0;
        var rangeEnd = snapOffsets[snapOffsets.length - 1] || rangeStart;
        var rangeSpan = Math.max(rangeEnd - rangeStart, 0);
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
            setActiveCard(nextIndex);
          }
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
          startOffset: rangeStart,
          moved: false
        };
        var onPointerDown = function (event) {
          if (typeof event.button === 'number' && event.button !== 0) {
            return;
          }

          if (event.target && typeof event.target.closest === 'function' && event.target.closest('a')) {
            return;
          }

          dragState.active = true;
          dragState.pointerId = event.pointerId;
          dragState.startX = event.clientX;
          dragState.startOffset = currentOffset;
          dragState.moved = false;
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
          if (Math.abs(dragState.startX - event.clientX) > 5) {
            dragState.moved = true;
          }
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
        var onCardAction = function (event) {
          var card = event.target.closest('[data-vd-testimonial-card]');
          var inlineLink = event.target.closest('.vd-testimonials__product-link[href]');

          if (!card || inlineLink) return;

          if (dragState.moved) return;

          var index = cards.indexOf(card);
          if (index === -1) return;

          if (cards[index] !== cards[activeIndex]) {
            setActiveCard(index);
            scrollToOffset(snapOffsets[index]);
          }
        };
        var onCardKeydown = function (event) {
          var card = event.target.closest('[data-vd-testimonial-card]');

          if (!card) return;

          if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-vd-testimonial-shell]')) {
            event.preventDefault();
            var index = cards.indexOf(card);

            if (index !== -1) {
              setActiveCard(index);
              scrollToOffset(snapOffsets[index]);
            }
          }
        };

        updateOffset(rangeStart);

        viewport.addEventListener('pointerdown', onPointerDown);
        cardsContainer.addEventListener('click', onCardAction);
        cardsContainer.addEventListener('keydown', onCardKeydown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);

        interactiveCleanups.push(function () {
          viewport.removeEventListener('pointerdown', onPointerDown);
          cardsContainer.removeEventListener('click', onCardAction);
          cardsContainer.removeEventListener('keydown', onCardKeydown);
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

  function initCollectionHeroes(gsap, ScrollTrigger, prefersReducedMotion, cleanups) {
    gsap.utils.toArray('[data-vd-collection-hero]').forEach(function (section) {
      var backdrop = section.querySelector('[data-vd-collection-backdrop], .collection-hero__backdrop-media');
      var panel = section.querySelector('[data-vd-collection-panel]');
      var timeline;

      if (!backdrop && !panel) return;

      if (backdrop) {
        gsap.set(backdrop, { clearProps: 'transform' });
      }

      if (panel) {
        gsap.set(panel, { clearProps: 'transform,opacity' });
      }

      if (prefersReducedMotion) {
        return;
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
          { scale: 1.1, yPercent: -2 },
          { scale: 1.02, yPercent: 4, ease: 'none' },
          0
        );
      }

      if (panel) {
        timeline.fromTo(
          panel,
          { y: 28, autoAlpha: 0.86 },
          { y: -8, autoAlpha: 1, ease: 'none' },
          0
        );
      }

      registerCleanup(cleanups, function () {
        if (timeline.scrollTrigger) {
          timeline.scrollTrigger.kill();
        }

        timeline.kill();

        if (backdrop) {
          gsap.set(backdrop, { clearProps: 'transform' });
        }

        if (panel) {
          gsap.set(panel, { clearProps: 'transform,opacity' });
        }
      });
    });
  }

  function initVanilleGsap(forceRebuild) {
    if (!window.gsap || !window.ScrollTrigger || !window.ScrollSmoother) return;
    if (window.Shopify && window.Shopify.designMode) return;

    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;
    var ScrollSmoother = window.ScrollSmoother;
    var Flip = window.Flip || null;
    var state = window.__vdGsapState || {
      cleanups: [],
      initialized: false,
      allowSmoother: null,
      isDesktop: null,
      prefersReducedMotion: null
    };

    if (Flip) {
      gsap.registerPlugin(ScrollTrigger, ScrollSmoother, Flip);
    } else {
      gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
    }

    var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var isDesktop = window.innerWidth >= 990;
    var allowSmoother = !prefersReducedMotion && isDesktop;
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

    var existingSmoother = ScrollSmoother.get();
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
        var heroMediaTween = gsap.to(media, {
          yPercent: -8,
          ease: 'none',
          scrollTrigger: {
            trigger: hero,
            start: 'top top',
            end: 'bottom top',
            scrub: true
          }
        });

        registerCleanup(state.cleanups, function () {
          if (heroMediaTween.scrollTrigger) {
            heroMediaTween.scrollTrigger.kill();
          }

          heroMediaTween.kill();
          gsap.set(media, { clearProps: 'transform' });
        });
      }

      registerCleanup(state.cleanups, function () {
        heroTimeline.kill();
      });
    }

    initCraftStories(gsap, ScrollTrigger, prefersReducedMotion, state.cleanups);
    initFeatureGalleries(gsap, ScrollTrigger, prefersReducedMotion, state.cleanups);
    initNewProductBentos(gsap, ScrollTrigger, prefersReducedMotion, Flip, state.cleanups);
    initTestimonials(gsap, ScrollTrigger, prefersReducedMotion, state.cleanups);
    initCollectionHeroes(gsap, ScrollTrigger, prefersReducedMotion, state.cleanups);

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

    gsap.utils.toArray('[data-speed]').forEach(function (element) {
      var speedTween = gsap.to(element, {
        yPercent: Number(element.getAttribute('data-speed')) * -10,
        ease: 'none',
        scrollTrigger: {
          trigger: element,
          scrub: true
        }
      });

      registerCleanup(state.cleanups, function () {
        if (speedTween.scrollTrigger) {
          speedTween.scrollTrigger.kill();
        }

        speedTween.kill();
        gsap.set(element, { clearProps: 'transform' });
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
      initVanilleGsap(true);
    });
  } else {
    initVanilleGsap(true);
  }

  var reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var handleReducedMotionChange = function () {
    initVanilleGsap(true);
  };

  if (typeof reducedMotionQuery.addEventListener === 'function') {
    reducedMotionQuery.addEventListener('change', handleReducedMotionChange);
  } else if (typeof reducedMotionQuery.addListener === 'function') {
    reducedMotionQuery.addListener(handleReducedMotionChange);
  }

  window.addEventListener('resize', function () {
    window.clearTimeout(window.__vdGsapResizeTimer);
    window.__vdGsapResizeTimer = window.setTimeout(function () {
      initVanilleGsap(false);
    }, 220);
  });
})();
