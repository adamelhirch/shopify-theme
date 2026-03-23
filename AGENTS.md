# Agent Workflow

## Git collaboration rule

For any new task in this repository, the default workflow is:

1. Sync the agreed base branch for the active delivery track first.
2. Create a dedicated branch before making changes:
   `git checkout -b <branch-name>`
3. Do the work on that branch only.
4. Validate the task before closing it.
5. Commit once the task is validated.
6. Push the branch to the remote:
   `git push -u origin <branch-name>`

## Theme targeting rule

- `QA Shared v1` (`181070168331`) is a frozen backup theme.
- Never push routine work to `QA Shared v1`.
- All normal preview and review pushes must go only to `QA Shared v1.1` (`181079441675`).
- Before any Shopify push, verify the target theme ID in the script or CLI output.
- For the current v1.1 delivery track, branch from the agreed v1.1 base branch, not blindly from `main`.

## Constraints

- Do not work directly on `main` for implementation tasks.
- Pull the correct base branch before creating the branch, not after.
- Use one branch per task or feature.
- If the worktree is already dirty with unrelated changes, stop and coordinate before pulling or branching.
- Treat `QA Shared v1` as restore-only unless the user explicitly asks for a restoration.
