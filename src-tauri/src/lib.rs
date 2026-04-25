use std::process::Command;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DiffSession {
    repo_root: String,
    left_label: String,
    right_label: String,
    files: Vec<DiffFile>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DiffFile {
    path: String,
    old_path: Option<String>,
    status: DiffStatus,
    language: Option<String>,
    left_text: Option<String>,
    right_text: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "lowercase")]
enum DiffStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
}

#[tauri::command]
fn load_diff_session(left: String, right: String) -> Result<DiffSession, String> {
    let repo_root = run_git(["rev-parse", "--show-toplevel"], None)?
        .trim()
        .to_string();

    let name_status = run_git(["diff", "--name-status", &left, &right], Some(&repo_root))?;
    let mut files = Vec::new();

    for line in name_status.lines().filter(|line| !line.trim().is_empty()) {
        let diff_file = parse_name_status_line(line, &left, &right, &repo_root)?;
        files.push(diff_file);
    }

    Ok(DiffSession {
        repo_root,
        left_label: left,
        right_label: right,
        files,
    })
}

fn parse_name_status_line(
    line: &str,
    left: &str,
    right: &str,
    repo_root: &str,
) -> Result<DiffFile, String> {
    let parts = line.split('\t').collect::<Vec<_>>();
    let status_code = parts
        .first()
        .ok_or_else(|| format!("Could not parse git diff status line: {line}"))?;

    match status_code.chars().next() {
        Some('A') => {
            let path = read_path(&parts, 1, line)?;

            Ok(DiffFile {
                path: path.to_string(),
                old_path: None,
                status: DiffStatus::Added,
                language: infer_language(path),
                left_text: None,
                right_text: git_show(right, path, repo_root),
            })
        }
        Some('M') => {
            let path = read_path(&parts, 1, line)?;

            Ok(DiffFile {
                path: path.to_string(),
                old_path: None,
                status: DiffStatus::Modified,
                language: infer_language(path),
                left_text: git_show(left, path, repo_root),
                right_text: git_show(right, path, repo_root),
            })
        }
        Some('D') => {
            let path = read_path(&parts, 1, line)?;

            Ok(DiffFile {
                path: path.to_string(),
                old_path: None,
                status: DiffStatus::Deleted,
                language: infer_language(path),
                left_text: git_show(left, path, repo_root),
                right_text: None,
            })
        }
        Some('R') => {
            let old_path = read_path(&parts, 1, line)?;
            let path = read_path(&parts, 2, line)?;

            Ok(DiffFile {
                path: path.to_string(),
                old_path: Some(old_path.to_string()),
                status: DiffStatus::Renamed,
                language: infer_language(path),
                left_text: git_show(left, old_path, repo_root),
                right_text: git_show(right, path, repo_root),
            })
        }
        _ => Err(format!("Unsupported git diff status line: {line}")),
    }
}

fn read_path<'a>(parts: &'a [&str], index: usize, line: &str) -> Result<&'a str, String> {
    parts
        .get(index)
        .copied()
        .filter(|path| !path.is_empty())
        .ok_or_else(|| format!("Could not parse path from git diff status line: {line}"))
}

fn git_show(revision: &str, path: &str, repo_root: &str) -> Option<String> {
    let object = format!("{revision}:{path}");

    run_git(["show", &object], Some(repo_root)).ok()
}

fn run_git<const N: usize>(args: [&str; N], cwd: Option<&str>) -> Result<String, String> {
    let mut command = Command::new("git");
    command.args(args);

    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }

    let output = command
        .output()
        .map_err(|error| format!("Failed to run git: {error}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(stderr.trim().to_string())
    }
}

fn infer_language(path: &str) -> Option<String> {
    let extension = path.rsplit('.').next()?;
    let language = match extension {
        "ts" | "tsx" => "typescript",
        "js" | "jsx" => "javascript",
        "rs" => "rust",
        "css" => "css",
        "scss" => "scss",
        "json" => "json",
        "md" => "markdown",
        _ => "plaintext",
    };

    Some(language.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![load_diff_session])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
