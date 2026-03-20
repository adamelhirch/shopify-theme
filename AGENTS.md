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
