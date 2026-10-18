"use client";

import { useEffect, useMemo, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { strToU8, zipSync } from "fflate";

export type ProjectFiles = Record<string, string>;

interface CodePreviewProps {
  files: ProjectFiles;
  activeFile: string;
  onSelectFile: (path: string) => void;
  isOpen: boolean;
  onClose: () => void;
  isLive?: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function languageFor(path: string): string {
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "javascript";
  if (path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  return "text";
}

function buildPreviewHtml(files: ProjectFiles): string {
  const entries = Object.entries(files);
  if (entries.length === 0) return "";

  const cssFiles = entries.filter(([path]) => path.endsWith(".css"));
  const jsFiles = entries.filter(
    ([path]) => path.endsWith(".js") || path.endsWith(".mjs")
  );
  const htmlPath =
    "index.html" in files
      ? "index.html"
      : entries.find(([path]) => path.endsWith(".html"))?.[0];

  if (htmlPath) {
    let html = files[htmlPath];

    for (const [path, content] of cssFiles) {
      const linkPattern = new RegExp(
        `<link[^>]*href=["'](?:\\./)?${escapeRegExp(path)}["'][^>]*>`,
        "i"
      );
      const styleTag = `<style>\n${content}\n</style>`;
      if (linkPattern.test(html)) {
        html = html.replace(linkPattern, styleTag);
      } else if (/<\/head>/i.test(html)) {
        html = html.replace(/<\/head>/i, `${styleTag}\n</head>`);
      } else {
        html = `${styleTag}\n${html}`;
      }
    }

    for (const [path, content] of jsFiles) {
      const scriptPattern = new RegExp(
        `<script[^>]*src=["'](?:\\./)?${escapeRegExp(path)}["'][^>]*>\\s*</script>`,
        "i"
      );
      const scriptTag = `<script>\n${content}\n</script>`;
      if (scriptPattern.test(html)) {
        html = html.replace(scriptPattern, scriptTag);
      } else if (/<\/body>/i.test(html)) {
        html = html.replace(/<\/body>/i, `${scriptTag}\n</body>`);
      } else {
        html = `${html}\n${scriptTag}`;
      }
    }

    return html;
  }

  const css = cssFiles.map(([, content]) => content).join("\n");
  const js = jsFiles.map(([, content]) => content).join("\n");
  const python = entries.find(([path]) => path.endsWith(".py"));

  if (js) {
    return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vorschau</title>
  <style>
    body { margin: 0; padding: 20px; font-family: system-ui, sans-serif; background: #0a0a0b; color: #fafafa; }
    ${css}
    #output { white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 14px; line-height: 1.6; }
  </style>
</head>
<body>
  <div id="output"></div>
  <script>
    const output = document.getElementById('output');
    const originalLog = console.log;
    console.log = (...args) => {
      output.textContent += args.map((a) =>
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
      ).join(' ') + '\\n';
      originalLog.apply(console, args);
    };
    window.onerror = (message) => {
      output.textContent += '\\n❌ Fehler: ' + message;
    };
    try {
      ${js}
    } catch (error) {
      output.textContent += '\\n❌ Fehler: ' + error.message;
    }
  </script>
</body>
</html>`;
  }

  if (python) {
    return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Python-Code</title>
  <style>
    body { margin: 0; padding: 20px; font-family: system-ui, sans-serif; background: #0a0a0b; color: #fafafa; }
    pre { background: #1a1a2e; padding: 16px; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <h3>🐍 Python-Code</h3>
  <p style="color:#a1a1aa">Python läuft nicht direkt im Browser – hier siehst du den Code.</p>
  <pre><code>${python[1].replace(/</g, "&lt;")}</code></pre>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Vorschau</title>
  <style>
    body { margin: 0; padding: 20px; font-family: system-ui, sans-serif; background: #0a0a0b; color: #fafafa; }
    ${css}
  </style>
</head>
<body>
  <h3>🎨 Stylesheet</h3>
  <p style="color:#a1a1aa">Für eine echte Vorschau braucht es noch etwas HTML.</p>
</body>
</html>`;
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CodePreview({
  files,
  activeFile,
  onSelectFile,
  isOpen,
  onClose,
  isLive = false,
}: CodePreviewProps) {
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [fullscreen, setFullscreen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [debouncedFiles, setDebouncedFiles] = useState(files);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFiles(files), 350);
    return () => clearTimeout(timer);
  }, [files]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const fileNames = useMemo(() => Object.keys(files).sort(), [files]);
  const current = activeFile && files[activeFile] ? activeFile : fileNames[0];
  const currentCode = current ? files[current] : "";
  const previewHtml = useMemo(
    () => buildPreviewHtml(debouncedFiles),
    [debouncedFiles]
  );

  const downloadCurrent = () => {
    if (!current) return;
    downloadBlob(
      current.split("/").pop() || "code.txt",
      new Blob([currentCode], { type: "text/plain;charset=utf-8" })
    );
  };

  const downloadZip = () => {
    const bundle = zipSync(
      Object.fromEntries(
        Object.entries(files).map(([path, content]) => [path, strToU8(content)])
      )
    );
    downloadBlob(
      "kicode-projekt.zip",
      new Blob([bundle], { type: "application/zip" })
    );
  };

  const openExternal = () => {
    if (!previewHtml) return;
    const url = URL.createObjectURL(new Blob([previewHtml], { type: "text/html" }));
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (!isOpen) return null;

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col bg-background"
          : "w-[45%] min-w-[380px] border-l border-border flex flex-col bg-card/30"
      }
    >
      {/* Kopfzeile */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-card/50">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-medium">Vorschau</h3>
          {isLive && (
            <span className="inline-flex items-center gap-1 text-[10px] text-green-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          )}
          <div className="flex items-center gap-1 ml-1">
            <button
              onClick={() => setViewMode("preview")}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                viewMode === "preview"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-secondary"
              }`}
            >
              Vorschau
            </button>
            <button
              onClick={() => setViewMode("code")}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                viewMode === "code"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-secondary"
              }`}
            >
              Code
            </button>
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setReloadKey((key) => key + 1)}
            title="Vorschau neu laden"
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={openExternal}
            title="In neuem Tab öffnen"
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
          <button
            onClick={() => setFullscreen((value) => !value)}
            title={fullscreen ? "Vollbild beenden" : "Vollbild"}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={fullscreen ? "M9 9L4 4m0 0v5m0-5h5m6 0h5m0 0v5m0-5l-5 5M9 15l-5 5m0 0v-5m0 5h5m6 0h5m0 0v-5m0 5l-5-5" : "M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"} />
            </svg>
          </button>
          <button
            onClick={downloadCurrent}
            title="Aktuelle Datei herunterladen"
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          {fileNames.length > 1 && (
            <button
              onClick={downloadZip}
              title="Ganzes Projekt als ZIP"
              className="px-2 py-1 text-[10px] rounded-md hover:bg-secondary transition-colors"
            >
              ZIP
            </button>
          )}
          <button
            onClick={onClose}
            title="Vorschau schließen"
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Datei-Tabs */}
      {fileNames.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border overflow-x-auto bg-card/20">
          {fileNames.map((path) => (
            <button
              key={path}
              onClick={() => onSelectFile(path)}
              className={`shrink-0 rounded-md px-2 py-1 text-[11px] transition-colors ${
                path === current
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60"
              }`}
            >
              {path}
            </button>
          ))}
        </div>
      )}

      {/* Inhalt */}
      <div className="flex-1 overflow-hidden">
        {fileNames.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            <div className="text-center space-y-2 px-4">
              <svg className="w-8 h-8 mx-auto opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p>
                Sobald KiCode Code schreibt, erscheint hier live die Vorschau.
              </p>
            </div>
          </div>
        ) : viewMode === "preview" ? (
          <iframe
            key={reloadKey}
            className="w-full h-full border-0 bg-white"
            title="Vorschau"
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
            srcDoc={previewHtml}
          />
        ) : (
          <div className="h-full overflow-auto">
            <SyntaxHighlighter
              language={languageFor(current)}
              style={oneDark}
              customStyle={{
                margin: 0,
                padding: "1rem",
                minHeight: "100%",
                fontSize: "13px",
              }}
              showLineNumbers
            >
              {currentCode}
            </SyntaxHighlighter>
          </div>
        )}
      </div>
    </div>
  );
}
