# Devcontainer — running coding agents in this repo

A single container (Ubuntu + Node + Playwright browsers) with `opencode`,
`git`, and the GitHub CLI baked in. It runs as the `pwuser` user and mounts the
repo at `/workspaces/soitax`. Soitax needs no backing services, so there's just
the one container.

## Prerequisites

- Docker (Desktop or engine) running on the host.
- The [Dev Containers CLI](https://github.com/devcontainers/cli):
  `npm install -g @devcontainers/cli`
- Optional: export any of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GH_TOKEN` in
  your shell before starting — they're passed through to the container.

## Bring it up

From the repo root on the host:

```bash
# Build the image and start the container (first run pulls the Playwright base
# image and installs test deps; later runs are fast).
devcontainer up --workspace-folder .
```

## Run a command inside it

```bash
# General form.
devcontainer exec --workspace-folder . <command>

# Examples:
devcontainer exec --workspace-folder . opencode --version
devcontainer exec --workspace-folder . npm test          # full suite
devcontainer exec --workspace-folder . npm run test:one flash
```

## Open an interactive shell

```bash
devcontainer exec --workspace-folder . bash
```

Inside that shell you have the normal repo commands:

```bash
npm test                 # full behaviour/model suite
npm run test:one flash   # a single suite
npm run serve            # http://localhost:8099 (port is forwarded to the host)
opencode                 # start the agent
```

## Start an agent

```bash
# Interactive TUI:
devcontainer exec --workspace-folder . opencode

# One-shot, non-interactive prompt:
devcontainer exec --workspace-folder . opencode run "run the test suite and summarise failures"
```

On first use you'll be prompted to authenticate opencode. That auth lives in a
named volume (`opencode_data`), so you only log in once — it survives rebuilds.

## Playwright

The base image is `mcr.microsoft.com/playwright` — all browsers and their
system libraries are already installed, so browser-based tests need no extra
setup. Point them at the dev server:

```bash
devcontainer exec --workspace-folder . bash -lc "npm run serve & sleep 1 && npx playwright --version"
```

## Rebuild after changing the container

```bash
devcontainer up --workspace-folder . --remove-existing-container
```

The repo tree and your opencode login persist across rebuilds; only the image
and container are recreated.

## Notes

- `opencode`'s config lives at `.devcontainer/opencode/` (bind-mounted, holds no
  credentials). Edit it from the host and it takes effect in the container.
- Test `node_modules` and opencode state live in named volumes, kept out of the
  host tree so the two environments don't fight over native binaries.
- VS Code users can skip the CLI: "Dev Containers: Reopen in Container".
