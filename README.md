# GitGaze

GitGaze is a read-only, CLI-first Git diff viewer for macOS. The app does not stage, commit, switch branches, resolve conflicts, or mutate a repo. It asks Git for a diff and renders it locally.

## Current Dev Usage

```bash
pnpm tauri dev
```

The app currently opens with `HEAD~1` -> `HEAD` and includes temporary ref controls for loading another refs-only comparison.

To test launch args during development:

```bash
pnpm tauri:dev:args --gaze-left HEAD~1 --gaze-right HEAD --gaze-repo "$PWD"
```

Launch refs use explicit `--gaze-left` and `--gaze-right` flags internally so Tauri or cargo dev args are ignored instead of being mistaken for Git refs. `--gaze-repo` tells the app which repository to diff.

## Local CLI Shim

`git-gaze` is being developed as the future Git extension entrypoint. Git discovers executables named `git-<subcommand>` on `PATH`, so the target usage is:

```bash
git gaze <left> <right>
```

For local development, build the native shim:

```bash
cd src-tauri
cargo build --bin git-gaze
```

Then point it at a GitGaze app binary:

```bash
GITGAZE_BIN=/path/to/gitgaze git-gaze HEAD~1 HEAD
```

There is also a local fallback wrapper at `scripts/git-gaze`. It is not installed automatically. If the Rust `git-gaze` binary exists, the script delegates to it; otherwise it falls back to launching the debug GitGaze app binary directly.

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
