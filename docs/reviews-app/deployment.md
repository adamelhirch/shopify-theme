# Reviews App Deployment

Cette base permet de deployer le service reviews sur ton serveur physique avec
conteneurs et reverse proxy Nginx.

## 1. Service app

Le service applicatif est:

- `apps/reviews-service/server.rb`

Il ecoute sur:

- `127.0.0.1:4567` en local
- `0.0.0.0:4567` dans le container

Variable utile:

- `VD_REVIEWS_BIND=0.0.0.0` dans Docker

## 2. Docker

Build:

```bash
docker build -f apps/reviews-service/Dockerfile -t vd-reviews .
```

Run:

```bash
docker run -d \
  --name vd-reviews \
  -p 4567:4567 \
  -v "$(pwd)/data:/app/data" \
  vd-reviews
```

Ou avec compose:

```bash
docker compose -f apps/reviews-service/docker-compose.example.yml up -d --build
```

## 3. Nginx reverse proxy

Exemple:

```nginx
server {
  server_name reviews.vanilledesire.local;

  location / {
    proxy_pass http://127.0.0.1:4567;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Les pages admin statiques peuvent ensuite appeler ce service via:

- `http://127.0.0.1:4567/api/dashboard`
- `http://127.0.0.1:4567/api/reviews`
- `http://127.0.0.1:4567/api/requests`
- `http://127.0.0.1:4567/api/widgets`
- `http://127.0.0.1:4567/api/settings`

## 4. Shopify app proxy cible

Quand la vraie app Shopify sera installee:

- storefront path: `/apps/vd-reviews`
- submit route: `/apps/vd-reviews/submit`
- moderation route: backoffice prive

Reference Shopify officielle utilisee pour ce choix:

- [About app proxies and dynamic data](https://shopify.dev/apps/build/online-store/display-dynamic-data)

## 5. Bootstrapping Shopify

Quand tu auras les acces pour pousser les definitions Shopify:

```bash
./bin/bootstrap-reviews-metaobjects.rb
```

Puis:

```bash
./bin/sync-reviews-store-to-shopify.rb --dry-run
./bin/sync-reviews-store-to-shopify.rb
```

## 6. Workflow recommande

1. Deployer le service reviews sur le serveur
2. Exposer via Nginx
3. Brancher la page storefront `page.review-request`
4. Installer l'app proxy Shopify
5. Basculer les soumissions de la page vers l'URL proxifiee
6. Activer les demandes post-achat / tokens / QR
