# Agent Workflow

## Git collaboration rule

For any new task in this repository, the default workflow is:

1. Sync the main branch first:
   `git checkout main`
   `git pull --rebase origin main`
2. Create a dedicated branch before making changes:
   `git checkout -b <branch-name>`
3. Do the work on that branch only.
4. Validate the task before closing it.
5. Commit once the task is validated.
6. Push the branch to the remote:
   `git push -u origin <branch-name>`

## Constraints

- Do not work directly on `main` for implementation tasks.
- Pull before creating the branch, not after.
- Use one branch per task or feature.
- If the worktree is already dirty with unrelated changes, stop and coordinate before pulling or branching.

## Shopify preview-first workflow

For Shopify theme work in this repository, Git is not the source of truth by default.
The active Shopify preview theme is the source of truth whenever the user gives a
specific preview name or theme ID.

Follow this order strictly:

1. Identify the exact Shopify preview theme to work on:
   `QA Shared vX.X.X` + theme ID.
2. Pull or sync the local theme files from that Shopify preview before editing.
   Never assume the current branch already matches the live preview.
3. Make changes locally from that synced preview state only.
4. Push the changes to the same Shopify preview first.
5. Validate the result on the Shopify preview itself.
6. Commit the exact validated state to Git.
7. Push the Git branch immediately after the preview is confirmed.

### Non-negotiable rules for Shopify tasks

- Never start from an older Git state if the Shopify preview may be newer.
- If Git and Shopify preview diverge, resync from the preview first.
- For theme work, the expected order is:
  `pull preview -> edit -> push preview -> verify -> commit Git -> push Git`
- Do not say a task is "pushed" if it was only pushed to Git but not to Shopify preview.
- When reporting completion, specify both:
  - the Shopify preview updated
  - the Git commit/branch updated
- If the user names a new preview version in a new chat, continue with the same
  preview-first workflow automatically.

## Project understanding

This repository is a Shopify theme based on Dawn 15.4.1, but it should be treated
as a premium editorial brand system for Vanille Désiré, not as a standard
e-commerce theme.

Key product understanding:

- The project blends catalogue, recipes, and WIKI into one brand journey.
- The WIKI is a navigation pillar, not a secondary blog.
- Editorial value and conversion must coexist: content should help sell without
  losing pedagogical value.
- When making design or architecture choices, prefer systems that strengthen
  catalogue + recipes + WIKI relationships rather than isolated page styling.

Relevant implementation mindset:

- Treat the theme as content-first and brand-first.
- Avoid hardcoding more editorial copy when structured content, metafields, or
  reusable settings would be more stable.
- Prefer stable content architecture over visual tricks tied only to item order
  or loop indexes.
- Keep preview helpers and QA logic centralized where possible instead of
  duplicating them across multiple scripts.

## WIKI direction for future versions

For WIKI-focused work such as `v1.1.6`, the priority is not only visual polish.
It should be treated as a structuring phase.

Preferred direction:

- Build a clearer WIKI architecture:
  chapter -> sub-theme -> article
- Create explicit bridges between WIKI, products, and recipes.
- Move semantic meaning out of visual ordering when possible.
- Standardize article structure:
  hero, summary, key points, anchored summary, body, linked products, linked
  recipes, next reading
- Prefer structured content fields for:
  chapter, level, usage, linked product, linked recipe, primary CTA, secondary
  CTA, cover visual
- Keep WIKI styles and scripts as isolated as possible instead of inflating the
  largest global assets further

## Operational caution

Some repository documentation or helper scripts may reference older shared QA
theme names or theme IDs.

Non-negotiable rule:

- If `AGENTS.md`, `COLLABORATION.md`, scripts, and the user message disagree,
  the user-provided active preview name + theme ID wins.
- Before any Shopify task, confirm the exact preview version and theme ID from
  the current user context.
