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

const defaultLeftRef = "HEAD~1";
const defaultRightRef = "HEAD";

function App() {
    const [session, setSession] = useState(mockSession);
    const [selectedPath, setSelectedPath] = useState(mockSession.files[0]?.path ?? "");
    const [sideBySide, setSideBySide] = useState(true);
    const [leftRef, setLeftRef] = useState(defaultLeftRef);
    const [rightRef, setRightRef] = useState(defaultRightRef);
    const [isLoading, setIsLoading] = useState(false);
    const [hasLoadedRealSession, setHasLoadedRealSession] = useState(false);
    const [loadMessage, setLoadMessage] = useState<string | null>(null);

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

    const loadDiffSession = async (left: string, right: string) => {
        const trimmedLeft = left.trim();
        const trimmedRight = right.trim();

        if (!trimmedLeft || !trimmedRight) {
            setLoadMessage("Both refs are required. Git needs two ends of the rope.");
            return;
        }

        setIsLoading(true);

        try {
            const loadedSession = await invoke<DiffSession>("load_diff_session", {
                left: trimmedLeft,
                right: trimmedRight,
            });

            if (loadedSession.files.length === 0) {
                setLoadMessage(`No changes found for ${trimmedLeft} → ${trimmedRight}.`);
                return;
            }

            setLoadMessage(null);
            setHasLoadedRealSession(true);
            setSession(loadedSession);
            setSelectedPath(loadedSession.files[0].path);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);

            if (!hasLoadedRealSession) {
                setSession(mockSession);
                setSelectedPath(mockSession.files[0]?.path ?? "");
            }

            setLoadMessage(`Real Git data could not be loaded yet: ${message}`);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadDiffSession(defaultLeftRef, defaultRightRef);
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

                {loadMessage ? <p className="load-message">{loadMessage}</p> : null}

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
                <header className="comparison-bar">
                    <form
                        className="comparison-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void loadDiffSession(leftRef, rightRef);
                        }}
                    >
                        <input
                            aria-label="Left ref"
                            value={leftRef}
                            onChange={(event) => setLeftRef(event.target.value)}
                            spellCheck={false}
                        />
                        <span>→</span>
                        <input
                            aria-label="Right ref"
                            value={rightRef}
                            onChange={(event) => setRightRef(event.target.value)}
                            spellCheck={false}
                        />
                        <button type="submit" disabled={isLoading}>
                            {isLoading ? "Loading..." : "Load diff"}
                        </button>
                    </form>

                    <button type="button" onClick={() => setSideBySide((value) => !value)}>
                        Current: {sideBySide ? "Side by side" : "Inline"}
                    </button>
                </header>

                <div className="diff-header">
                    <div>
                        <strong>{selectedFile?.path ?? "No files changed"}</strong>
                        <span>
                            {session.leftLabel} → {session.rightLabel}
                        </span>
                    </div>
                </div>

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
