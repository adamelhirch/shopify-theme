(function () {
  if (window.__vdWikiArticleBooted) return;
  window.__vdWikiArticleBooted = true;

  function normalizeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function slugify(value) {
    return normalizeText(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .trim();
  }

  function getCompactTocLabel(root, headingText) {
    var pageHandle = root && root.getAttribute ? root.getAttribute('data-vd-wiki-handle') : '';
    var text = String(headingText || '').trim();

    if (!text) return text;

    if (pageHandle === 'wiki-vanille-conservation-preparation') {
      var conservationMap = {
        'Comment conserver des gousses de vanille au quotidien': 'Conserver',
        'Les erreurs qui abîment la vanille': 'Erreurs',
        'Combien de temps se gardent des gousses de vanille ?': 'Durée',
        'Préparer la vanille sans gâcher la préparation': 'Préparer',
        'Recycler une gousse déjà utilisée': 'Recycler',
        'Ce que montrent les sources techniques sur la conservation': 'Sources',
        'Questions fréquentes sur la conservation de la vanille': 'FAQ',
        'Choisir la bonne vanille selon votre besoin': 'Choisir'
      };

      if (conservationMap[text]) return conservationMap[text];
    }

    if (pageHandle === 'wiki-epices-madagascar') {
      var epicesMap = {
        'Quelles épices retrouve-t-on dans ce chapitre ?': 'Chapitre',
        'Comment choisir une épice selon l’usage': 'Choisir',
        'Comment lire le profil aromatique d’une épice': 'Profil',
        'Formats, conservation et intensité': 'Formats',
        'Ce qu’une bonne fiche épice doit vous dire': 'Fiche',
        'Comment se repérer dans cette famille': 'Repères',
        'Quatre épices à ouvrir en premier': 'Débuter',
        'Questions fréquentes avant d’acheter des épices': 'FAQ',
        'Comment utiliser le combava sans écraser le plat ?': 'Combava',
        'Pourquoi certaines épices gagnent à rester entières': 'Entier',
        'Par où continuer après cette page': 'Suite',
        'Sources & lectures utiles': 'Sources'
      };

      if (epicesMap[text]) return epicesMap[text];
    }

    if (pageHandle === 'wiki-glossaire-epices') {
      var glossaireMap = {
        'À retrouver dans le glossaire': 'Repères',
        'Une page pour mieux se repérer': 'Usage',
        'Notions à clarifier en priorité': 'Priorités',
        'Comment utiliser cette page': 'Mode d’emploi',
        'Mots qui aident vraiment à mieux acheter': 'Choisir',
        'Termes vanille à connaître': 'Vanille',
        'Termes de préparation et d’extraction': 'Préparation',
        'Termes utiles pour choisir un produit': 'Produit'
      };

      if (glossaireMap[text]) return glossaireMap[text];
    }

    var words = text.split(/\s+/).filter(Boolean);

    if (words.length <= 3) return text;

    return words.slice(0, 3).join(' ');
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

  function markImportedNode(node, className) {
    if (!node) return;
    node.classList.add(className);
  }

  function normalizeImportedSection(section, mode) {
    if (!section) return;

    Array.prototype.slice.call(
      section.querySelectorAll('script, style, nav, footer, .copylink, .bar, .halo, .vd2-mask, .vd2-bokeh')
    ).forEach(function (node) {
      node.remove();
    });

    Array.prototype.slice.call(section.querySelectorAll('*')).forEach(function (node) {
      node.removeAttribute('style');
      node.removeAttribute('onmousemove');
      node.removeAttribute('data-cat');
      node.removeAttribute('data-group');
      node.removeAttribute('data-letter');
      node.removeAttribute('data-tags');
      node.removeAttribute('aria-pressed');

      if (node.matches('.cards, .steps, .vd2-stepgrid, .vd2-valgrid, .vdR-grid, .vdR-tools, .vdR-gloss, .vdG-grid')) {
        markImportedNode(node, 'vd-wiki-import-grid');
      }

      if (node.matches('.faq-grid')) {
        markImportedNode(node, 'vd-wiki-import-faq');
      }

      if (node.matches('.card, .step, .panel, .vd2-step, .vd2-tile, .vdR-card, .vdR-tool, .vdR-note, .sp-card')) {
        markImportedNode(node, 'vd-wiki-import-card');
      }

      if (node.matches('.panel.good')) {
        markImportedNode(node, 'vd-wiki-import-card--good');
      }

      if (node.matches('.panel.warn')) {
        markImportedNode(node, 'vd-wiki-import-card--warn');
      }

      if (node.matches('.faq')) {
        markImportedNode(node, 'vd-wiki-import-disclosure');
      }

      if (node.matches('.intro, .vdR-lead, .vdF-note')) {
        markImportedNode(node, 'vd-wiki-import-intro');
      }

      if (node.matches('.tag, .kicker, .vdR-kicker, .vd2-kicker')) {
        markImportedNode(node, 'vd-wiki-import-kicker');
      }

      if (node.matches('.vdR-cta, .sp-cta, .cta-row')) {
        markImportedNode(node, 'vd-wiki-import-links');
      }

      if (node.matches('.chip, .btn')) {
        markImportedNode(node, 'vd-wiki-import-link');
      }

      if (node.matches('.badge')) {
        markImportedNode(node, 'vd-wiki-import-pill');
      }

      if (node.matches('.sp-head, .sp-notes, .sp-ul, .ans, .vdR-out')) {
        markImportedNode(node, 'vd-wiki-import-copy');
      }
    });

    Array.prototype.slice.call(section.querySelectorAll('summary')).forEach(function (summary) {
      Array.prototype.slice.call(summary.querySelectorAll('button')).forEach(function (button) {
        button.remove();
      });
    });

    if (!section.querySelector('h2')) {
      var summary = section.querySelector('details > summary');

      if (summary) {
        var summaryClone = summary.cloneNode(true);

        Array.prototype.slice.call(summaryClone.querySelectorAll('button, .tag, .badge')).forEach(function (node) {
          node.remove();
        });

        var summaryHeading = normalizeText(summaryClone.textContent);

        if (summaryHeading) {
          var headingFromSummary = document.createElement('h2');
          headingFromSummary.textContent = summaryHeading;
          section.insertBefore(headingFromSummary, section.firstChild);
        }
      }
    }

    if (mode === 'glossary' && !section.querySelector('h2')) {
      var heading = document.createElement('h2');
      heading.textContent = 'Entrées du glossaire';
      section.insertBefore(heading, section.firstChild);
    }
  }

  function importLegacyWikiContent(content) {
    if (!content || content.dataset.vdWikiImported === 'true') return;

    var mode = '';
    var sectionNodes = [];
    var genericContent = content.querySelector('[class*="vdw-"] .content');

    if (genericContent) {
      mode = 'content';
      sectionNodes = Array.prototype.slice.call(genericContent.children).filter(function (node) {
        return node.nodeType === 1 && node.matches('section');
      });
    } else {
      var glossaryMain = content.querySelector('.vdG-main');
      var faqMain = content.querySelector('.vdF-wrap main');
      var recipesSections = content.querySelectorAll('.vdR-sec');
      var savoirFaireSections = content.querySelectorAll('.vd2-steps, .vd2-values');

      if (glossaryMain) {
        mode = 'glossary';
        sectionNodes = Array.prototype.slice.call(glossaryMain.children).filter(function (node) {
          return node.nodeType === 1 && node.matches('section');
        });
      } else if (faqMain) {
        mode = 'faq';
        sectionNodes = Array.prototype.slice.call(faqMain.children).filter(function (node) {
          return node.nodeType === 1 && node.matches('section');
        });
      } else if (recipesSections.length) {
        mode = 'recipes';
        sectionNodes = Array.prototype.slice.call(recipesSections);
      } else if (savoirFaireSections.length) {
        mode = 'savoir-faire';
        sectionNodes = Array.prototype.slice.call(savoirFaireSections);
      }
    }

    if (!sectionNodes.length) return;

    var importedRoot = document.createElement('div');
    importedRoot.className = 'vd-wiki-import';

    sectionNodes.forEach(function (node) {
      var clone = node.cloneNode(true);
      normalizeImportedSection(clone, mode);

      if (clone.textContent && clone.textContent.replace(/\s+/g, ' ').trim()) {
        importedRoot.appendChild(clone);
      }
    });

    if (!importedRoot.children.length) return;

    content.innerHTML = '';
    content.appendChild(importedRoot);
    content.dataset.vdWikiImported = 'true';
  }

  function getImportedSections(content) {
    var importedRoot = content ? content.querySelector('.vd-wiki-import') : null;

    return importedRoot ? Array.prototype.slice.call(importedRoot.children) : [];
  }

  function getSectionHeading(section) {
    var heading = section && section.querySelector ? section.querySelector('h2') : null;

    return normalizeText(heading ? heading.textContent : '');
  }

  function headingMatches(heading, matcher) {
    if (!heading) return false;

    if (typeof matcher === 'string') {
      return heading === matcher;
    }

    if (matcher && typeof matcher.test === 'function') {
      return matcher.test(heading);
    }

    return false;
  }

  function renameImportedSection(content, matcher, nextHeading) {
    getImportedSections(content).forEach(function (section) {
      var heading = section.querySelector('h2');

      if (!heading) return;

      if (headingMatches(normalizeText(heading.textContent), matcher)) {
        heading.textContent = nextHeading;
      }
    });
  }

  function removeImportedSections(content, matchers) {
    getImportedSections(content).forEach(function (section) {
      var heading = getSectionHeading(section);

      if (!heading) return;

      if (matchers.some(function (matcher) {
        return headingMatches(heading, matcher);
      })) {
        section.remove();
      }
    });
  }

  function setImportedSectionIntro(content, matcher, text) {
    getImportedSections(content).forEach(function (section) {
      var heading = section.querySelector('h2');

      if (!heading || !headingMatches(normalizeText(heading.textContent), matcher)) return;

      var next = heading.nextElementSibling;

      if (next && next.tagName === 'P') {
        next.textContent = text;
        markImportedNode(next, 'vd-wiki-import-intro');
        return;
      }

      var paragraph = document.createElement('p');
      paragraph.className = 'vd-wiki-import-intro';
      paragraph.textContent = text;

      if (next) {
        heading.parentNode.insertBefore(paragraph, next);
      } else {
        heading.parentNode.appendChild(paragraph);
      }
    });
  }

  function setImportedDisclosureState(content, matcher, isOpen) {
    getImportedSections(content).forEach(function (section) {
      var heading = section.querySelector('h2');

      if (!heading || !headingMatches(normalizeText(heading.textContent), matcher)) return;

      Array.prototype.slice.call(section.querySelectorAll('details')).forEach(function (details) {
        if (isOpen) {
          details.setAttribute('open', 'open');
        } else {
          details.removeAttribute('open');
        }
      });
    });
  }

  function pruneImportedChrome(content) {
    if (!content) return;

    Array.prototype.slice.call(content.querySelectorAll('.os-badge')).forEach(function (node) {
      node.remove();
    });
  }

  function pruneEmptyImportedNodes(content) {
    if (!content) return;

    Array.prototype.slice.call(content.querySelectorAll('.cta-row, .chip-group, .chips, p, div, li')).forEach(function (node) {
      if (!node || !node.parentNode) return;

      if (node.querySelector('img, picture, video, iframe, input, details, summary, article, section, ul, ol, a')) {
        return;
      }

      if (normalizeText(node.textContent) === '') {
        node.remove();
      }
    });
  }

  function pruneImportedCommerceLinks(content) {
    if (!content) return;

    Array.prototype.slice.call(content.querySelectorAll('a[href]')).forEach(function (link) {
      var href = (link.getAttribute('href') || '').trim();

      if (href.indexOf('/collections/') !== 0 && href.indexOf('/products/') !== 0) return;

      link.remove();
    });

    pruneEmptyImportedNodes(content);
  }

  function normalizeImportedLinkLabels(content) {
    if (!content) return;

    Array.prototype.slice.call(content.querySelectorAll('a')).forEach(function (link) {
      var text = normalizeText(link.textContent);

      if (!text) return;

      link.textContent = text.replace(/^[📖←→]\s*/u, '');
    });
  }

  function sanitizeImportedContent(root, content) {
    if (!root || !content) return;

    var pageHandle = root.getAttribute('data-vd-wiki-handle') || '';

    pruneImportedChrome(content);
    pruneImportedCommerceLinks(content);
    normalizeImportedLinkLabels(content);

    getImportedSections(content).forEach(function (section) {
      if (!section.querySelector('h2') && !section.querySelector('details > summary')) {
        section.remove();
      }
    });

    removeImportedSections(content, [/^Prêt/i, /^Découvrir nos /i, /^Continuer l’exploration$/i]);

    if (pageHandle === 'wiki-recettes') {
      renameImportedSection(content, 'Blueprints (gabarits modulables)', 'Bases et recettes à adapter');
      renameImportedSection(content, 'Recettes OS (Madagascar)', 'Repères malgaches');
      renameImportedSection(content, 'Bases mères (ratios reproductibles)', 'Bases à maîtriser');
      renameImportedSection(content, 'Glossaire technique (utile, pas verbeux)', 'Repères techniques');
      removeImportedSections(content, ['Outils rapides']);
      setImportedSectionIntro(
        content,
        'Bases et recettes à adapter',
        'Des bases simples pour desserts, boissons et préparations salées, à ajuster selon l’ingrédient et l’intensité recherchée.'
      );
      setImportedSectionIntro(
        content,
        'Par quoi commencer selon l’envie',
        'Trois entrées très concrètes selon que vous cherchez un dessert, une base salée ou un geste rapide à la minute.'
      );
      setImportedSectionIntro(
        content,
        'Repères malgaches',
        'Quelques plats souvent cités pour situer les usages malgaches, à lire comme inspiration culinaire et culturelle distincte des recettes Vanille Désiré.'
      );
      setImportedSectionIntro(
        content,
        'Bases à maîtriser',
        'Des proportions utiles pour sirops, infusions et préparations maison, à adapter selon la texture et le temps de repos souhaités.'
      );
      setImportedSectionIntro(
        content,
        'Repères techniques',
        'Températures, repos, filtration et petits gestes qui changent vraiment le résultat en cuisine.'
      );
    }

    if (pageHandle === 'wiki-faq-vanille-epices') {
      renameImportedSection(content, 'Questions rapides (encore plus)', 'Questions complémentaires');
    }

    if (pageHandle === 'wiki-glossaire-epices') {
      renameImportedSection(content, 'Entrées du glossaire', 'Glossaire des termes utiles');
      setImportedSectionIntro(
        content,
        'Glossaire des termes utiles',
        'Définitions courtes pour reconnaître les termes, les usages et les gestes utiles autour de la vanille, des épices et des poivres.'
      );
    }

    if (pageHandle === 'wiki-huiles-essentielles-plantes') {
      setImportedSectionIntro(
        content,
        'Bien choisir son huile',
        'Trois repères simples pour choisir une huile adaptée à un usage ambiant ou cosmétique, avec les précautions essentielles à connaître.'
      );
      renameImportedSection(
        content,
        'FAQ — Huiles essentielles & huiles naturelles',
        'Questions fréquentes sur les huiles et plantes'
      );
      setImportedDisclosureState(content, 'Fiches par huile — notes, idées d’usage & précautions', true);

      Array.prototype.slice.call(content.querySelectorAll('p, li')).forEach(function (node) {
        var text = normalizeText(node.textContent);

        if (text.indexOf('Diffusion, cosmétique diluée, cuisine aromatique') === 0) {
          node.textContent = 'Diffusion, usage cosmétique externe et dilution maîtrisée : choisissez des espèces douces pour débuter, comme l’ylang ylang ou le ravintsara.';
        }

        if (text.indexOf('Cuisine aromatique :') === 0 || text.indexOf('Cuisine aromatique (') === 0) {
          node.remove();
        }
      });
    }

    if (pageHandle === 'wiki-sels-melanges') {
      renameImportedSection(content, 'La base & l’esprit Vanille Désiré', 'Comprendre les sels aromatisés');
      setImportedSectionIntro(
        content,
        'Comprendre les sels aromatisés',
        'Ces sels partent d’un sel de Camargue travaillé en petites séries, puis associé à des aromates de Madagascar avec des repères d’usage simples.'
      );
    }
  }

  function pruneBrokenMedia(content) {
    if (!content) return;

    Array.prototype.slice.call(content.querySelectorAll('img')).forEach(function (image) {
      function removeImage() {
        if (!image || !image.parentNode) return;
        image.remove();
      }

      if (image.complete && image.naturalWidth === 0) {
        removeImage();
        return;
      }

      image.addEventListener('error', removeImage, { once: true });
    });
  }

  function pruneKnowledgeDrafts(content) {
    if (!content) return;

    Array.prototype.slice.call(content.querySelectorAll('.vd-wiki-article-note')).forEach(function (note) {
      var label = note.querySelector('.vd-wiki-article-note__label');

      if (!label) return;

      var text = label.textContent ? label.textContent.trim().toLowerCase() : '';

      if (text === 'panorama') {
        note.remove();
      }
    });
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
    }).slice(0, 10);

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

    var topHeadingLimit = 4;

    headings.forEach(function (heading, index) {
      var baseId = slugify(heading.textContent) || 'section';
      var nextIndex = (seenIds[baseId] || 0) + 1;
      seenIds[baseId] = nextIndex;
      var fullLabel = heading.textContent.trim();
      var compactLabel = getCompactTocLabel(root, fullLabel);

      if (!heading.id) {
        heading.id = nextIndex > 1 ? baseId + '-' + nextIndex : baseId;
      }

      tocLists.forEach(function (entry) {
        var isAsideList = entry.list.hasAttribute('data-vd-wiki-toc-alt');

        if (!isAsideList && index >= topHeadingLimit) {
          return;
        }

        var item = document.createElement('li');
        var itemClone = item.cloneNode(false);
        var link = document.createElement('a');
        link.className = 'vd-wiki-article__toc-link';
        link.href = '#' + heading.id;
        link.textContent = isAsideList ? fullLabel : compactLabel;
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
      var detail = root.closest('.vd-wiki-detail');
      var isKnowledgeLayout = detail && detail.getAttribute('data-vd-wiki-layout') === 'knowledge';

      importLegacyWikiContent(content);
      sanitizeImportedContent(root, content);
      pruneBrokenMedia(content);

      if (isKnowledgeLayout) {
        pruneKnowledgeDrafts(content);
      } else {
        sectionizeContent(content);
      }
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
