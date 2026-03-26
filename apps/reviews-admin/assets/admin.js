(function () {
  var DATA_PATH = '../../data/reviews-admin-summary.json';
  var API_BASE = document.body.getAttribute('data-admin-api-base') || 'http://127.0.0.1:4567';

  function formatNumber(value) {
    return new Intl.NumberFormat('fr-FR').format(value || 0);
  }

  function formatDate(value) {
    if (!value) return 'Sans date';

    try {
      return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value));
    } catch (error) {
      return value;
    }
  }

  function starsMarkup(rating) {
    var safe = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    var output = '';
    var index;

    for (index = 0; index < 5; index += 1) {
      output += index < safe ? '★' : '☆';
    }

    return output;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function statusBadge(status) {
    var normalized = (status || '').toLowerCase();
    var className = 'admin-badge';

    if (normalized === 'planned' || normalized === 'next' || normalized === 'pending' || normalized === 'queued') {
      className += ' admin-badge--warning';
    } else if (normalized === 'backlog' || normalized === 'draft' || normalized === 'future') {
      className += ' admin-badge--muted';
    }

    return '<span class="' + className + '">' + escapeHtml(status) + '</span>';
  }

  function fetchJson(path) {
    return fetch(API_BASE + path).then(function (response) {
      if (!response.ok) throw new Error('API request failed');
      return response.json();
    });
  }

  function renderOverview(root, overview) {
    var cards = [
      { label: 'Commentaires', value: formatNumber(overview.total_reviews) },
      { label: 'Note moyenne', value: Number(overview.average_rating || 0).toFixed(1) },
      { label: 'Avis verifies', value: formatNumber(overview.verified_reviews) },
      { label: 'Produits notes', value: formatNumber(overview.reviewed_products) },
      { label: 'Demandes actives', value: formatNumber(overview.review_requests) },
      { label: 'QR prets', value: formatNumber(overview.qr_ready_products) }
    ];

    root.innerHTML = cards.map(function (card) {
      return (
        '<article class="admin-card admin-card--stat">' +
          '<h3>' + card.label + '</h3>' +
          '<strong>' + card.value + '</strong>' +
        '</article>'
      );
    }).join('');
  }

  function renderTopProducts(root, products) {
    root.innerHTML = (
      '<table class="admin-table">' +
        '<thead>' +
          '<tr>' +
            '<th>Produit</th>' +
            '<th>Commentaires</th>' +
            '<th>Evaluation</th>' +
            '<th>Verifies</th>' +
            '<th>Dernier avis</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' +
          products.map(function (product) {
            return (
              '<tr>' +
                '<td><a href="' + escapeHtml(product.url || '#') + '">' + escapeHtml(product.title) + '</a></td>' +
                '<td>' + formatNumber(product.reviews) + '</td>' +
                '<td><span class="admin-stars">' + starsMarkup(product.rating) + '</span></td>' +
                '<td>' + formatNumber(product.verified_reviews) + '</td>' +
                '<td>' + formatDate(product.latest_review_date) + '</td>' +
              '</tr>'
            );
          }).join('') +
        '</tbody>' +
      '</table>'
    );
  }

  function renderRecentReviews(root, reviews) {
    root.innerHTML = (
      '<ul class="admin-list">' +
        reviews.map(function (review) {
          return (
            '<li class="admin-list__item">' +
              '<div class="admin-list__meta">' +
                '<span class="admin-stars">' + starsMarkup(review.rating) + '</span>' +
                '<span>' + formatDate(review.date) + '</span>' +
                '<span>' + escapeHtml(review.product_title) + '</span>' +
                (review.verified ? '<span class="admin-badge">Verifie</span>' : '') +
                statusBadge(review.status) +
              '</div>' +
              '<p class="admin-list__quote">' + escapeHtml(review.quote) + '</p>' +
            '</li>'
          );
        }).join('') +
      '</ul>'
    );
  }

  function renderReviewsPage(root, reviews) {
    root.innerHTML = reviews.map(function (review) {
      return (
        '<article class="admin-quote-card">' +
          '<div class="admin-list__meta">' +
            '<strong>' + escapeHtml(review.author) + '</strong>' +
            '<span>' + escapeHtml(review.product_title) + '</span>' +
            '<span>' + formatDate(review.review_date) + '</span>' +
            '<span class="admin-stars">' + starsMarkup(review.rating) + '</span>' +
            (review.verified ? '<span class="admin-badge">Verifie</span>' : '') +
            statusBadge(review.status) +
            '<span>' + escapeHtml(review.channel || 'storefront') + '</span>' +
          '</div>' +
          '<p class="admin-list__quote">' + escapeHtml(review.quote) + '</p>' +
          '<div class="admin-quote-card__footer">' +
            '<span><strong>Auteur</strong> ' + escapeHtml(review.author) + '</span>' +
            '<span><strong>Produit</strong> ' + escapeHtml(review.product_title) + '</span>' +
            (review.order_name ? '<span><strong>Commande</strong> ' + escapeHtml(review.order_name) + '</span>' : '') +
            (review.reply ? '<span><strong>Reponse marque</strong> ' + escapeHtml(review.reply) + '</span>' : '') +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  function renderModerationSummary(root, moderation) {
    root.innerHTML =
      '<div class="admin-list__meta">' +
        '<span class="admin-badge">Publies ' + formatNumber(moderation.published || 0) + '</span>' +
        '<span class="admin-badge admin-badge--warning">En attente ' + formatNumber(moderation.pending || 0) + '</span>' +
        '<span class="admin-badge admin-badge--muted">Signales ' + formatNumber(moderation.flagged || 0) + '</span>' +
        '<span class="admin-badge admin-badge--muted">Archives ' + formatNumber(moderation.archived || 0) + '</span>' +
      '</div>';
  }

  function renderRequests(root, summary, requests) {
    root.innerHTML =
      '<div class="admin-grid admin-grid--stats admin-grid--compact">' +
        '<article class="admin-card admin-card--stat"><h3>Demandes</h3><strong>' + formatNumber(summary.total || 0) + '</strong></article>' +
        '<article class="admin-card admin-card--stat"><h3>En file</h3><strong>' + formatNumber(summary.queued || 0) + '</strong></article>' +
        '<article class="admin-card admin-card--stat"><h3>Soumises</h3><strong>' + formatNumber(summary.submitted || 0) + '</strong></article>' +
        '<article class="admin-card admin-card--stat"><h3>QR catalogue</h3><strong>' + formatNumber(summary.qr_catalog || 0) + '</strong></article>' +
      '</div>' +
      '<div class="admin-list__meta" style="margin-top: 1rem;">' +
        '<span class="admin-badge">Page review ' + escapeHtml(summary.review_page_url || '') + '</span>' +
      '</div>' +
      '<table class="admin-table">' +
        '<thead>' +
          '<tr>' +
            '<th>Produit</th>' +
            '<th>Canal</th>' +
            '<th>Etat</th>' +
            '<th>Commande</th>' +
            '<th>Landing URL</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' +
          requests.map(function (request) {
            return (
              '<tr>' +
                '<td>' + escapeHtml(request.product_title) + '</td>' +
                '<td>' + escapeHtml(request.channel || 'manual') + '</td>' +
                '<td>' + statusBadge(request.state) + '</td>' +
                '<td>' + escapeHtml(request.order_name || 'Catalogue') + '</td>' +
                '<td><a href="' + escapeHtml(request.landing_url || '#') + '">' + escapeHtml(request.landing_url || '') + '</a></td>' +
              '</tr>'
            );
          }).join('') +
        '</tbody>' +
      '</table>';
  }

  function renderWidgets(root, widgets) {
    root.innerHTML = widgets.map(function (widget) {
      return (
        '<article class="admin-card admin-widget-card">' +
          '<div class="admin-list__meta">' +
            statusBadge(widget.status) +
            '<span>' + escapeHtml(widget.surface) + '</span>' +
          '</div>' +
          '<h3>' + escapeHtml(widget.name) + '</h3>' +
          '<p>' + escapeHtml(widget.description) + '</p>' +
        '</article>'
      );
    }).join('');
  }

  function renderSettings(root, settings) {
    if (!root) return;

    root.innerHTML =
      '<div class="admin-list__meta">' +
        '<span class="admin-badge">Auto publish verifies: ' + (settings.auto_publish_verified ? 'oui' : 'non') + '</span>' +
        '<span class="admin-badge admin-badge--muted">Auto publish non verifies: ' + (settings.auto_publish_unverified ? 'oui' : 'non') + '</span>' +
      '</div>' +
      '<p class="admin-footer-note">Page d avis active: ' + escapeHtml(settings.review_page_url || '') + '</p>';
  }

  function renderRoadmap(root) {
    if (!root) return;

    root.innerHTML = [
      { module: 'Collecte storefront', status: 'active' },
      { module: 'Moderation locale', status: 'active' },
      { module: 'Metaobjects Shopify', status: 'next' },
      { module: 'Workflow post-achat', status: 'next' },
      { module: 'QR colis par commande', status: 'planned' },
      { module: 'UGC photo / video', status: 'planned' }
    ].map(function (item) {
      return (
        '<article class="admin-quote-card">' +
          '<div class="admin-list__meta">' +
            '<strong>' + item.module + '</strong>' +
            statusBadge(item.status) +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  function setText(selector, value) {
    var node = document.querySelector(selector);
    if (node) node.textContent = value;
  }

  function showFallback() {
    document.body.classList.add('is-admin-error');
    setText('[data-admin-generated-at]', 'Donnees absentes');
    var nodes = document.querySelectorAll('[data-admin-fallback]');

    nodes.forEach(function (node) {
      node.hidden = false;
    });
  }

  function renderStaticFallback() {
    fetch(DATA_PATH)
      .then(function (response) {
        if (!response.ok) throw new Error('Missing reviews-admin-summary.json');
        return response.json();
      })
      .then(function (data) {
        setText('[data-admin-store]', data.store || 'Vanille Desire');
        setText('[data-admin-generated-at]', data.generated_at || '');

        var overviewRoot = document.querySelector('[data-admin-overview]');
        var topProductsRoot = document.querySelector('[data-admin-top-products]');
        var recentReviewsRoot = document.querySelector('[data-admin-recent-reviews]');
        var reviewsRoot = document.querySelector('[data-admin-reviews]');
        var moderationRoot = document.querySelector('[data-admin-moderation-summary]');
        var requestsRoot = document.querySelector('[data-admin-requests]');
        var widgetsRoot = document.querySelector('[data-admin-widgets]');
        var roadmapRoot = document.querySelector('[data-admin-roadmap]');

        if (overviewRoot) renderOverview(overviewRoot, data.overview || {});
        if (topProductsRoot) renderTopProducts(topProductsRoot, data.top_products || []);
        if (recentReviewsRoot) renderRecentReviews(recentReviewsRoot, data.recent_reviews || []);
        if (reviewsRoot) renderReviewsPage(reviewsRoot, data.moderation_queue || []);
        if (moderationRoot) renderModerationSummary(moderationRoot, {
          published: (data.overview && data.overview.total_reviews) || 0,
          pending: 0,
          flagged: 0,
          archived: 0
        });
        if (requestsRoot) renderRequests(requestsRoot, data.requests || {}, (data.requests && data.requests.samples) || []);
        if (widgetsRoot) renderWidgets(widgetsRoot, data.widgets || []);
        if (roadmapRoot) renderRoadmap(roadmapRoot);
      })
      .catch(showFallback);
  }

  Promise.all([
    fetchJson('/api/dashboard'),
    fetchJson('/api/reviews'),
    fetchJson('/api/requests'),
    fetchJson('/api/widgets'),
    fetchJson('/api/settings')
  ]).then(function (payloads) {
    var dashboard = payloads[0];
    var reviews = payloads[1].reviews || [];
    var requests = payloads[2];
    var widgets = payloads[3].widgets || [];
    var settings = payloads[4].settings || {};

    setText('[data-admin-store]', 'Vanille Desire');
    setText('[data-admin-generated-at]', dashboard.generated_at || '');

    var overviewRoot = document.querySelector('[data-admin-overview]');
    var topProductsRoot = document.querySelector('[data-admin-top-products]');
    var recentReviewsRoot = document.querySelector('[data-admin-recent-reviews]');
    var reviewsRoot = document.querySelector('[data-admin-reviews]');
    var moderationRoot = document.querySelector('[data-admin-moderation-summary]');
    var requestsRoot = document.querySelector('[data-admin-requests]');
    var widgetsRoot = document.querySelector('[data-admin-widgets]');
    var settingsRoot = document.querySelector('[data-admin-settings]');
    var roadmapRoot = document.querySelector('[data-admin-roadmap]');

    if (overviewRoot) renderOverview(overviewRoot, dashboard.overview || {});
    if (topProductsRoot) renderTopProducts(topProductsRoot, dashboard.top_products || []);
    if (recentReviewsRoot) renderRecentReviews(recentReviewsRoot, dashboard.recent_reviews || []);
    if (reviewsRoot) renderReviewsPage(reviewsRoot, reviews);
    if (moderationRoot) renderModerationSummary(moderationRoot, dashboard.moderation || {});
    if (requestsRoot) renderRequests(requestsRoot, requests.summary || {}, requests.requests || []);
    if (widgetsRoot) renderWidgets(widgetsRoot, widgets);
    if (settingsRoot) renderSettings(settingsRoot, settings);
    if (roadmapRoot) renderRoadmap(roadmapRoot);
  }).catch(renderStaticFallback);
})();
