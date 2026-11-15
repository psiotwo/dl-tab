# Contributing

Use Node.js 22 or newer; `.nvmrc` selects Node 22. CI tests Node 22 and 24.

```sh
npm ci --ignore-scripts
npm test
npm run audit
```

The audit includes development dependencies and fails on moderate or more severe advisories. CI also reviews newly introduced dependencies and runs CodeQL on JavaScript and TypeScript. Scheduled runs check for newly disclosed issues even when the code has not changed. Dependabot proposes weekly npm and GitHub Actions updates; review and merge these through the normal checks.

## Releases

Use Conventional Commit titles when squashing pull requests: `fix: ...` for patches, `feat: ...` for features, and `feat!: ...` or a `BREAKING CHANGE:` footer for breaking changes. Use `chore: ...`, `docs: ...`, and `test: ...` for maintenance. Maintenance-only commits normally do not create a release.

Release Please opens a pull request updating `package.json`, `package-lock.json`, its version manifest, and `CHANGELOG.md`. Review that PR, run its checks, and merge it to create a version tag and GitHub release. Nothing is published to npm; the package remains private. The initial version baseline is `0.1.0`, not an existing published release. Before 1.0, breaking changes bump the minor version; features also bump minor, and fixes bump patch.

The release workflow uses the built-in `GITHUB_TOKEN`. GitHub does not automatically run other workflows for PRs created or updated by that token. A maintainer must close and reopen the release PR after its latest update to trigger PR checks before merging. For fully automatic checks, replace this token with a narrowly scoped GitHub App token. See the [Release Please credentials documentation](https://github.com/googleapis/release-please-action#github-credentials).

## GitHub setup

These repository settings require an administrator and are not enabled by the files in this change:

- Allow GitHub Actions to create pull requests under **Settings → Actions → General** so Release Please can open its PRs.
- Enable the dependency graph, Dependabot alerts and security updates, secret scanning and push protection, and private vulnerability reporting under the repository security settings.
- Use the checked-in CodeQL workflow as advanced setup; disable CodeQL default setup if it is already enabled.
- After the first successful workflow runs, protect `main` with required pull requests and checks: **Test (Node 22)**, **Test (Node 24)**, **Dependency audit**, **Dependency review**, and **CodeQL analysis**. Block force pushes and branch deletion. Enable code-owner approval when there is another maintainer available to review; a sole owner cannot approve their own PR.

`.github/CODEOWNERS` routes reviews to `@psiotwo`, including changes to ownership and workflows. Workflow actions are pinned to commit hashes and tracked by Dependabot. Pull request workflows use the `pull_request` event and do not receive release credentials.
