"use client";

import type { UIMessage } from "ai";
import { useRef, useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { CodePreview, type ProjectFiles } from "./CodePreview";

const TOOL_LABELS: Record<string, string> = {
  executeCode: "Programm ausführen",
  createFile: "Datei anlegen",
  searchWeb: "Im Internet suchen",
};

function filePathForLanguage(language: string): string | null {
  switch (language.toLowerCase()) {
    case "html":
      return "index.html";
    case "css":
      return "style.css";
    case "js":
    case "javascript":
    case "typescript":
    case "ts":
      return "script.js";
    case "python":
    case "py":
      return "main.py";
    default:
      return null;
  }
}

function extractFencedBlocks(
  text: string
): { language: string; code: string }[] {
  const blocks: { language: string; code: string }[] = [];
  const pattern = /```([a-zA-Z0-9+#.-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const language = (match[1] ?? "").toLowerCase();
    const code = (match[2] ?? "").replace(/\n$/, "");
    if (code.trim()) blocks.push({ language, code });
  }
  return blocks;
}

function collectProjectFiles(messages: UIMessage[]): ProjectFiles {
  const files: ProjectFiles = {};

  for (const message of messages) {
    for (const part of message.parts ?? []) {
      const toolPart = part as {
        type: string;
        input?: { path?: string; content?: string };
        output?: { code?: string; language?: string; filename?: string };
      };

      if (toolPart.type === "tool-createFile") {
        const input = toolPart.input;
        if (input?.path && typeof input.content === "string") {
          files[input.path] = input.content;
        }
      }

      if (toolPart.type === "tool-executeCode" && toolPart.output?.code) {
        const language = toolPart.output.language ?? "javascript";
        const path =
          toolPart.output.filename ||
          filePathForLanguage(language) ||
          "script.js";
        files[path] = toolPart.output.code;
      }
    }
  }

  const latestAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");

  if (latestAssistant) {
    const text = (latestAssistant.parts ?? [])
      .filter((part) => part.type === "text")
      .map((part) => (part as { text: string }).text)
      .join("");
    for (const block of extractFencedBlocks(text)) {
      const path = filePathForLanguage(block.language);
      if (path && !files[path]) {
        files[path] = block.code;
      }
    }
  }

  return files;
}

interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
  message_count: number;
}

interface ChatInterfaceProps {
  userId: string;
  userName: string;
}

export function ChatInterface({ userName }: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previewClosedByUser = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [files, setFiles] = useState<ProjectFiles>({});
  const [activeFile, setActiveFile] = useState<string>("");
  const [showPreview, setShowPreview] = useState(false);
  const [isBackgroundRunning, setIsBackgroundRunning] = useState(false);
  const [input, setInput] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [status, setStatus] = useState<"ready" | "submitted" | "streaming">(
    "ready"
  );
  const [error, setError] = useState<{ message: string } | null>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations");
      if (!response.ok) return [];
      const data = (await response.json()) as {
        conversations?: ConversationSummary[];
      };
      const list = data.conversations ?? [];
      setConversations(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
    setIsBackgroundRunning(false);
  }, []);

  const pollConversation = useCallback(
    async function poll(id: string) {
      try {
        const response = await fetch(`/api/conversations/${id}`);
        if (!response.ok) return;
        const data = (await response.json()) as {
          conversation: { id: string; title: string; status?: string };
          messages: UIMessage[];
        };
        if (activeIdRef.current !== id) return;
        setMessages(data.messages ?? []);
        if (data.conversation.status === "streaming") {
          setStatus("streaming");
          setIsBackgroundRunning(true);
          pollTimer.current = setTimeout(() => void poll(id), 900);
        } else {
          setStatus("ready");
          setIsBackgroundRunning(false);
          void refreshConversations();
        }
      } catch {
        if (activeIdRef.current === id) {
          pollTimer.current = setTimeout(() => void poll(id), 4000);
        }
      }
    },
    [refreshConversations, setMessages]
  );

  const loadConversation = useCallback(
    async (id: string) => {
      stopPolling();
      setLoadingConversation(true);
      setSidebarOpen(false);
      try {
        const response = await fetch(`/api/conversations/${id}`);
        if (!response.ok) return;
        const data = (await response.json()) as {
          conversation: { id: string; title: string; status?: string };
          messages: UIMessage[];
        };
        setMessages(data.messages ?? []);
        setActiveConversationId(data.conversation.id);
        activeIdRef.current = data.conversation.id;
        if (data.conversation.status === "streaming") {
          setStatus("streaming");
          setIsBackgroundRunning(true);
          pollTimer.current = setTimeout(
            () => void pollConversation(id),
            800
          );
        } else {
          setStatus("ready");
          setIsBackgroundRunning(false);
        }
      } finally {
        setLoadingConversation(false);
      }
    },
    [pollConversation, setMessages, stopPolling]
  );

  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const list = await refreshConversations();
      const latest = list.find((item) => item.message_count > 0);
      if (latest) {
        await loadConversation(latest.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = collectProjectFiles(messages);
    setFiles(next);
    const names = Object.keys(next);
    if (names.length > 0) {
      setActiveFile((current) =>
        current && next[current]
          ? current
          : next["index.html"]
            ? "index.html"
            : names[0]
      );
      if (!previewClosedByUser.current) {
        setShowPreview(true);
      }
    }
  }, [messages]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value);
  };

  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (activeConversationId) return activeConversationId;
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as {
        conversation: { id: string; title: string };
      };
      setActiveConversationId(data.conversation.id);
      setConversations((current) => [
        {
          id: data.conversation.id,
          title: data.conversation.title,
          updated_at: new Date().toISOString(),
          message_count: 0,
        },
        ...current,
      ]);
      return data.conversation.id;
    } catch {
      return null;
    }
  }, [activeConversationId]);

  const startGeneration = useCallback(
    async (outgoingMessages: UIMessage[], conversationId: string) => {
      setError(null);
      setStatus("submitted");
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: outgoingMessages,
            conversationId,
          }),
        });
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(
            detail || `Die Anfrage ist fehlgeschlagen (${response.status}).`
          );
        }
        setStatus("streaming");
        setIsBackgroundRunning(true);
        if (pollTimer.current) clearTimeout(pollTimer.current);
        pollTimer.current = setTimeout(
          () => void pollConversation(conversationId),
          700
        );
      } catch (caught) {
        setStatus("ready");
        setIsBackgroundRunning(false);
        setError({
          message:
            caught instanceof Error
              ? caught.message
              : "Die Anfrage ist fehlgeschlagen.",
        });
      }
    },
    [pollConversation]
  );

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || status === "submitted" || status === "streaming") return;
      stopPolling();
      const conversationId = await ensureConversation();
      if (!conversationId) return;

      const userMessage = {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text: trimmed }],
      } as UIMessage;
      const outgoing = [...messages, userMessage];
      setMessages(outgoing);
      await startGeneration(outgoing, conversationId);
    },
    [ensureConversation, messages, startGeneration, status, stopPolling]
  );

  const retry = useCallback(async () => {
    if (status !== "ready") return;
    const lastUserIndex = [...messages]
      .map((message) => message.role)
      .lastIndexOf("user");
    if (lastUserIndex < 0) return;

    const conversationId = await ensureConversation();
    if (!conversationId) return;

    const outgoing = messages.slice(0, lastUserIndex + 1);
    setMessages(outgoing);
    await startGeneration(outgoing, conversationId);
  }, [ensureConversation, messages, startGeneration, status]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendText(text);
  };

  const startNewChat = useCallback(() => {
    stopPolling();
    setActiveConversationId(null);
    activeIdRef.current = null;
    setMessages([]);
    setFiles({});
    setActiveFile("");
    setShowPreview(false);
    previewClosedByUser.current = false;
    setSidebarOpen(false);
    setStatus("ready");
    setError(null);
  }, [stopPolling]);

  const removeConversation = useCallback(
    async (id: string) => {
      if (!window.confirm("Diese Aufgabe wirklich löschen?")) return;
      const response = await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) return;
      setConversations((current) => current.filter((item) => item.id !== id));
      if (activeConversationId === id) {
        stopPolling();
        setActiveConversationId(null);
        activeIdRef.current = null;
        setMessages([]);
        setStatus("ready");
        setError(null);
      }
    },
    [activeConversationId, setMessages, stopPolling]
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleExtractCode = useCallback(
    (codeStr: string, lang: string) => {
      const path = filePathForLanguage(lang) ?? "snippet.txt";
      setFiles((current) => ({ ...current, [path]: codeStr }));
      setActiveFile(path);
      previewClosedByUser.current = false;
      setShowPreview(true);
    },
    []
  );

  const openPreview = useCallback(() => {
    previewClosedByUser.current = false;
    setShowPreview(true);
  }, []);

  const closePreview = useCallback(() => {
    previewClosedByUser.current = true;
    setShowPreview(false);
  }, []);

  const activeTitle =
    conversations.find((item) => item.id === activeConversationId)?.title ??
    "Neue Aufgabe";

  return (
    <div className="flex h-full">
      {/* Conversation sidebar */}
      <aside
        className={`${
          sidebarOpen ? "flex" : "hidden"
        } md:flex flex-col w-full md:w-64 shrink-0 border-r border-border bg-card/30`}
      >
        <div className="p-3 border-b border-border">
          <button
            onClick={startNewChat}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            Neue Aufgabe
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <p className="px-2 pt-1 pb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            Verlauf
          </p>
          {conversations.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">
              Noch keine Aufgaben gespeichert.
            </p>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`group flex items-center gap-1 rounded-lg px-2 py-2 text-sm transition-colors ${
                  conversation.id === activeConversationId
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                <button
                  onClick={() => void loadConversation(conversation.id)}
                  className="flex-1 text-left truncate"
                  title={conversation.title}
                >
                  {conversation.title || "Neue Aufgabe"}
                </button>
                <button
                  onClick={() => void removeConversation(conversation.id)}
                  className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded hover:text-destructive transition-opacity"
                  aria-label="Chat löschen"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Chat Panel */}
      <div
        className={`${
          sidebarOpen ? "hidden" : "flex"
        } md:flex flex-col h-full min-w-0 ${
          showPreview ? "w-[55%]" : "w-full"
        } transition-all duration-300`}
      >
        {/* Panel header */}
        <div className="flex items-center gap-2 px-4 h-10 border-b border-border bg-card/30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"
            aria-label="Verlauf öffnen"
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
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <span className="text-xs text-muted-foreground truncate">
            {activeTitle}
          </span>
          {loadingConversation && (
            <span className="text-[10px] text-muted-foreground">lädt …</span>
          )}
          {Object.keys(files).length > 0 && !showPreview && (
            <button
              onClick={openPreview}
              className="ml-auto flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Vorschau
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {isBackgroundRunning && (
              <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                KiCode arbeitet im Hintergrund weiter – du kannst die Seite
                bedenkenlos neu laden.
              </div>
            )}

            {/* Welcome */}
            {messages.length === 0 && (
              <div className="text-center py-12 space-y-4">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10">
                  <svg
                    className="w-10 h-10 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight">
                    Willkommen, {userName}!
                  </h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    Beschreibe, was du programmieren möchtest – die KI schreibt den Code
                    und zeigt dir das Ergebnis live an.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    "Erstelle eine To-Do App mit HTML, CSS und JS",
                    "Schreibe ein Python-Skript für einen Taschenrechner",
                    "Baue eine interaktive Quiz-Seite",
                    "Erstelle einen CSS-only Spinner",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => void sendText(suggestion)}
                      className="text-xs bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground rounded-full px-3 py-1.5 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.role === "assistant" && (
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                    <svg
                      className="w-4 h-4 text-primary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09L9.813 15.904z"
                      />
                    </svg>
                  </div>
                )}

                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-secondary rounded-bl-md"
                  }`}
                >
                  {/* Text content */}
                  {(() => {
                    const textContent = message.parts
                      ?.filter((part) => part.type === "text")
                      .map((part) => (part as { text: string }).text)
                      .join("") ?? "";
                    return textContent ? (
                      <div className="prose prose-sm prose-invert max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeRaw]}
                          components={{
                            code({ className, children, ...props }) {
                              const match = /language-(\w+)/.exec(
                                className || ""
                              );
                              const codeStr = String(children).replace(
                                /\n$/,
                                ""
                              );
                              if (match) {
                                return (
                                  <div className="relative group my-3">
                                    <div className="flex items-center justify-between px-4 py-1.5 bg-secondary rounded-t-lg text-xs text-muted-foreground">
                                      <span>{match[1]}</span>
                                      <button
                                        onClick={() =>
                                          handleExtractCode(
                                            codeStr,
                                            match[1]
                                          )
                                        }
                                        className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary flex items-center gap-1"
                                      >
                                        <svg
                                          className="w-3 h-3"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                          />
                                        </svg>
                                        In Vorschau öffnen
                                      </button>
                                    </div>
                                    <SyntaxHighlighter
                                      style={oneDark}
                                      language={match[1]}
                                      customStyle={{
                                        margin: 0,
                                        borderTopLeftRadius: 0,
                                        borderTopRightRadius: 0,
                                      }}
                                    >
                                      {codeStr}
                                    </SyntaxHighlighter>
                                  </div>
                                );
                              }
                              return (
                                <code
                                  className="bg-secondary px-1.5 py-0.5 rounded text-sm"
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            },
                          }}
                        >
                          {textContent}
                        </ReactMarkdown>
                      </div>
                    ) : null;
                  })()}

                  {/* Tool Calls */}
                  {message.parts?.map((part, i) => {
                    if (part.type.startsWith("tool-")) {
                      const toolPart = part as typeof part & {
                        state: string;
                        toolCallId: string;
                        input?: unknown;
                        output?: unknown;
                        errorText?: string;
                      };
                      const done = toolPart.state === "output-available";
                      const failed = toolPart.state === "output-error";
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2 mt-2"
                        >
                          {done ? (
                            <svg
                              className="w-3.5 h-3.5 text-green-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          ) : failed ? (
                            <svg
                              className="w-3.5 h-3.5 text-destructive"
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
                          ) : (
                            <svg
                              className="w-3.5 h-3.5 animate-spin"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                              />
                            </svg>
                          )}
                          <span>
                            🛠️{" "}
                            {TOOL_LABELS[
                              part.type.replace(/^tool-/, "")
                            ] ?? part.type.replace(/^tool-/, "")}
                            {done
                              ? " · fertig"
                              : failed
                                ? " · Fehler"
                                : " · arbeitet …"}
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>

                {message.role === "user" && (
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 text-primary-foreground text-xs font-bold">
                    {userName.charAt(0)}
                  </div>
                )}
              </div>
            ))}

            {status === "submitted" && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                  <svg
                    className="w-4 h-4 text-primary animate-pulse"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09L9.813 15.904z"
                    />
                  </svg>
                </div>
                <div className="bg-secondary rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-center">
                <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-4 py-3 text-sm max-w-md">
                  <p className="font-medium mb-1">Fehler</p>
                  <p className="text-destructive/80">{error.message}</p>
                  <button
                    onClick={() => void retry()}
                    className="mt-2 text-xs underline hover:no-underline"
                  >
                    Erneut versuchen
                  </button>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-border p-4 bg-card/50 backdrop-blur-sm">
          <form
            onSubmit={handleSubmit}
            className="flex gap-2 max-w-3xl mx-auto"
          >
            <input
              value={input}
              onChange={handleInputChange}
              placeholder="Beschreibe, was du programmieren möchtest…"
              className="flex-1 bg-secondary rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-muted-foreground"
              disabled={status === "submitted" || status === "streaming"}
            />
            <button
              type="submit"
              disabled={status === "submitted" || status === "streaming" || !input.trim()}
              className="bg-primary text-primary-foreground rounded-xl px-5 py-3 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {/* Preview Panel */}
      <CodePreview
        files={files}
        activeFile={activeFile}
        onSelectFile={setActiveFile}
        isOpen={showPreview}
        onClose={closePreview}
        isLive={status === "streaming"}
      />
    </div>
  );
}
