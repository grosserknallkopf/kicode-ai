"use client";

import { useSession, signOut } from "next-auth/react";
import { useState } from "react";

export function Navbar() {
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  if (status === "loading") {
    return (
      <nav className="border-b border-border bg-card/50 backdrop-blur-sm h-12 flex items-center px-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary/20 animate-pulse" />
          <div className="w-20 h-4 rounded bg-secondary animate-pulse" />
        </div>
      </nav>
    );
  }

  return (
    <nav className="border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="flex items-center justify-between h-12 px-4">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <svg
              className="w-6 h-6 text-primary"
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
            <span className="font-semibold text-sm tracking-tight">
              KiCode AI
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full hidden sm:inline">
            DeepSeek V4.1 Flash
          </span>
        </div>

        {/* User Menu */}
        {session?.user && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 hover:bg-secondary rounded-lg px-2 py-1 transition-colors"
            >
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt=""
                  className="w-6 h-6 rounded-full"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
                  {session.user.name?.charAt(0) || "?"}
                </div>
              )}
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {session.user.name}
              </span>
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-xl shadow-lg z-20 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-xs font-medium">
                      {session.user.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {session.user.email}
                    </p>
                  </div>
                  <button
                    onClick={() => signOut()}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Abmelden
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
