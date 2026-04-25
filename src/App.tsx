import { useEffect, useState } from "react";
import { DiffEditor, type DiffEditorProps } from "@monaco-editor/react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

type DiffSession = {
    repoRoot: string;
    leftLabel: string;
    rightLabel: string;
    files: DiffFile[];
};

type DiffFile = {
    path: string;
    oldPath?: string | null;
    status: "added" | "modified" | "deleted" | "renamed";
    language?: string | null;
    leftText: string | null;
    rightText: string | null;
};

const mockSession: DiffSession = {
    repoRoot: "mock",
    leftLabel: "main",
    rightLabel: "HEAD",
    files: [
        {
            path: "apps/marketplace-web/src/example.tsx",
            status: "modified",
            language: "typescript",
            leftText: `export const greet = (name: string) => {
  return "Hello, " + name;
};
`,
            rightText: `export const greet = (name: string) => {
  return \`Hello, \${name} ✨\`;
};
`,
        },
    ],
};

const statusLabels: Record<DiffFile["status"], string> = {
    added: "A",
    modified: "M",
    deleted: "D",
    renamed: "R",
};

function App() {
    const [session, setSession] = useState(mockSession);
    const [selectedPath, setSelectedPath] = useState(mockSession.files[0]?.path ?? "");
    const [sideBySide, setSideBySide] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const selectedFile =
        session.files.find((file) => file.path === selectedPath) ?? session.files[0];

    const editorOptions: DiffEditorProps["options"] = {
        readOnly: true,
        diffCodeLens: false,
        minimap: { enabled: false },
        fontSize: 13,
        wordWrap: "on",
        scrollBeyondLastLine: false,
        renderSideBySide: sideBySide,
        useInlineViewWhenSpaceIsLimited: false,
    };

    useEffect(() => {
        invoke<DiffSession>("load_diff_session", {
            left: "main",
            right: "HEAD",
        })
            .then((loadedSession) => {
                if (loadedSession.files.length === 0) {
                    setLoadError("No main..HEAD changes found yet; showing mock diff.");
                    setSession(mockSession);
                    setSelectedPath(mockSession.files[0]?.path ?? "");
                    return;
                }

                setLoadError(null);
                setSession(loadedSession);
                setSelectedPath(loadedSession.files[0].path);
            })
            .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);

                setLoadError(`Real Git data could not be loaded yet: ${message}`);
                setSession(mockSession);
                setSelectedPath(mockSession.files[0]?.path ?? "");
            });
    }, []);

    return (
        <main className="app-shell">
            <aside className="file-sidebar">
                <div className="brand">
                    <span className="brand-mark">◐</span>
                    <div>
                        <h1>GitGaze</h1>
                        <p>local PR-style diff viewer</p>
                    </div>
                </div>

                {loadError ? <p className="load-error">{loadError}</p> : null}

                <div className="file-list">
                    {session.files.map((file) => (
                        <button
                            key={file.path}
                            className={`file-row ${file.path === selectedFile?.path ? "active" : ""}`}
                            onClick={() => setSelectedPath(file.path)}
                        >
                            <span className={`status ${file.status}`}>
                                {statusLabels[file.status]}
                            </span>
                            <span>{file.path}</span>
                        </button>
                    ))}
                </div>
            </aside>

            <section className="diff-panel">
                <header className="diff-header">
                    <div>
                        <strong>{selectedFile?.path ?? "No files changed"}</strong>
                        <span>
                            {session.leftLabel} → {session.rightLabel}
                        </span>
                    </div>

                    <button onClick={() => setSideBySide((value) => !value)}>
                        Current: {sideBySide ? "Side by side" : "Inline"}
                    </button>
                </header>

                <DiffEditor
                    key={sideBySide ? "side-by-side" : "inline"}
                    original={selectedFile?.leftText ?? ""}
                    modified={selectedFile?.rightText ?? ""}
                    language={selectedFile?.language ?? "plaintext"}
                    theme="vs-dark"
                    options={editorOptions}
                />
            </section>
        </main>
    );
}

export default App;
// gitgaze smoke test
