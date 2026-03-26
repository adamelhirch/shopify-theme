#!/usr/bin/env bash
set -euo pipefail

VERSION="1.0"
STAMP="$(date +%Y%m%d-%H%M%S)"
HOSTNAME_SAFE="$(hostname | tr ' /:' '___')"
WORK_ROOT="${PWD}"
BUNDLE_ROOT="${WORK_ROOT}/vd-codex-access-${HOSTNAME_SAFE}-${STAMP}"
ARCHIVE_PATH="${BUNDLE_ROOT}.tar.gz"

mkdir -p "${BUNDLE_ROOT}"
mkdir -p "${BUNDLE_ROOT}/system" "${BUNDLE_ROOT}/nginx" "${BUNDLE_ROOT}/docker" "${BUNDLE_ROOT}/env" "${BUNDLE_ROOT}/shopify"

note() {
  printf '[vd-access] %s\n' "$*"
}

have() {
  command -v "$1" >/dev/null 2>&1
}

copy_if_exists() {
  local src="$1"
  local dest="$2"
  if [ -e "$src" ]; then
    mkdir -p "$(dirname "$dest")"
    cp -R "$src" "$dest"
  fi
}

append_cmd() {
  local title="$1"
  shift
  {
    printf '===== %s =====\n' "$title"
    "$@" 2>&1 || true
    printf '\n'
  } >> "${BUNDLE_ROOT}/system/commands.txt"
}

collect_file_matches() {
  local output_file="$1"
  shift
  : > "$output_file"
  for path in "$@"; do
    if [ -e "$path" ]; then
      printf '%s\n' "$path" >> "$output_file"
    fi
  done
}

note "Collecte systeme"
{
  echo "bundle_version=${VERSION}"
  echo "generated_at=$(date -Iseconds)"
  echo "hostname=$(hostname)"
  echo "user=$(whoami)"
  echo "pwd=${WORK_ROOT}"
  echo "uname=$(uname -a)"
} > "${BUNDLE_ROOT}/system/identity.txt"

append_cmd "ip_addr" bash -lc "ip addr || ifconfig || true"
append_cmd "ss_listen" bash -lc "ss -tulpn || netstat -tulpn || netstat -an || true"
append_cmd "ps_aux" ps aux
append_cmd "env" env

if have docker; then
  append_cmd "docker_ps" docker ps -a
  append_cmd "docker_images" docker images
  append_cmd "docker_networks" docker network ls
fi

if have docker compose; then
  append_cmd "docker_compose_ls" docker compose ls
fi

if have nginx; then
  append_cmd "nginx_v" nginx -v
  append_cmd "nginx_t" nginx -t
fi

note "Collecte nginx"
copy_if_exists /etc/nginx "${BUNDLE_ROOT}/nginx/etc-nginx"
copy_if_exists /usr/local/etc/nginx "${BUNDLE_ROOT}/nginx/usr-local-etc-nginx"

note "Collecte docker/compose"
{
  find "${WORK_ROOT}" -maxdepth 5 \( -name 'docker-compose*.yml' -o -name 'docker-compose*.yaml' -o -name 'compose.yml' -o -name 'compose.yaml' -o -name 'Dockerfile' \) 2>/dev/null || true
} > "${BUNDLE_ROOT}/docker/discovered-compose-files.txt"

while IFS= read -r path; do
  [ -n "$path" ] || continue
  rel="${path#/}"
  mkdir -p "${BUNDLE_ROOT}/docker/$(dirname "$rel")"
  cp "$path" "${BUNDLE_ROOT}/docker/$rel"
done < "${BUNDLE_ROOT}/docker/discovered-compose-files.txt"

note "Collecte env sensibles et config app"
{
  find "${WORK_ROOT}" -maxdepth 4 \( -name '.env' -o -name '.env.*' -o -name '*.env' -o -name '*.example' -o -name '*.sample' \) 2>/dev/null || true
} > "${BUNDLE_ROOT}/env/discovered-env-files.txt"

while IFS= read -r path; do
  [ -n "$path" ] || continue
  rel="${path#/}"
  mkdir -p "${BUNDLE_ROOT}/env/$(dirname "$rel")"
  cp "$path" "${BUNDLE_ROOT}/env/$rel"
done < "${BUNDLE_ROOT}/env/discovered-env-files.txt"

note "Collecte Shopify"
{
  echo "SHOPIFY_STORE=${SHOPIFY_STORE:-}"
  echo "SHOPIFY_ADMIN_TOKEN=${SHOPIFY_ADMIN_TOKEN:-}"
  echo "SHOPIFY_API_KEY=${SHOPIFY_API_KEY:-}"
  echo "SHOPIFY_API_SECRET=${SHOPIFY_API_SECRET:-}"
  echo "SHOPIFY_APP_URL=${SHOPIFY_APP_URL:-}"
  echo "SHOPIFY_APP_PROXY_PREFIX=${SHOPIFY_APP_PROXY_PREFIX:-}"
  echo "SHOPIFY_APP_PROXY_SUBPATH=${SHOPIFY_APP_PROXY_SUBPATH:-}"
  echo "SHOPIFY_API_VERSION=${SHOPIFY_API_VERSION:-}"
} > "${BUNDLE_ROOT}/shopify/shopify-env.txt"

if [ -d "${HOME}/.config/shopify" ]; then
  copy_if_exists "${HOME}/.config/shopify" "${BUNDLE_ROOT}/shopify/shopify-config"
fi

if [ -d "${HOME}/.shopify" ]; then
  copy_if_exists "${HOME}/.shopify" "${BUNDLE_ROOT}/shopify/shopify-home"
fi

note "Collecte SSH"
mkdir -p "${BUNDLE_ROOT}/system/ssh"
copy_if_exists "${HOME}/.ssh/config" "${BUNDLE_ROOT}/system/ssh/config"
copy_if_exists "${HOME}/.ssh/known_hosts" "${BUNDLE_ROOT}/system/ssh/known_hosts"

if [ -f "${HOME}/.ssh/id_ed25519.pub" ]; then
  cp "${HOME}/.ssh/id_ed25519.pub" "${BUNDLE_ROOT}/system/ssh/id_ed25519.pub"
fi

if [ -f "${HOME}/.ssh/id_rsa.pub" ]; then
  cp "${HOME}/.ssh/id_rsa.pub" "${BUNDLE_ROOT}/system/ssh/id_rsa.pub"
fi

note "Ajout d un resume lisible"
cat > "${BUNDLE_ROOT}/README.txt" <<EOF
VD Codex access bundle
======================

Ce bundle a ete genere automatiquement pour me donner les acces et le contexte
serveur sans tout te faire remplir a la main.

Contenu principal:
- system/: infos machine, env, ecoute reseau, ssh public config
- nginx/: configs Nginx detectees
- docker/: Dockerfiles, compose files et conteneurs detectes
- env/: fichiers .env et fichiers de configuration app
- shopify/: variables et configs Shopify detectees

Important:
- ce bundle peut contenir des secrets
- partage-le seulement dans un canal de confiance

Archive:
- ${ARCHIVE_PATH}
EOF

note "Creation de l archive"
tar -czf "${ARCHIVE_PATH}" -C "${WORK_ROOT}" "$(basename "${BUNDLE_ROOT}")"

cat <<EOF

Bundle pret:
${ARCHIVE_PATH}

Commande suivante conseillee pour me l envoyer:
  scp "${ARCHIVE_PATH}" <machine-locale>:/tmp/

Si tu veux juste me donner un apercu rapide sans envoyer l archive:
  tar -tzf "${ARCHIVE_PATH}" | sed -n '1,120p'

EOF
