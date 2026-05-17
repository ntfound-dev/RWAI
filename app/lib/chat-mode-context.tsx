"use client";
import { createContext, useContext, useState, useCallback } from "react";

export type ChatMode = "split" | "bridge" | "jarvis";

interface ChatModeCtx {
  mode: ChatMode;
  setMode: (m: ChatMode) => void;
  showBridge: boolean;
  openBridge: () => void;
  closeBridge: () => void;
  jarvisOpen: boolean;
  toggleJarvis: () => void;
  closeJarvis: () => void;
}

const ChatModeContext = createContext<ChatModeCtx>({
  mode: "split",
  setMode: () => {},
  showBridge: false,
  openBridge: () => {},
  closeBridge: () => {},
  jarvisOpen: false,
  toggleJarvis: () => {},
  closeJarvis: () => {},
});

export function ChatModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode]           = useState<ChatMode>("split");
  const [showBridge, setShowBridge] = useState(false);
  const [jarvisOpen, setJarvisOpen] = useState(false);

  const openBridge   = useCallback(() => setShowBridge(true),   []);
  const closeBridge  = useCallback(() => setShowBridge(false),  []);
  const toggleJarvis = useCallback(() => setJarvisOpen(v => !v), []);
  const closeJarvis  = useCallback(() => setJarvisOpen(false),  []);

  return (
    <ChatModeContext.Provider value={{ mode, setMode, showBridge, openBridge, closeBridge, jarvisOpen, toggleJarvis, closeJarvis }}>
      {children}
    </ChatModeContext.Provider>
  );
}

export const useChatMode = () => useContext(ChatModeContext);
