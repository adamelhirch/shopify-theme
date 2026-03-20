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

## Shopify collaboration rule

- Store: `4bru0c-p4.myshopify.com`
- Live theme never to touch: `Copie mise à jour de Motion` (`180888928523`)
- Shared preview theme: `QA Shared` (`181070168331`)
- Personal dev theme on this workstation: `Development (3e3a23-Adams-MacBook-Air)` (`181069611275`)
- A separate developer theme also exists: `Development (a61445-Host-001)` (`181070135563`)

When the user says `push`, do both:
1. `git push` the current branch
2. `shopify theme push` the current local theme code to `QA Shared`

Additional rules:
- Never push to the live theme
- Never implement on `main`
- If the repo is dirty with unrelated changes, stop and report it before pushing
