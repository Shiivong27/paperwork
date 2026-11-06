# REA workspace

This workspace is for investigating software behavior and building useful tools
from the resulting specifications.

- Use the repository-local `reverse-engineer-anything` skill when a task needs
  shipped-artifact analysis, decompilation, or runtime evidence. Use normal coding
  tools for ordinary source-repository work.
- Invoke the pinned CLI with `npm run rea -- <arguments>` or
  `bash scripts/rea.sh <arguments>`. Do not replace the project-local MCP
  registration with a user-wide `rea setup` registration.
- Record investigations in `investigations/<target>/`; build implementations in
  `tools/<tool>/`.
- Distinguish observed facts, inferences, unknowns, and implementation choices.
  Keep evidence references and target versions with findings.
- Start with one specific feature and turn its observed behavior into acceptance
  criteria before implementation. Verify the implementation against those criteria.
- Keep captures, binaries, credentials, and personal data out of Git. The evidence
  directories are ignored by default; commit only deliberately reviewed summaries.
- Keep the runtime and copied upstream skill on the same REA release. Preserve
  upstream instructions and references when refreshing the skill.
