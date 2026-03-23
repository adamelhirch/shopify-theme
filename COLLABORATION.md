# Collaboration Workflow

## Store and themes

- Store: `4bru0c-p4.myshopify.com`
- Live theme: `Copie mise à jour de Motion` (`180888928523`)
- Shared QA theme: `QA Shared v1.1` (`181079441675`)
- Frozen backup theme: `QA Shared v1` (`181070168331`)

## Rules

- Never implement directly on `main`.
- One Git branch per task.
- One Shopify development theme per person.
- Never share the same Shopify development theme while working in parallel.
- Push to the shared QA theme only when a task is ready for review.
- `QA Shared v1` is frozen and restore-only.
- Never push normal work to `QA Shared v1`.
- The only shared preview target for routine work is `QA Shared v1.1` (`181079441675`).
- Before any Shopify push, confirm that `./bin/theme-push-qa.sh` and the CLI output both target `181079441675`.

## Daily flow

1. Update the agreed Git base branch for the active delivery track.
2. Create a dedicated branch from that base.
3. Work locally with `shopify theme dev`.
4. When the task is finished, push the Git branch.
5. If the task must be visible to others in Shopify, push the code only to `QA Shared v1.1`.

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
QA Shared v1.1 (181079441675)
```

## Important distinction

- `git push`: shares code on GitHub.
- `theme-push-qa`: updates the current shared Shopify review theme (`QA Shared v1.1`).

Both are needed if someone else must both pull the code and refresh the shared review theme.
