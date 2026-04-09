(function () {
  if (window.__vdPreviewLinksBooted) return;
  window.__vdPreviewLinksBooted = true;

  var LINK_SELECTOR = 'a[href]';

  function getPreviewThemeId() {
    var fromQuery = new URLSearchParams(window.location.search).get('preview_theme_id');
    if (fromQuery) return fromQuery;

    var shopifyTheme = window.Shopify && window.Shopify.theme;
    if (shopifyTheme && shopifyTheme.role === 'unpublished' && shopifyTheme.id) {
      return String(shopifyTheme.id);
    }

    return '';
  }

  function appendPreviewThemeId(url) {
    if (!url) return url;

    var previewThemeId = getPreviewThemeId();
    if (!previewThemeId) return url;

    try {
      var resolvedUrl = new URL(url, window.location.origin);
      if (!resolvedUrl.searchParams.get('preview_theme_id')) {
        resolvedUrl.searchParams.set('preview_theme_id', previewThemeId);
      }

      return resolvedUrl.origin === window.location.origin
        ? resolvedUrl.pathname + resolvedUrl.search + resolvedUrl.hash
        : resolvedUrl.toString();
    } catch (error) {
      return url;
    }
  }

  function shouldPreservePreviewLink(link) {
    if (!link || link.getAttribute('data-vd-preview-link') === 'ignore') return false;

    var href = (link.getAttribute('href') || '').trim();
    if (!href) return false;
    if (href.charAt(0) === '#') return false;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return false;

    try {
      var resolvedUrl = new URL(href, window.location.origin);
      return resolvedUrl.origin === window.location.origin;
    } catch (error) {
      return false;
    }
  }

  function preservePreviewLinks(scope) {
    Array.prototype.forEach.call((scope || document).querySelectorAll(LINK_SELECTOR), function (link) {
      if (!shouldPreservePreviewLink(link)) return;
      var href = link.getAttribute('href');
      link.setAttribute('href', appendPreviewThemeId(href));
    });
  }

  function init(scope) {
    preservePreviewLinks(scope);
  }

  document.addEventListener('DOMContentLoaded', function () {
    init(document);
  });

  document.addEventListener('shopify:section:load', function (event) {
    init(event.target);
  });

  window.VDPreviewLinks = {
    appendPreviewThemeId: appendPreviewThemeId,
    getPreviewThemeId: getPreviewThemeId,
    preservePreviewLinks: preservePreviewLinks
  };
})();
