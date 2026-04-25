import { useState } from "react";
import { DiffEditor, type DiffEditorProps } from "@monaco-editor/react";
import "./App.css";

type DiffFile = {
    path: string;
    status: "added" | "modified" | "deleted" | "renamed";
    leftText: string | null;
    rightText: string | null;
    language?: string;
};

const mockFiles: DiffFile[] = [
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
];

function App() {
    const [selectedFile, setSelectedFile] = useState(mockFiles[0]);
    const [sideBySide, setSideBySide] = useState(true);

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

                <div className="file-list">
                    {mockFiles.map((file) => (
                        <button
                            key={file.path}
                            className="file-row active"
                            onClick={() => setSelectedFile(file)}
                        >
                            <span className={`status ${file.status}`}>M</span>
                            <span>{file.path}</span>
                        </button>
                    ))}
                </div>
            </aside>

            <section className="diff-panel">
                <header className="diff-header">
                    <div>
                        <strong>{selectedFile.path}</strong>
                        <span>{selectedFile.status}</span>
                    </div>

                    <button onClick={() => setSideBySide((value) => !value)}>
                        Current: {sideBySide ? "Side by side" : "Inline"}
                    </button>
                </header>

                <DiffEditor
                    key={sideBySide ? "side-by-side" : "inline"}
                    original={selectedFile.leftText ?? ""}
                    modified={selectedFile.rightText ?? ""}
                    language={selectedFile.language ?? "typescript"}
                    theme="vs-dark"
                    options={editorOptions}
                />
            </section>
        </main>
    );
}

export default App;
