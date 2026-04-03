# WIKI v1.1.6 Blueprint

Source of truth Shopify preview:
- `QA Shared v1.1.6`
- Theme ID: `181138194699`
- Preview URL: `https://4bru0c-p4.myshopify.com?preview_theme_id=181138194699`

Working Git branch:
- `codex/wiki-v1-1-6-blueprint`

## Goal

Turn the WIKI into a durable editorial system instead of a visual-only layer.
The v1.1.6 work should stabilize the structure `chapitre > sous-theme > article`,
connect WIKI entries to products and recipes, and stop encoding meaning in block order.

## Sprint 1: Data Foundation

Goal:
- define the editorial model in Shopify before pushing more design

Shopify work:
1. Create article metafields for:
   - `custom.wiki_chapter_key`
   - `custom.wiki_chapter_label`
   - `custom.wiki_subtheme_key`
   - `custom.wiki_subtheme_label`
   - `custom.wiki_summary`
   - `custom.wiki_key_points`
   - `custom.wiki_reading_level`
   - `custom.wiki_usage_tags`
   - `custom.wiki_linked_products`
   - `custom.wiki_linked_recipes`
   - `custom.wiki_next_article`
   - `custom.wiki_primary_cta_label`
   - `custom.wiki_primary_cta_url`
   - `custom.wiki_secondary_cta_label`
   - `custom.wiki_secondary_cta_url`
2. Decide whether chapters and sub-themes should become metaobjects.
3. Fill 3 to 5 pilot WIKI articles with complete metadata.

Theme work:
1. Make WIKI components consume explicit chapter keys instead of `forloop.index`.
2. Add article and list templates that gracefully read WIKI metafields when present.
3. Isolate WIKI-only CSS and JS in dedicated assets.

Validation:
1. A chapter can be moved or reordered without changing its meaning.
2. A WIKI article can render summary, key points, TOC, linked products, linked recipes, and next reading from data.
3. The preview keeps internal WIKI links on the preview theme.

## Sprint 2: WIKI Article System

Goal:
- make article pages the stable core of the editorial experience

Theme work:
1. Standardize the article shell:
   - hero
   - summary
   - key points
   - anchored TOC
   - content
   - linked products
   - linked recipes
   - next reading
2. Replace static article ledes with metadata-driven copy.
3. Keep outbound paths visible so the article never ends as a dead end.

Content work:
1. Normalize article intros and excerpts to match the new summary model.
2. Define the editorial rule:
   - WIKI explains
   - recipe demonstrates
   - product converts

Validation:
1. Every pilot article has at least one reading exit.
2. Key points and linked resources degrade cleanly when metadata is missing.
3. Mobile reading remains premium and scannable.

## Sprint 3: Navigation And Hub

Goal:
- reconnect the WIKI hub and listing pages to the new structure

Theme work:
1. Rebuild the WIKI hub around explicit chapter metadata.
2. Upgrade the WIKI list page with chapter/sub-theme/usage signals.
3. Keep immersive motion, but only after the structure is stable.

Content work:
1. Re-align glossaire and savoir-faire pages with the shared WIKI taxonomy.
2. Remove orphan pages or manual blocks that duplicate chapter logic.

Validation:
1. Hub, list, article, glossaire and savoir-faire speak the same taxonomy.
2. The WIKI can expand without adding new structural hardcode.
3. The preview is validated before any Git commit.

## Risks To Watch

- hardcoded chapter semantics in section order
- hardcoded editorial copy inside Liquid
- adding WIKI styles into `assets/vanille-desire.css`
- preview links silently dropping `preview_theme_id`
- manual JSON templates drifting away from the editorial model
