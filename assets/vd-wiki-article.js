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

  function buildToc(root) {
    var content = root.querySelector('[data-vd-wiki-content]');
    var tocWrapper = root.querySelector('[data-vd-wiki-toc-wrapper]');
    var tocList = root.querySelector('[data-vd-wiki-toc]');

    if (!content || !tocWrapper || !tocList) return;

    var headings = Array.prototype.slice.call(content.querySelectorAll('h2, h3')).filter(function (heading) {
      return heading.textContent && heading.textContent.trim();
    });

    if (!headings.length) {
      tocWrapper.hidden = true;
      return;
    }

    var seenIds = {};
    tocList.innerHTML = '';

    headings.forEach(function (heading) {
      var baseId = slugify(heading.textContent) || 'section';
      var nextIndex = (seenIds[baseId] || 0) + 1;
      seenIds[baseId] = nextIndex;

      if (!heading.id) {
        heading.id = nextIndex > 1 ? baseId + '-' + nextIndex : baseId;
      }

      var item = document.createElement('li');
      var link = document.createElement('a');
      link.className = 'vd-wiki-article__toc-link' + (heading.tagName === 'H3' ? ' is-subheading' : '');
      link.href = '#' + heading.id;
      link.textContent = heading.textContent.trim();
      item.appendChild(link);
      tocList.appendChild(item);
    });

    tocWrapper.hidden = false;
  }

  function init(scope) {
    Array.prototype.forEach.call((scope || document).querySelectorAll('[data-vd-wiki-article]'), function (root) {
      buildToc(root);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    init(document);
  });

  document.addEventListener('shopify:section:load', function (event) {
    init(event.target);
  });
})();
