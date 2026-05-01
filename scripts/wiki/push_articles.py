"""
Push les bodies définis dans `articles.py` vers Shopify, via la skill
`shopify_admin_ops.py`. À relancer si on régénère le contenu.

Pré-requis :
- `~/.vd-shopify.env` chargé dans l'environnement (SHOPIFY_STORE_DOMAIN +
  token Admin API).
- python3 dans le PATH.

Usage :
    set -a; source ~/.vd-shopify.env; set +a
    python3 scripts/wiki/push_articles.py             # push tous les articles
    python3 scripts/wiki/push_articles.py --migrate   # + migre les suffixes
                                                       # vers wiki-article

Le script ne supprime jamais de page : il met à jour `body` et
optionnellement `templateSuffix`.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
REPO_ROOT = HERE.parent.parent
SKILL_SCRIPT = (
    Path.home()
    / "Documents/BUT/Stage/Vanille Désiré/skill-shopify/skill/scripts/shopify_admin_ops.py"
)

# Pages exclues de la migration de suffix (le hub garde son template propre).
HUB_HANDLE = "wiki"


def load_articles() -> dict[str, str]:
    sys.path.insert(0, str(HERE))
    from articles import ARTICLES  # type: ignore

    return ARTICLES


def gql_query(query: str) -> dict:
    r = subprocess.run(
        ["python3", str(SKILL_SCRIPT), "graphql-query", "--query", query],
        capture_output=True,
        text=True,
        env=os.environ,
        check=True,
    )
    return json.loads(r.stdout)


def gql_mutation(query: str, variables: dict) -> dict:
    r = subprocess.run(
        [
            "python3",
            str(SKILL_SCRIPT),
            "graphql-mutation",
            "--query",
            query,
            "--variables",
            json.dumps(variables),
        ],
        capture_output=True,
        text=True,
        env=os.environ,
        check=True,
    )
    return json.loads(r.stdout)


def fetch_id_map() -> dict[str, dict]:
    res = gql_query(
        'query { pages(first:50, query:"handle:wiki*") '
        "{ edges { node { id handle templateSuffix } } } }"
    )
    return {
        e["node"]["handle"]: {"id": e["node"]["id"], "suffix": e["node"]["templateSuffix"]}
        for e in res["data"]["pages"]["edges"]
    }


def push_body(page_id: str, body: str) -> tuple[bool, str]:
    res = gql_mutation(
        "mutation pageUpdate($id: ID!, $page: PageUpdateInput!) "
        "{ pageUpdate(id: $id, page: $page) { page { handle } "
        "userErrors { field message } } }",
        {"id": page_id, "page": {"body": body}},
    )
    errs = res.get("data", {}).get("pageUpdate", {}).get("userErrors") or []
    if res.get("ok") and not errs:
        return True, ""
    return False, json.dumps(errs or res, ensure_ascii=False)


def set_suffix(page_id: str, suffix: str) -> tuple[bool, str]:
    res = gql_mutation(
        "mutation pageUpdate($id: ID!, $page: PageUpdateInput!) "
        "{ pageUpdate(id: $id, page: $page) { page { handle templateSuffix } "
        "userErrors { field message } } }",
        {"id": page_id, "page": {"templateSuffix": suffix}},
    )
    errs = res.get("data", {}).get("pageUpdate", {}).get("userErrors") or []
    if res.get("ok") and not errs:
        return True, ""
    return False, json.dumps(errs or res, ensure_ascii=False)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--migrate",
        action="store_true",
        help="Aligne aussi le templateSuffix sur 'wiki-article' (hors hub).",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Affiche le plan sans rien écrire côté Shopify.",
    )
    args = p.parse_args()

    if not os.environ.get("SHOPIFY_STORE_DOMAIN"):
        print("Erreur : `~/.vd-shopify.env` non chargé.", file=sys.stderr)
        return 1

    articles = load_articles()
    id_map = fetch_id_map()

    missing = [h for h in articles if h not in id_map]
    if missing:
        print(f"Pages introuvables : {missing}", file=sys.stderr)
        return 1

    print(f"=== Push des bodies ({len(articles)} articles) ===")
    ok = 0
    for handle, body in articles.items():
        if args.dry_run:
            print(f"  → {handle} ({len(body)} chars)")
            continue
        success, err = push_body(id_map[handle]["id"], body)
        if success:
            ok += 1
            print(f"  ✓ {handle}")
        else:
            print(f"  ✗ {handle}: {err}")
    print(f"Bodies poussés : {ok}/{len(articles)}")

    if args.migrate:
        print()
        print("=== Migration des suffixes vers 'wiki-article' (hors hub) ===")
        targets = [
            (h, info)
            for h, info in id_map.items()
            if h != HUB_HANDLE and info["suffix"] != "wiki-article"
        ]
        ok2 = 0
        for handle, info in targets:
            if args.dry_run:
                print(f"  → {handle}: {info['suffix']} → wiki-article")
                continue
            success, err = set_suffix(info["id"], "wiki-article")
            if success:
                ok2 += 1
                print(f"  ✓ {handle}")
            else:
                print(f"  ✗ {handle}: {err}")
        print(f"Suffixes migrés : {ok2}/{len(targets)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
