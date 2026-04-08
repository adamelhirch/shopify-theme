# Collaboration Workflow

## Store and themes

- Store: `4bru0c-p4.myshopify.com`
- Live theme: `Copie mise à jour de Motion` (`180888928523`)
- Active shared preview: `QA Shared v1.1.7` (`181152874763`)
- Frozen backup theme: `QA Shared v1` (`181070168331`)

## Rules

- Never implement directly on `main`.
- One Git branch per task.
- Shopify preview is the source of truth when the active preview name or ID is known.
- Sync from the active Shopify preview before editing the theme locally.
- Push to the same Shopify preview first, validate there, then commit and push Git.
- `QA Shared v1` is frozen and restore-only.
- Never push normal work to `QA Shared v1`.
- Before any Shopify push, confirm that `./bin/theme-push-qa.sh` and the CLI output both target `181152874763`.

## Daily flow

1. Identify the exact active Shopify preview theme.
2. Pull the local theme from that preview.
3. Create or use the dedicated Git branch for the task.
4. Work locally from the synced preview state only.
5. Push the changes back to the same Shopify preview.
6. Validate on the preview itself.
7. Commit and push the Git branch only after preview validation.

## Commands

Start local development:

```bash
./bin/theme-dev.sh
```

Push current local code to the shared QA theme:

```bash
./bin/theme-push-qa.sh
```

Expected target:

```text
QA Shared v1.1.7 (181152874763)
```

## Important distinction

- `git push`: shares code on GitHub.
- `theme-push-qa`: updates the current shared Shopify review theme (`QA Shared v1.1.7`).

For theme work, the real order is:

```text
pull preview -> edit -> push preview -> verify -> commit Git -> push Git
```
