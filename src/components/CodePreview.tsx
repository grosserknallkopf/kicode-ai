"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeFile {
  code: string;
  language: string;
  filename?: string;
}

interface CodePreviewProps {
  code: CodeFile | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CodePreview({ code, isOpen, onClose }: CodePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [error, setError] = useState<string | null>(null);

  const generatePreviewHtml = useCallback((codeStr: string, lang: string) => {
    if (lang === "html") {
      return codeStr;
    }
    if (lang === "javascript" || lang === "typescript") {
      return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KiCode Preview</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: system-ui, sans-serif;
      background: #0a0a0b;
      color: #fafafa;
    }
    #output {
      white-space: pre-wrap;
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div id="output"></div>
  <script>
    const output = document.getElementById('output');
    const originalLog = console.log;
    console.log = (...args) => {
      output.innerHTML += args.map(a =>
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
      ).join(' ') + '\\n';
      originalLog.apply(console, args);
    };
    try {
      ${codeStr}
    } catch(e) {
      output.innerHTML += '\\n❌ Fehler: ' + e.message;
    }
  </script>
</body>
</html>`;
    }
    if (lang === "python") {
      return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Python Code – KiCode</title>
  <style>
    body { margin: 0; padding: 20px; font-family: system-ui; background: #0a0a0b; color: #fafafa; }
    pre { background: #1a1a2e; padding: 16px; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <h3>🐍 Python Code</h3>
  <p style="color:#a1a1aa">Python wird serverseitig ausgeführt. Code:</p>
  <pre><code>${codeStr.replace(/</g, "&lt;")}</code></pre>
  <p style="color:#a1a1aa">💡 Python-Ausführung benötigt Vercel Sandbox (Produktionsmodus).</p>
</body>
</html>`;
    }
    return `<p>Keine Vorschau für ${lang} verfügbar.</p>`;
  }, []);

  useEffect(() => {
    if (!code || !iframeRef.current) return;
    setError(null);
    try {
      const html = generatePreviewHtml(code.code, code.language);
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      iframeRef.current.src = url;
      return () => URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview-Fehler");
    }
  }, [code, generatePreviewHtml]);

  if (!isOpen) return null;

  return (
    <div className="w-[45%] min-w-[400px] border-l border-border flex flex-col bg-card/30">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium">Code Preview</h3>
          {code && (
            <span className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">
              {code.language}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode("preview")}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              viewMode === "preview"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-secondary"
            }`}
          >
            Vorschau
          </button>
          <button
            onClick={() => setViewMode("code")}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              viewMode === "code"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-secondary"
            }`}
          >
            Code
          </button>
          <button
            onClick={onClose}
            className="ml-2 p-1.5 rounded-md hover:bg-secondary transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {!code ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            <div className="text-center space-y-2 px-4">
              <svg
                className="w-8 h-8 mx-auto opacity-50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <p>
                Lass die KI Code generieren – die Vorschau erscheint hier
                automatisch.
              </p>
            </div>
          </div>
        ) : viewMode === "preview" ? (
          error ? (
            <div className="flex items-center justify-center h-full p-4">
              <div className="text-center">
                <p className="text-destructive text-sm mb-2">
                  Preview-Fehler
                </p>
                <p className="text-muted-foreground text-xs">{error}</p>
              </div>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              className="w-full h-full border-0"
              title="Code Preview"
              sandbox="allow-scripts allow-same-origin"
            />
          )
        ) : (
          <div className="h-full overflow-auto">
            <SyntaxHighlighter
              language={code.language}
              style={oneDark}
              customStyle={{
                margin: 0,
                padding: "1rem",
                height: "100%",
                fontSize: "13px",
              }}
              showLineNumbers
            >
              {code.code}
            </SyntaxHighlighter>
          </div>
        )}
      </div>
    </div>
  );
}
