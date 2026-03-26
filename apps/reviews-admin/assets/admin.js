(function () {
  var DATA_PATH = '../../data/reviews-admin-summary.json';

  function formatNumber(value) {
    return new Intl.NumberFormat('fr-FR').format(value || 0);
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

  function statusBadge(status) {
    var normalized = (status || '').toLowerCase();
    var className = 'admin-badge';

    if (normalized === 'planned' || normalized === 'next' || normalized === 'pending') {
      className += ' admin-badge--warning';
    } else if (normalized === 'backlog' || normalized === 'draft') {
      className += ' admin-badge--muted';
    }

    return '<span class="' + className + '">' + status + '</span>';
  }

  function renderOverview(root, overview) {
    var cards = [
      { label: 'Commentaires', value: formatNumber(overview.total_reviews) },
      { label: 'Note moyenne', value: overview.average_rating.toFixed(1) },
      { label: 'Avis verifies', value: formatNumber(overview.verified_reviews) },
      { label: 'Produits notes', value: formatNumber(overview.reviewed_products) },
      { label: 'Demandes pretes', value: formatNumber(overview.review_requests_ready) }
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
          '</tr>' +
        '</thead>' +
        '<tbody>' +
          products.map(function (product) {
            return (
              '<tr>' +
                '<td><a href="' + (product.url || '#') + '">' + product.title + '</a></td>' +
                '<td>' + formatNumber(product.reviews) + '</td>' +
                '<td><span class="admin-stars">' + starsMarkup(product.rating) + '</span></td>' +
                '<td>' + formatNumber(product.verified_reviews) + '</td>' +
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
                '<span>' + (review.date || 'Sans date') + '</span>' +
                '<span>' + review.product_title + '</span>' +
                (review.verified ? '<span class="admin-badge">Verifie</span>' : '') +
              '</div>' +
              '<p class="admin-list__quote">' + review.quote + '</p>' +
            '</li>'
          );
        }).join('') +
      '</ul>'
    );
  }

  function renderModeration(root, queue) {
    root.innerHTML = queue.map(function (item) {
      return (
        '<article class="admin-quote-card">' +
          '<div class="admin-list__meta">' +
            '<strong>' + item.author + '</strong>' +
            '<span>' + item.product_title + '</span>' +
            '<span>' + (item.date || 'Sans date') + '</span>' +
            '<span class="admin-stars">' + starsMarkup(item.rating) + '</span>' +
            (item.verified ? '<span class="admin-badge">Verifie</span>' : '') +
            statusBadge(item.status) +
          '</div>' +
          '<p class="admin-list__quote">' + item.quote + '</p>' +
        '</article>'
      );
    }).join('');
  }

  function renderRequests(root, requests) {
    root.innerHTML = (
      '<div class="admin-list__meta">' +
        '<span class="admin-badge">Catalogue QR pret</span>' +
        '<span>' + formatNumber(requests.total_products) + ' produits relies</span>' +
        (requests.review_page_url ? '<span>' + requests.review_page_url + '</span>' : '') +
      '</div>' +
      '<table class="admin-table">' +
        '<thead>' +
          '<tr>' +
            '<th>Produit</th>' +
            '<th>Handle</th>' +
            '<th>Review request</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' +
          requests.samples.map(function (sample) {
            return (
              '<tr>' +
                '<td>' + sample.title + '</td>' +
                '<td>' + sample.handle + '</td>' +
                '<td><a href="' + sample.review_request_url + '">' + sample.review_request_url + '</a></td>' +
              '</tr>'
            );
          }).join('') +
        '</tbody>' +
      '</table>'
    );
  }

  function renderWidgets(root, widgets) {
    root.innerHTML = widgets.map(function (widget) {
      return (
        '<article class="admin-card admin-widget-card">' +
          statusBadge(widget.status) +
          '<h3>' + widget.name + '</h3>' +
          '<p>' + widget.description + '</p>' +
        '</article>'
      );
    }).join('');
  }

  function renderRoadmap(root, items) {
    root.innerHTML = items.map(function (item) {
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

  fetch(DATA_PATH)
    .then(function (response) {
      if (!response.ok) {
        throw new Error('Missing reviews-admin-summary.json');
      }

      return response.json();
    })
    .then(function (data) {
      setText('[data-admin-store]', data.store || 'Vanille Desire');
      setText('[data-admin-generated-at]', data.generated_at || '');

      var overviewRoot = document.querySelector('[data-admin-overview]');
      var topProductsRoot = document.querySelector('[data-admin-top-products]');
      var recentReviewsRoot = document.querySelector('[data-admin-recent-reviews]');
      var moderationRoot = document.querySelector('[data-admin-moderation]');
      var requestsRoot = document.querySelector('[data-admin-requests]');
      var widgetsRoot = document.querySelector('[data-admin-widgets]');
      var roadmapRoot = document.querySelector('[data-admin-roadmap]');

      if (overviewRoot) renderOverview(overviewRoot, data.overview);
      if (topProductsRoot) renderTopProducts(topProductsRoot, data.top_products || []);
      if (recentReviewsRoot) renderRecentReviews(recentReviewsRoot, data.recent_reviews || []);
      if (moderationRoot) renderModeration(moderationRoot, data.moderation_queue || []);
      if (requestsRoot) renderRequests(requestsRoot, data.requests || { samples: [] });
      if (widgetsRoot) renderWidgets(widgetsRoot, data.widgets || []);
      if (roadmapRoot) renderRoadmap(roadmapRoot, data.roadmap || []);
    })
    .catch(function () {
      document.body.classList.add('is-admin-error');
      setText('[data-admin-generated-at]', 'Donnees absentes');
      var nodes = document.querySelectorAll('[data-admin-fallback]');

      nodes.forEach(function (node) {
        node.hidden = false;
      });
    });
})();
