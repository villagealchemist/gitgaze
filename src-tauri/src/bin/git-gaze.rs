use std::env;
use std::path::PathBuf;
use std::process::{Command, ExitCode};

const USAGE: &str = "Usage: git gaze <left> <right>";

#[derive(Debug, PartialEq, Eq)]
struct DiffRefs {
    left: String,
    right: String,
}

#[derive(Debug, PartialEq, Eq)]
enum CliError {
    MissingRefs,
    TooManyArgs,
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("{message}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), String> {
    let args = env::args().skip(1).collect::<Vec<_>>();
    let refs = parse_refs(&args).map_err(format_usage_error)?;
    let repo_root = resolve_repo_root()?;
    let app_binary = resolve_app_binary()?;
    let app_args = build_app_args(&refs, &repo_root);

    Command::new(&app_binary)
        .args(app_args)
        .spawn()
        .map_err(|error| {
            format!(
                "Failed to launch GitGaze at {}: {error}",
                app_binary.display()
            )
        })?;

    Ok(())
}

fn parse_refs(args: &[String]) -> Result<DiffRefs, CliError> {
    match args {
        [left, right] => Ok(DiffRefs {
            left: left.to_string(),
            right: right.to_string(),
        }),
        [] | [_] => Err(CliError::MissingRefs),
        _ => Err(CliError::TooManyArgs),
    }
}

fn format_usage_error(error: CliError) -> String {
    match error {
        CliError::MissingRefs => USAGE.to_string(),
        CliError::TooManyArgs => format!("{USAGE}\nUnexpected extra arguments."),
    }
}

fn resolve_repo_root() -> Result<String, String> {
    let output = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .map_err(|error| format!("Failed to run git: {error}"))?;

    if !output.status.success() {
        return Err("git gaze must be run inside a Git repository.".to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn resolve_app_binary() -> Result<PathBuf, String> {
    if let Ok(path) = env::var("GITGAZE_BIN") {
        let app_binary = PathBuf::from(path);

        if app_binary.is_file() {
            return Ok(app_binary);
        }

        return Err(format!(
            "GITGAZE_BIN points to a missing file: {}",
            app_binary.display()
        ));
    }

    let current_exe = env::current_exe()
        .map_err(|error| format!("Could not locate the git-gaze executable: {error}"))?;
    let debug_binary = current_exe
        .parent()
        .ok_or_else(|| "Could not locate the git-gaze executable directory.".to_string())?
        .join("gitgaze");

    if debug_binary.is_file() {
        return Ok(debug_binary);
    }

    Err(format!(
        "GitGaze app binary was not found.\n\nBuild it first with:\n  pnpm tauri build --debug\n\nOr point to it with:\n  GITGAZE_BIN=/path/to/gitgaze git-gaze HEAD~1 HEAD\n\nLooked for:\n  {}",
        debug_binary.display()
    ))
}

fn build_app_args(refs: &DiffRefs, repo_root: &str) -> Vec<String> {
    vec![
        "--gaze-left".to_string(),
        refs.left.clone(),
        "--gaze-right".to_string(),
        refs.right.clone(),
        "--gaze-repo".to_string(),
        repo_root.to_string(),
    ]
}

#[cfg(test)]
mod tests {
    use super::{build_app_args, parse_refs, CliError, DiffRefs};

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn parses_two_positional_refs() {
        let refs = parse_refs(&args(&["HEAD~1", "HEAD"])).expect("refs");

        assert_eq!(
            refs,
            DiffRefs {
                left: "HEAD~1".to_string(),
                right: "HEAD".to_string(),
            }
        );
    }

    #[test]
    fn rejects_missing_args() {
        assert_eq!(parse_refs(&args(&[])), Err(CliError::MissingRefs));
        assert_eq!(parse_refs(&args(&["HEAD"])), Err(CliError::MissingRefs));
    }

    #[test]
    fn rejects_extra_args() {
        assert_eq!(
            parse_refs(&args(&["HEAD~1", "HEAD", "--surprise"])),
            Err(CliError::TooManyArgs)
        );
    }

    #[test]
    fn builds_explicit_app_args() {
        let refs = DiffRefs {
            left: "main".to_string(),
            right: "HEAD".to_string(),
        };

        assert_eq!(
            build_app_args(&refs, "/tmp/repo"),
            vec![
                "--gaze-left",
                "main",
                "--gaze-right",
                "HEAD",
                "--gaze-repo",
                "/tmp/repo",
            ]
        );
    }
}
