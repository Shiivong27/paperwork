# Paperwork and REA development workspace

## Image-to-PDF app

**Paperwork** offers image conversion, PDF merging, page extraction, rotation,
visual additions, and signature placement. From this
folder, run `npm start`, then open **http://127.0.0.1:4173**. See
`tools/image-to-pdf/README.md` for features, limits, and restore instructions.
Reference-page observations are in `investigations/ilovepdf/findings.md`.

The app has a dedicated publishing repository at
https://github.com/Shiivong27/paperwork and a GitHub Pages URL at
https://shiivong27.github.io/paperwork/. This folder is the working copy of that
repository. Publishing/update instructions are in `tools/image-to-pdf/README.md`.
Machine-specific Codex settings, installed dependencies, and captured artifacts
are excluded from version control.

## Develop and publish

For a fresh clone, install the app dependency with
`npm ci --prefix tools/image-to-pdf`. The optional REA runtime is not needed to
run or build the image converter.

```bash
npm start
npm run build:app
git add .
git commit -m "Update Paperwork"
git push
```

Review your changes in VS Code Source Control before committing. `main` tracks
`origin/main`. Every push to `main` runs `.github/workflows/pages.yml`, which
builds and publishes only `tools/image-to-pdf/dist` to GitHub Pages.

Investigate a specific software feature, record evidence, turn the behavior into
a specification, and build a tool against that specification.

## Installed setup

- Official project: https://github.com/morluto/rea
- REA runtime: `rea-agents` **6.8.0**, pinned in `package-lock.json`.
- Local Node.js: **24.22.2**, pinned in `.rea/runtime/package-lock.json`.
- Project skill: `.agents/skills/reverse-engineer-anything/`, copied intact from
  the installed release's `skills/reverse-engineer-anything/`, with its license.
- Project MCP server: `.codex/config.toml`, using `scripts/rea.sh` to start the
  pinned local runtime directly. No package download occurs when MCP starts.

The optional local Node installation leaves the system Node installation unchanged.

## Start using REA

Restart the Codex extension in VS Code so it connects to the new MCP server.
If the skill does not appear, start a new Codex conversation in this folder.
The project skill will be available on the next turn after discovery refresh.

Example prompt, replacing the placeholders with a real target and feature:

> Use $reverse-engineer-anything to investigate [feature] in [app or artifact].
> Record the observed behavior and evidence in investigations/[target]/, write
> acceptance criteria, and build a similar feature in tools/[tool]/.

Terminal commands from this folder:

```bash
npm run rea -- --version
npm run rea -- --help
npm run rea:verify
```

`rea:verify` checks the skill/runtime match, connects to MCP, reads its readiness
report, and analyzes a small generated JavaScript fixture. It retains the results
in the ignored `.rea/tmp/verification.json`. On macOS the first readiness check
may compile a process-inspection helper and need access to the user compiler cache.

JavaScript static analysis is available without a native decompiler. Native
decompilation requires a separately configured supported engine, such as Ghidra
or Hopper. Browser/runtime workflows may need a running debug-enabled target and
their own prerequisites. An advertised tool is not proof its dependencies are
installed; inspect REA's per-operation availability for the chosen target.

## Layout

```text
.agents/skills/reverse-engineer-anything/  Upstream skill and references
.codex/config.toml                       Project-local MCP registration
.rea/runtime/                           Pinned local Node installation
scripts/                                CLI launcher and verification
investigations/first-tool/findings.md     Investigation starter
investigations/first-tool/evidence/       Local artifacts, ignored by Git
tools/first-tool/                        Implementation starter
AGENTS.md                               Workspace working instructions
```

## Restore dependencies

With npm available, run from this folder:

```bash
npm ci --prefix .rea/runtime
PATH="$PWD/.rea/runtime/node_modules/.bin:$PATH" npm ci
npm run rea:verify
```

Codex loads project configuration only for trusted folders. This workspace was
registered as trusted in the user's Codex config, with a backup of that file.
The machine-specific `.codex/config.toml` is ignored by Git. On a new clone,
configure REA's MCP server for that machine after restoring its dependencies;
the existing local registration continues to work in this folder.

For upgrades, update the pinned REA dependency, replace the whole copied skill
from that same installed release, and rerun verification. Avoid running
`rea setup` for this client: it manages user-level registrations and would create
a second installation path alongside this project's connection.

Upstream setup documentation:
https://github.com/morluto/rea/blob/main/docs/installation.md
