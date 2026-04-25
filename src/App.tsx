import { useEffect, useRef, useState } from "react";
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

type LaunchDiffRequest = {
    left: string;
    right: string;
    repoRoot?: string | null;
};

type DiffLayout = "unified" | "split";

type ViewPreferences = {
    layout: DiffLayout;
    hideWhitespace: boolean;
    compactLineHeight: boolean;
    wordWrap: boolean;
};

const statusLabels: Record<DiffFile["status"], string> = {
    added: "A",
    modified: "M",
    deleted: "D",
    renamed: "R",
};

const statusNames: Record<DiffFile["status"], string> = {
    added: "Added",
    modified: "Modified",
    deleted: "Deleted",
    renamed: "Renamed",
};

const defaultLeftRef = "HEAD~1";
const defaultRightRef = "HEAD";
const viewPreferencesStorageKey = "gitgaze:view-preferences";
const defaultViewPreferences: ViewPreferences = {
    layout: "split",
    hideWhitespace: false,
    compactLineHeight: false,
    wordWrap: true,
};

function isDiffLayout(value: unknown): value is DiffLayout {
    return value === "unified" || value === "split";
}

function isViewPreferences(value: unknown): value is ViewPreferences {
    if (!value || typeof value !== "object") {
        return false;
    }

    const preferences = value as Record<string, unknown>;

    return (
        isDiffLayout(preferences.layout) &&
        typeof preferences.hideWhitespace === "boolean" &&
        typeof preferences.compactLineHeight === "boolean" &&
        typeof preferences.wordWrap === "boolean"
    );
}

function loadStoredViewPreferences(): ViewPreferences {
    if (typeof window === "undefined") {
        return defaultViewPreferences;
    }

    try {
        const storedPreferences = window.localStorage.getItem(viewPreferencesStorageKey);

        if (!storedPreferences) {
            return defaultViewPreferences;
        }

        const parsedPreferences = JSON.parse(storedPreferences);

        return isViewPreferences(parsedPreferences)
            ? parsedPreferences
            : defaultViewPreferences;
    } catch {
        return defaultViewPreferences;
    }
}

function getPathParts(path: string) {
    const parts = path.split("/");
    const basename = parts[parts.length - 1] ?? path;
    const parentPath = parts.slice(0, -1).join("/");

    return { basename, parentPath };
}

function getRepoDisplay(repoRoot: string | null) {
    if (!repoRoot) {
        return {
            name: "Current working repo",
            path: null,
            title: "Current working repo",
        };
    }

    const parts = repoRoot.split("/").filter(Boolean);
    const name = parts[parts.length - 1] ?? repoRoot;
    const parentParts = parts.slice(0, -1);
    const shortenedParent =
        parentParts.length > 2
            ? `.../${parentParts.slice(-2).join("/")}`
            : parentParts.length > 0
              ? `/${parentParts.join("/")}`
              : repoRoot;

    return {
        name,
        path: `${shortenedParent}/${name}`,
        title: repoRoot,
    };
}

function getFileCountLabel(count: number) {
    return `${count} ${count === 1 ? "file" : "files"} changed`;
}

function App() {
    const [session, setSession] = useState<DiffSession | null>(null);
    const [selectedPath, setSelectedPath] = useState("");
    const [viewPreferences, setViewPreferences] = useState(loadStoredViewPreferences);
    const [isViewSettingsOpen, setIsViewSettingsOpen] = useState(false);
    const [leftRef, setLeftRef] = useState(defaultLeftRef);
    const [rightRef, setRightRef] = useState(defaultRightRef);
    const [repoRoot, setRepoRoot] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [hasLoadedRealSession, setHasLoadedRealSession] = useState(false);
    const [loadMessage, setLoadMessage] = useState<string | null>(null);
    const viewSettingsRef = useRef<HTMLDivElement>(null);

    const selectedFile =
        session?.files.find((file) => file.path === selectedPath) ?? session?.files[0];
    const repoDisplay = getRepoDisplay(repoRoot ?? session?.repoRoot ?? null);
    const hasVisibleSession = session !== null && session.files.length > 0;
    const emptyPanelTitle =
        loadMessage ??
        (isLoading
            ? "Loading diff..."
            : "No diff loaded yet. Pick two refs and load the spell.");
    const emptyPanelDetail = hasLoadedRealSession
        ? "The last successful diff stays visible when a later load fails."
        : "GitGaze will show real Git data here once a comparison loads.";

    const editorOptions: DiffEditorProps["options"] = {
        readOnly: true,
        diffCodeLens: false,
        ignoreTrimWhitespace: viewPreferences.hideWhitespace,
        lineHeight: viewPreferences.compactLineHeight ? 17 : 21,
        minimap: { enabled: false },
        fontSize: 13,
        wordWrap: viewPreferences.wordWrap ? "on" : "off",
        scrollBeyondLastLine: false,
        renderSideBySide: viewPreferences.layout === "split",
        useInlineViewWhenSpaceIsLimited: false,
    };

    const setLayout = (layout: DiffLayout) => {
        setViewPreferences((currentPreferences) => ({
            ...currentPreferences,
            layout,
        }));
    };

    const togglePreference = (
        preference: Exclude<keyof ViewPreferences, "layout">,
    ) => {
        setViewPreferences((currentPreferences) => ({
            ...currentPreferences,
            [preference]: !currentPreferences[preference],
        }));
    };

    const loadDiffSession = async (
        left: string,
        right: string,
        targetRepoRoot: string | null,
    ) => {
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
                repoRoot: targetRepoRoot,
            });

            setRepoRoot(loadedSession.repoRoot);

            if (loadedSession.files.length === 0) {
                setLoadMessage(`No changes found for ${trimmedLeft} → ${trimmedRight}.`);
                return;
            }

            setLoadMessage(null);
            setHasLoadedRealSession(true);
            setSession(loadedSession);
            setRepoRoot(loadedSession.repoRoot);
            setSelectedPath((currentPath) =>
                loadedSession.files.some((file) => file.path === currentPath)
                    ? currentPath
                    : loadedSession.files[0].path,
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);

            setLoadMessage(`Real Git data could not be loaded yet: ${message}`);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const loadStartupDiff = async () => {
            try {
                const launchRequest = await invoke<LaunchDiffRequest | null>(
                    "get_launch_diff_request",
                );

                if (launchRequest) {
                    const launchRepoRoot = launchRequest.repoRoot ?? null;

                    setLeftRef(launchRequest.left);
                    setRightRef(launchRequest.right);
                    setRepoRoot(launchRepoRoot);
                    await loadDiffSession(
                        launchRequest.left,
                        launchRequest.right,
                        launchRepoRoot,
                    );
                    return;
                }
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                setLoadMessage(`Launch refs could not be read: ${message}`);
            }

            await loadDiffSession(defaultLeftRef, defaultRightRef, null);
        };

        void loadStartupDiff();
    }, []);

    useEffect(() => {
        window.localStorage.setItem(
            viewPreferencesStorageKey,
            JSON.stringify(viewPreferences),
        );
    }, [viewPreferences]);

    useEffect(() => {
        if (!isViewSettingsOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsViewSettingsOpen(false);
            }
        };

        const handlePointerDown = (event: PointerEvent) => {
            if (
                event.target instanceof Node &&
                !viewSettingsRef.current?.contains(event.target)
            ) {
                setIsViewSettingsOpen(false);
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        document.addEventListener("pointerdown", handlePointerDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("pointerdown", handlePointerDown);
        };
    }, [isViewSettingsOpen]);

    return (
        <main className="app-shell">
            <aside className="file-sidebar">
                <div className="brand">
                    <span className="brand-mark">◐</span>
                    <div>
                        <h1>GitGaze</h1>
                        <p>local PR-style diff viewer</p>
                        <div className="repo-card" title={repoDisplay.title}>
                            <span className="repo-label">Repo</span>
                            <strong>{repoDisplay.name}</strong>
                            {repoDisplay.path ? <span>{repoDisplay.path}</span> : null}
                        </div>
                    </div>
                </div>

                {loadMessage ? <p className="load-message">{loadMessage}</p> : null}

                <div className="file-summary">
                    {session ? getFileCountLabel(session.files.length) : "No files loaded"}
                </div>

                <div className="file-list">
                    {session?.files.map((file) => {
                        const { basename, parentPath } = getPathParts(file.path);

                        return (
                            <button
                                key={file.path}
                                className={`file-row ${file.path === selectedFile?.path ? "active" : ""}`}
                                onClick={() => setSelectedPath(file.path)}
                                title={file.path}
                            >
                                <span className={`status ${file.status}`}>
                                    {statusLabels[file.status]}
                                </span>
                                <span className="file-path">
                                    {parentPath ? (
                                        <span className="file-parent">{parentPath}/</span>
                                    ) : null}
                                    <span className="file-name">{basename}</span>
                                    {file.oldPath ? (
                                        <span
                                            className="file-old-path"
                                            title={file.oldPath}
                                        >
                                            from {file.oldPath}
                                        </span>
                                    ) : null}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </aside>

            <section className="diff-panel">
                <header className="comparison-bar">
                    <form
                        className="comparison-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void loadDiffSession(leftRef, rightRef, repoRoot);
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

                    <div className="view-settings" ref={viewSettingsRef}>
                        <button
                            type="button"
                            className="view-settings-button"
                            aria-haspopup="menu"
                            aria-expanded={isViewSettingsOpen}
                            onClick={() => setIsViewSettingsOpen((value) => !value)}
                        >
                            View settings
                        </button>

                        {isViewSettingsOpen ? (
                            <div className="view-settings-menu" role="menu">
                                <div className="view-settings-section">Layout</div>
                                <button
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={viewPreferences.layout === "unified"}
                                    className="view-settings-row"
                                    onClick={() => setLayout("unified")}
                                >
                                    <span className="view-settings-check">
                                        {viewPreferences.layout === "unified" ? "✓" : ""}
                                    </span>
                                    Unified
                                </button>
                                <button
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={viewPreferences.layout === "split"}
                                    className="view-settings-row"
                                    onClick={() => setLayout("split")}
                                >
                                    <span className="view-settings-check">
                                        {viewPreferences.layout === "split" ? "✓" : ""}
                                    </span>
                                    Split
                                </button>

                                <div className="view-settings-divider" />
                                <div className="view-settings-section">Options</div>
                                <button
                                    type="button"
                                    role="menuitemcheckbox"
                                    aria-checked={viewPreferences.hideWhitespace}
                                    className="view-settings-row"
                                    onClick={() => togglePreference("hideWhitespace")}
                                >
                                    <span className="view-settings-check">
                                        {viewPreferences.hideWhitespace ? "✓" : ""}
                                    </span>
                                    Hide whitespace
                                </button>
                                <button
                                    type="button"
                                    role="menuitemcheckbox"
                                    aria-checked={viewPreferences.compactLineHeight}
                                    className="view-settings-row"
                                    onClick={() => togglePreference("compactLineHeight")}
                                >
                                    <span className="view-settings-check">
                                        {viewPreferences.compactLineHeight ? "✓" : ""}
                                    </span>
                                    Compact line height
                                </button>
                                <button
                                    type="button"
                                    role="menuitemcheckbox"
                                    aria-checked={viewPreferences.wordWrap}
                                    className="view-settings-row"
                                    onClick={() => togglePreference("wordWrap")}
                                >
                                    <span className="view-settings-check">
                                        {viewPreferences.wordWrap ? "✓" : ""}
                                    </span>
                                    Word wrap
                                </button>
                            </div>
                        ) : null}
                    </div>
                </header>

                <div className="diff-header">
                    {selectedFile && session ? (
                        <div className="selected-file-meta">
                            <strong>{selectedFile.path}</strong>
                            <span className={`status-pill ${selectedFile.status}`}>
                                {statusNames[selectedFile.status]}
                            </span>
                            <span>
                                {session.leftLabel} → {session.rightLabel}
                            </span>
                        </div>
                    ) : (
                        <div className="selected-file-meta">
                            <strong>No file selected</strong>
                            <span>{leftRef} → {rightRef}</span>
                        </div>
                    )}
                </div>

                {hasVisibleSession && selectedFile ? (
                    <DiffEditor
                        key={viewPreferences.layout}
                        original={selectedFile.leftText ?? ""}
                        modified={selectedFile.rightText ?? ""}
                        language={selectedFile.language ?? "plaintext"}
                        theme="vs-dark"
                        options={editorOptions}
                    />
                ) : (
                    <div className="empty-diff-panel">
                        <div>
                            <strong>{emptyPanelTitle}</strong>
                            <p>{emptyPanelDetail}</p>
                        </div>
                    </div>
                )}
            </section>
        </main>
    );
}

export default App;
