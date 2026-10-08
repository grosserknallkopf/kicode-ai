import { tool } from "ai";
import { z } from "zod";

/**
 * Code-Ausführungs-Tool via Vercel Sandbox
 */
export const executeCode = tool({
  description:
    "Führe HTML-, CSS- oder JavaScript-Code in einer isolierten Sandbox aus. " +
    "Nutze dieses Tool, um Code zu testen und das Ergebnis live anzuzeigen. " +
    "Der Code kann HTML, CSS und JS enthalten.",
  inputSchema: z.object({
    code: z
      .string()
      .describe("Der auszuführende Code (HTML, CSS, JS kombiniert)"),
    language: z
      .enum(["html", "javascript", "typescript", "python"])
      .describe("Die Programmiersprache des Codes"),
    filename: z
      .string()
      .optional()
      .describe("Optionaler Dateiname (z.B. index.html)"),
  }),
  execute: async ({ code, language, filename }) => {
    const sandboxToken = process.env.SANDBOX_API_TOKEN;

    if (sandboxToken) {
      try {
        const response = await fetch("https://api.vercel.com/v2/sandbox/run", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sandboxToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            runtime: language === "python" ? "python3" : "node20",
            files: [
              {
                path: filename || `code.${language === "html" ? "html" : "js"}`,
                content: code,
              },
            ],
            entrypoint:
              language === "html"
                ? undefined
                : filename || `code.js`,
            timeout: 30000,
          }),
        });

        const result = await response.json();
        return {
          success: true,
          output: result.stdout || result.output || "",
          error: result.stderr || "",
          previewUrl: result.url || null,
          sandboxId: result.sandboxId || null,
        };
      } catch (err) {
        return {
          success: false,
          output: "",
          error: `Sandbox-Fehler: ${err instanceof Error ? err.message : String(err)}`,
          previewUrl: null,
        };
      }
    }

    return {
      success: true,
      output: "Code wird im Preview-Panel angezeigt.",
      code,
      language,
      previewUrl: null,
    };
  },
});

/**
 * Web-Suche-Tool
 */
export const searchWeb = tool({
  description:
    "Suche im Internet nach aktuellen Informationen, Dokumentation oder Lösungen.",
  inputSchema: z.object({
    query: z.string().describe("Die Suchanfrage"),
    maxResults: z
      .number()
      .optional()
      .default(3)
      .describe("Maximale Anzahl Ergebnisse"),
  }),
  execute: async ({ query, maxResults }) => {
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (!tavilyKey) {
      return {
        error: "Web-Suche nicht konfiguriert. Bitte TAVILY_API_KEY setzen.",
      };
    }

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: tavilyKey,
        query,
        max_results: maxResults,
        search_depth: "basic",
      }),
    });

    const data = await res.json();
    return {
      results: (data.results || []).map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.content?.slice(0, 300),
      })),
    };
  },
});

/**
 * Datei-System-Tool
 */
export const createFile = tool({
  description:
    "Erstelle eine Datei mit angegebenem Inhalt. Nutze dies für Multi-File-Projekte.",
  inputSchema: z.object({
    path: z.string().describe("Dateipfad (z.B. src/app.js)"),
    content: z.string().describe("Dateiinhalt"),
  }),
  execute: async ({ path, content }) => {
    return {
      success: true,
      path,
      size: content.length,
      message: `Datei '${path}' erstellt (${content.length} Zeichen).`,
    };
  },
});

/** Alle verfügbaren Agent-Tools */
export const agentTools = {
  executeCode,
  searchWeb,
  createFile,
};
