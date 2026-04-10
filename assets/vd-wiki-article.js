(function () {
  if (window.__vdWikiArticleBooted) return;
  window.__vdWikiArticleBooted = true;

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .trim();
  }

  function sectionizeContent(content) {
    if (!content || content.dataset.vdWikiSectionized === 'true') return;

    var nodes = Array.prototype.slice.call(content.childNodes).filter(function (node) {
      if (node.nodeType === 1) return true;
      return node.nodeType === 3 && node.textContent && node.textContent.trim();
    });

    if (!nodes.length) return;

    var fragment = document.createDocumentFragment();
    var prologue = document.createElement('div');
    var prologueHasContent = false;
    var currentSection = null;
    var currentBody = null;

    prologue.className = 'vd-wiki-detail__prologue';
    prologue.setAttribute('data-vd-wiki-reveal', '');

    function appendNode(target, node) {
      if (node.nodeType === 3) {
        var text = node.textContent.replace(/\s+/g, ' ').trim();

        if (!text) return;

        var paragraph = document.createElement('p');
        paragraph.textContent = text;
        target.appendChild(paragraph);
        return;
      }

      target.appendChild(node);
    }

    nodes.forEach(function (node) {
      if (node.nodeType === 1 && node.matches('h2')) {
        currentSection = document.createElement('section');
        currentSection.className = 'vd-wiki-section';
        currentSection.setAttribute('data-vd-wiki-reveal', '');

        var head = document.createElement('div');
        head.className = 'vd-wiki-section__head';
        head.appendChild(node);

        currentBody = document.createElement('div');
        currentBody.className = 'vd-wiki-section__body';

        currentSection.appendChild(head);
        currentSection.appendChild(currentBody);
        fragment.appendChild(currentSection);
        return;
      }

      if (currentBody) {
        appendNode(currentBody, node);
      } else {
        appendNode(prologue, node);
        prologueHasContent = true;
      }
    });

    content.innerHTML = '';

    if (prologueHasContent) {
      content.appendChild(prologue);
    }

    content.appendChild(fragment);
    content.dataset.vdWikiSectionized = 'true';
  }

  function buildToc(root) {
    var content = root.querySelector('[data-vd-wiki-content]');
    var tocLists = Array.prototype.slice.call(
      root.querySelectorAll('[data-vd-wiki-toc], [data-vd-wiki-toc-alt]')
    ).map(function (list) {
      return {
        list: list,
        wrapper: list.closest('[data-vd-wiki-toc-wrapper], [data-vd-wiki-toc-wrapper-alt]')
      };
    }).filter(function (entry) {
      return entry.wrapper && entry.list;
    });

    if (!content || !tocLists.length) return [];

    var headings = Array.prototype.slice.call(content.querySelectorAll('h2')).filter(function (heading) {
      return heading.textContent && heading.textContent.trim();
    }).slice(0, 8);

    if (!headings.length) {
      tocLists.forEach(function (entry) {
        entry.wrapper.hidden = true;
      });
      return [];
    }

    var seenIds = {};
    tocLists.forEach(function (entry) {
      entry.list.innerHTML = '';
    });

    headings.forEach(function (heading) {
      var baseId = slugify(heading.textContent) || 'section';
      var nextIndex = (seenIds[baseId] || 0) + 1;
      seenIds[baseId] = nextIndex;

      if (!heading.id) {
        heading.id = nextIndex > 1 ? baseId + '-' + nextIndex : baseId;
      }

      var item = document.createElement('li');
      tocLists.forEach(function (entry) {
        var itemClone = item.cloneNode(false);
        var link = document.createElement('a');
        link.className = 'vd-wiki-article__toc-link';
        link.href = '#' + heading.id;
        link.textContent = heading.textContent.trim();
        itemClone.appendChild(link);
        entry.list.appendChild(itemClone);
        entry.wrapper.hidden = false;
      });
    });

    return headings;
  }

  function setupScrollSpy(root, headings) {
    var links = Array.prototype.slice.call(root.querySelectorAll('.vd-wiki-article__toc-link'));

    if (!headings.length || !links.length || typeof IntersectionObserver === 'undefined') return;

    var map = {};
    links.forEach(function (link) {
      map[link.getAttribute('href').replace('#', '')] = link;
    });

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;

          links.forEach(function (link) {
            link.classList.toggle('is-active', link.getAttribute('href') === '#' + entry.target.id);
          });
        });
      },
      {
        rootMargin: '-28% 0px -56% 0px',
        threshold: 0
      }
    );

    headings.forEach(function (heading) {
      if (map[heading.id]) {
        observer.observe(heading);
      }
    });
  }

  function setupRevealObservers(root) {
    var items = Array.prototype.slice.call(
      root.querySelectorAll('[data-vd-wiki-reveal], .vd-wiki-section, .vd-wiki-detail__prologue')
    );

    root.setAttribute('data-vd-wiki-ready', 'true');

    if (!items.length) return;

    if (typeof IntersectionObserver === 'undefined') {
      items.forEach(function (item) {
        item.classList.add('is-visible');
      });
      return;
    }

    var revealObserver = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;

          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      {
        rootMargin: '0px 0px -10% 0px',
        threshold: 0.14
      }
    );

    items.forEach(function (item) {
      revealObserver.observe(item);
    });
  }

  function setupMotion(root) {
    if (!window.gsap) return;

    var gsap = window.gsap;
    var title = root.querySelector('[data-vd-wiki-title]');
    var heroCopy = root.querySelector('.vd-wiki-detail__hero-copy');
    var heroFrames = root.querySelectorAll('.vd-wiki-detail__hero-frame');
    var sceneCards = root.querySelectorAll('.vd-wiki-detail__scene-card');
    var stage = root.closest('.vd-wiki-detail') ? root.closest('.vd-wiki-detail').querySelector('[data-vd-wiki-stage]') : null;
    var revealPanels = root.querySelectorAll('.vd-wiki-detail__navigator, .vd-wiki-section, .vd-wiki-detail__prologue');

    if (window.ScrollTrigger && gsap.registerPlugin) {
      gsap.registerPlugin(window.ScrollTrigger);
    }

    if (title && window.SplitText) {
      try {
        var split = new window.SplitText(title, { type: 'lines', linesClass: 'vd-wiki-title-line' });
        gsap.from(split.lines, {
          yPercent: 118,
          opacity: 0,
          duration: 1.1,
          ease: 'power3.out',
          stagger: 0.08,
          delay: 0.05
        });
      } catch (error) {
        gsap.from(title, {
          y: 40,
          opacity: 0,
          duration: 0.9,
          ease: 'power3.out'
        });
      }
    } else if (title) {
      gsap.from(title, {
        y: 40,
        opacity: 0,
        duration: 0.9,
        ease: 'power3.out'
      });
    }

    Array.prototype.slice.call([heroCopy])
      .concat(Array.prototype.slice.call(heroFrames))
      .concat(Array.prototype.slice.call(sceneCards))
      .forEach(function (item) {
        if (item) {
          item.classList.add('is-visible');
        }
      });

    gsap.from([heroCopy], {
      y: 34,
      opacity: 0,
      duration: 0.95,
      ease: 'power3.out',
      stagger: 0.14,
      clearProps: 'opacity,transform'
    });

    if (heroFrames.length) {
      gsap.from(heroFrames, {
        y: 34,
        opacity: 0,
        scale: 0.96,
        rotate: function (index) {
          return index % 2 === 0 ? -3 : 3;
        },
        duration: 1,
        ease: 'power3.out',
        stagger: 0.08,
        delay: 0.12,
        clearProps: 'opacity,transform'
      });
    }

    if (sceneCards.length) {
      gsap.from(sceneCards, {
        y: 36,
        opacity: 0,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.1,
        delay: 0.18,
        clearProps: 'opacity,transform'
      });
    }

    if (stage && window.ScrollTrigger) {
      gsap.to(stage, {
        yPercent: 10,
        ease: 'none',
        scrollTrigger: {
          trigger: root,
          start: 'top top',
          end: 'bottom top',
          scrub: 0.4
        }
      });
    }

    if (revealPanels.length && window.ScrollTrigger) {
      revealPanels.forEach(function (panel) {
        gsap.from(panel, {
          y: 36,
          opacity: 0,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: panel,
            start: 'top 82%'
          }
        });
      });
    }
  }

  function init(scope) {
    Array.prototype.forEach.call((scope || document).querySelectorAll('[data-vd-wiki-article]'), function (root) {
      if (root.dataset.vdWikiInitialized === 'true') return;

      var content = root.querySelector('[data-vd-wiki-content]');
      if (!content) return;

      sectionizeContent(content);
      var headings = buildToc(root);
      setupScrollSpy(root, headings);
      setupRevealObservers(root);
      setupMotion(root);

      root.dataset.vdWikiInitialized = 'true';
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    init(document);
  });

  document.addEventListener('shopify:section:load', function (event) {
    init(event.target);
  });
})();
