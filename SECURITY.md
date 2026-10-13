# Security policy

FrankenAgent treats donor repositories, READMEs, file names and model output as untrusted data.

## What v0.1 does

- **Donor code is never executed.** Donors are cloned shallowly with symlinks disabled; git does not transfer hooks. REA parses donor files as inert text.
- **Model-written file paths are confined** to the creature folder (no absolute paths, no `..`, no `node_modules` or `.git`).
- **The lab contract is immutable**: grow and repair steps cannot modify `test/contract/`; it is reinstalled after growing.
- **Creature tests run under Node's permission model**: read access to the creature folder only, no file writes, no child processes, no worker threads, no native addons. Runs are time-limited and output-limited.

## Known limits

- Node's permission model does not restrict network access on Node 22/24. Do not run creatures you have not reviewed outside the lab, and prefer a disposable VM or container for untrusted runs.
- Donor source excerpts are sent to the configured brain (Anthropic API or Claude CLI). Do not fuse private code you are not allowed to share with that provider.
- The license gate reads `package.json` and license files; it is a safeguard, not legal advice.

## Reporting

Please report vulnerabilities privately via GitHub security advisories on this repository rather than public issues.
