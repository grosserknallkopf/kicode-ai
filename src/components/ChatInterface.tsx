"use client";

import { useChat } from "@ai-sdk/react";
import { useRef, useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { CodePreview } from "./CodePreview";

interface CodeFile {
  code: string;
  language: string;
  filename?: string;
}

interface ChatInterfaceProps {
  userId: string;
  userName: string;
}

export function ChatInterface({ userId, userName }: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeCode, setActiveCode] = useState<CodeFile | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [input, setInput] = useState("");

  const { messages, sendMessage, status, error } = useChat({
    onToolCall({ toolCall }) {
      if (
        toolCall.toolName === "executeCode" &&
        toolCall.state === "result"
      ) {
        const result = toolCall.result as any;
        if (result?.code) {
          setActiveCode({
            code: result.code,
            language: result.language || "javascript",
            filename: result.filename,
          });
          setShowPreview(true);
        }
        if (result?.output) {
          console.log("[Sandbox]", result.output);
        }
      }
    },
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput("");
  };

  const handleExtractCode = useCallback((codeStr: string, lang: string) => {
    setActiveCode({ code: codeStr, language: lang });
    setShowPreview(true);
  }, []);

  const getMessageText = (message: any): string => {
    if (!message.parts) return "";
    return message.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("");
  };

  const getToolInvocations = (message: any): any[] => {
    if (!message.parts) return [];
    return message.parts.filter((p: any) => p.type?.startsWith("tool-"));
  };

  return (
    <div className="flex h-full">
      {/* Chat Panel */}
      <div
        className={`flex flex-col h-full ${showPreview ? "w-[55%]" : "w-full"} transition-all duration-300`}
      >
        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
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
                      onClick={() => {
                        sendMessage({ text: suggestion });
                      }}
                      className="text-xs bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground rounded-full px-3 py-1.5 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => {
              const textContent = getMessageText(message);
              const toolInvocations = getToolInvocations(message);

              return (
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
                          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
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
                    {textContent && (
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
                                        In Preview öffnen
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
                          {textContent || "🤔"}
                        </ReactMarkdown>
                      </div>
                    )}

                    {/* Tool Calls */}
                    {toolInvocations.map((part: any, i: number) => {
                      const state = part.state || part.toolInvocation?.state;
                      const toolName = part.toolName || part.toolInvocation?.toolName;
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2 mt-2"
                        >
                          {state === "result" ? (
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
                            🛠️ {toolName || "Tool"}
                            {state === "result"
                              ? " ✓ Erledigt"
                              : " läuft…"}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {message.role === "user" && (
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 text-primary-foreground text-xs font-bold">
                      {userName.charAt(0)}
                    </div>
                  )}
                </div>
              );
            })}

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
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
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
                    onClick={() => {
                      if (messages.length > 0) {
                        const lastMsg = messages[messages.length - 1];
                        const text = getMessageText(lastMsg);
                        if (text) sendMessage({ text });
                      }
                    }}
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
              onChange={(e) => setInput(e.target.value)}
              placeholder="Beschreibe, was du programmieren möchtest…"
              className="flex-1 bg-secondary rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-muted-foreground"
              disabled={status === "submitted"}
            />
            <button
              type="submit"
              disabled={status === "submitted" || !input.trim()}
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
        code={activeCode}
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
      />
    </div>
  );
}
