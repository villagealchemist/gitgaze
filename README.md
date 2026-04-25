# GitGaze

GitGaze is a read-only, CLI-first Git diff viewer for macOS. The app does not stage, commit, switch branches, resolve conflicts, or mutate a repo. It asks Git for a diff and renders it locally.

## Current Dev Usage

```bash
pnpm tauri dev
```

The app currently opens with `HEAD~1` -> `HEAD` and includes temporary ref controls for loading another refs-only comparison.

To test launch args during development:

```bash
pnpm tauri:dev:args --gaze-left HEAD~1 --gaze-right HEAD
```

Launch refs use explicit `--gaze-left` and `--gaze-right` flags internally so Tauri or cargo dev args are ignored instead of being mistaken for Git refs.

There is also a local placeholder Git extension wrapper at `scripts/git-gaze`. It is not installed automatically. If a debug binary exists, the wrapper translates `git gaze <left> <right>` into those explicit launch flags:

```bash
PATH="$PWD/scripts:$PATH" git gaze HEAD~1 HEAD
```

## Target Usage

```bash
git gaze <left> <right>
```

## Current Limitations

- refs only, for example `main HEAD` or `HEAD~1 HEAD`
- no `--staged` support yet
- no `--worktree` support yet
- no repo mutation
- no full installer or packaging flow yet
