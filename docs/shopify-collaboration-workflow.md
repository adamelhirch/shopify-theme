# Shopify Collaboration Workflow

Store: `4bru0c-p4.myshopify.com`

Theme roles:
- Live theme, never touch: `Copie mise à jour de Motion` (`180888928523`)
- Shared preview/review theme: `QA Shared` (`181070168331`)
- This workstation default dev theme: `Development (3e3a23-Adams-MacBook-Air)` (`181069611275`)
- Separate existing dev theme on the store: `Development (a61445-Host-001)` (`181070135563`)

Rules:
- Never work directly on `main`
- Never push to the live theme
- Each developer works on a personal development theme only
- If `git status --short` is not empty and changes are not clearly related, stop before pushing

Local commands:
- Start local development: `./scripts/dev-local.sh`
- Push branch + update shared Shopify preview: `./scripts/push-qa-shared.sh`

Developer override:
- The scripts default to this workstation dev theme `181069611275`
- Another developer can keep the same scripts and override their own theme with:
  `SHOPIFY_DEV_THEME_ID=181070135563 ./scripts/dev-local.sh`

Push behavior:
1. Push the current git branch to `origin`
2. Push the current local theme code to `QA Shared`
3. Do not touch the live theme
