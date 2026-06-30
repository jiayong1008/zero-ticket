"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";

interface Message {
  sender: "user" | "assistant" | "system";
  content: string;
  thoughtLog?: string;
}

export default function SandboxPage() {
  const router = useRouter();
  const [companyId, setCompanyId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [llmProvider, setLlmProvider] = useState("gemini");
  const [llmModel, setLlmModel] = useState("");
  
  // Theme state
  const [isLightMode, setIsLightMode] = useState(false);
  
  // Mock claims for the JWT
  const [mockUserId, setMockUserId] = useState("852");
  const [mockTenantId, setMockTenantId] = useState("1");
  const [customClaims, setCustomClaims] = useState('{\n  "role": "user",\n  "plan": "premium"\n}');
  
  // Chat state
  const [query, setQuery] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  
  // Load messages from sessionStorage on mount
  useEffect(() => {
    const savedMessages = sessionStorage.getItem("sandbox_messages");
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch (e) {
        // Fallback
        setMessages([{ sender: "assistant", content: "Hello! I am ZeroTicket, connected to your codebase and database replica. Ask me any support question to test my logic retrieval and SQL security guard." }]);
      }
    } else {
      setMessages([{ sender: "assistant", content: "Hello! I am ZeroTicket, connected to your codebase and database replica. Ask me any support question to test my logic retrieval and SQL security guard." }]);
    }
  }, []);

  // Save messages to sessionStorage when they change
  useEffect(() => {
    if (messages.length > 0) {
      sessionStorage.setItem("sandbox_messages", JSON.stringify(messages));
    }
  }, [messages]);

  // Markdown format helper
  const renderFormattedContent = (content: string) => {
    const paragraphs = content.split('\n');
    
    return paragraphs.map((paragraph, pIdx) => {
      let text = paragraph.trim();
      if (!text) {
        return <div key={pIdx} className="h-2" />;
      }
      
      const isBullet = text.startsWith('* ') || text.startsWith('- ') || text.startsWith('• ');
      if (isBullet) {
        text = text.substring(2);
      }
      
      const parts = [];
      let currentIdx = 0;
      const boldRegex = /\*\*(.*?)\*\*/g;
      let match;
      
      while ((match = boldRegex.exec(text)) !== null) {
        const matchIdx = match.index;
        if (matchIdx > currentIdx) {
          parts.push(text.substring(currentIdx, matchIdx));
        }
        parts.push(<strong key={matchIdx} className={`font-extrabold ${isLightMode ? "text-slate-900" : "text-white"}`}>{match[1]}</strong>);
        currentIdx = boldRegex.lastIndex;
      }
      
      if (currentIdx < text.length) {
        parts.push(text.substring(currentIdx));
      }
      
      if (isBullet) {
        return (
          <div key={pIdx} className="flex items-start gap-2 ml-3 my-1">
            <span className="text-blue-500 mt-1.5 text-[8px]">•</span>
            <span className="flex-1 leading-relaxed text-xs sm:text-sm">{parts}</span>
          </div>
        );
      }
      
      return (
        <p key={pIdx} className="leading-relaxed mb-1.5 text-xs sm:text-sm">
          {parts}
        </p>
      );
    });
  };
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeThoughtLog, setActiveThoughtLog] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const BACKEND_URL = "http://localhost:8088";

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
      setIsLightMode(true);
      document.body.classList.add("light");
    } else {
      setIsLightMode(false);
      document.body.classList.remove("light");
    }

    const savedId = localStorage.getItem("company_id");
    const savedName = localStorage.getItem("company_name");
    if (!savedId) {
      router.push("/onboarding");
    } else {
      setCompanyId(savedId);
      setCompanyName(savedName || "Default Company");
      setRepositoryId(localStorage.getItem("repository_id") || "");
      setLlmProvider(localStorage.getItem("llm_provider") || "gemini");
      setLlmModel(localStorage.getItem("llm_model") || "");
    }
  }, [router]);

  const toggleTheme = () => {
    const nextTheme = !isLightMode;
    setIsLightMode(nextTheme);
    localStorage.setItem("theme", nextTheme ? "light" : "dark");
    if (nextTheme) {
      document.body.classList.add("light");
    } else {
      document.body.classList.remove("light");
    }
  };

  useEffect(() => {
    // Scroll chat to bottom when messages update
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleImageFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setError("Image exceeds 5MB limit.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) handleImageFile(file);
        break;
      }
    }
  };
  const handleResetSession = () => {
    const initialMsg: Message[] = [{ 
      sender: "assistant", 
      content: "Hello! I am ZeroTicket, connected to your codebase and database replica. Ask me any support question to test my logic retrieval and SQL security guard." 
    }];
    setMessages(initialMsg);
    sessionStorage.setItem("sandbox_messages", JSON.stringify(initialMsg));
    setActiveThoughtLog("");
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    const userMessage = query;
    const currentImage = selectedImage;
    setQuery("");
    setSelectedImage(null);
    setLastQuery(userMessage);
    setMessages((prev) => [...prev, { sender: "user", content: userMessage }]);
    setLoading(true);
    setError("");

    // Prepare claims
    let parsedClaims = {};
    try {
      parsedClaims = JSON.parse(customClaims);
    } catch (e) {
      setError("Failed to parse Custom Claims JSON. Please verify syntax.");
      setLoading(false);
      return;
    }

    const mergedClaims = {
      user_id: mockUserId,
      tenant_id: mockTenantId,
      company_id: companyId,
      ...parsedClaims,
    };

    try {
      const savedKey = localStorage.getItem("llm_api_key") || localStorage.getItem("gemini_api_key") || "";
      
      const historyPayload = messages
        .filter(m => m.sender === "user" || m.sender === "assistant")
        .slice(-10) // Optimization: Only send the last 10 messages to reduce network payload
        .map(m => ({ role: m.sender, content: m.content }));

      const res = await fetch(`${BACKEND_URL}/api/sandbox/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          repository_id: repositoryId || undefined,
          query: userMessage,
          mock_claims: mergedClaims,
          llm_provider: llmProvider || "gemini",
          llm_model: llmModel || undefined,
          api_key: savedKey,
          chat_history: historyPayload.length > 0 ? historyPayload : undefined,
          image_data: currentImage,
        }),
      });

      if (!res.ok) throw new Error("Agent failed to process inquiry.");
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          sender: "assistant",
          content: data.answer,
          thoughtLog: data.thought_log,
        },
      ]);
      
      // Automatically select the latest thought log for review
      setActiveThoughtLog(data.thought_log);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setMessages((prev) => [
        ...prev,
        {
          sender: "system",
          content: `Error: ${err.message || "Failed to communicate with execution agent engine."}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleRetryMessage = async (queryToRetry: string) => {
    if (!queryToRetry.trim() || loading) return;

    setLoading(true);
    setError("");
    
    // Clear last error bubble for clean flow
    setMessages((prev) => {
      if (prev.length > 0 && (prev[prev.length - 1].sender === "system" || prev[prev.length - 1].content.startsWith("Error:"))) {
        return prev.slice(0, -1);
      }
      return prev;
    });

    let parsedClaims = {};
    try {
      parsedClaims = JSON.parse(customClaims);
    } catch (e) {
      setError("Failed to parse Custom Claims JSON. Please verify syntax.");
      setLoading(false);
      return;
    }

    const mergedClaims = {
      user_id: mockUserId,
      tenant_id: mockTenantId,
      company_id: companyId,
      ...parsedClaims,
    };

    try {
      const savedKey = localStorage.getItem("llm_api_key") || localStorage.getItem("gemini_api_key") || "";
      
      let historyPayload = messages
        .filter(m => m.sender === "user" || m.sender === "assistant")
        .map(m => ({ role: m.sender, content: m.content }));
        
      if (historyPayload.length > 0 && historyPayload[historyPayload.length - 1].role === "user" && historyPayload[historyPayload.length - 1].content === queryToRetry) {
        historyPayload = historyPayload.slice(0, -1);
      }

      const res = await fetch(`${BACKEND_URL}/api/sandbox/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          repository_id: repositoryId || undefined,
          query: queryToRetry,
          mock_claims: mergedClaims,
          llm_provider: llmProvider || "gemini",
          llm_model: llmModel || undefined,
          api_key: savedKey,
          chat_history: historyPayload.length > 0 ? historyPayload : undefined,
        }),
      });

      if (!res.ok) throw new Error("Agent failed to process inquiry.");
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          sender: "assistant",
          content: data.answer,
          thoughtLog: data.thought_log,
        },
      ]);
      
      setActiveThoughtLog(data.thought_log);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setMessages((prev) => [
        ...prev,
        {
          sender: "system",
          content: `Error: ${err.message || "Failed to communicate with execution agent engine."}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`w-full flex flex-col h-[100dvh] min-h-0 overflow-hidden transition-colors duration-300 ${isLightMode ? "bg-slate-100" : "bg-[#0b0f19]"}`}>
      {/* Navigation Top bar */}
      <header className={`h-16 border-b px-6 flex items-center justify-between transition-colors duration-300 backdrop-blur-md ${isLightMode ? "bg-white/80 border-slate-200" : "bg-[#0f172a]/50 border-white/10"}`}>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push("/")}
            className={`p-2 rounded-lg transition-colors ${isLightMode ? "hover:bg-slate-200 text-slate-500 hover:text-slate-800" : "hover:bg-white/5 text-slate-400 hover:text-white"}`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h1 className={`text-sm font-bold transition-colors ${isLightMode ? "text-slate-800" : "text-white"}`}>AI Sandbox Emulator</h1>
            <p className={`text-xs transition-colors ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>Testing context for {companyName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold ${
              isLightMode 
                ? "bg-slate-200 hover:bg-slate-300 text-slate-700 shadow-sm" 
                : "bg-white/5 hover:bg-white/10 text-slate-300"
            }`}
          >
            {isLightMode ? (
              <>
                <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 100 2h1z" clipRule="evenodd" />
                </svg>
                Light Theme
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
                Dark Theme
              </>
            )}
          </button>
          <div className={`text-xs px-3 py-1.5 rounded-full font-mono transition-colors ${
            isLightMode 
              ? "bg-blue-50 text-blue-600 border border-blue-200" 
              : "bg-blue-500/10 border border-blue-500/20 text-blue-400"
          }`}>
            Company ID: {companyId.substring(0, 8)}...
          </div>
        </div>
      </header>

      {/* Main Sandbox Workspace */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left Side: Mock JWT / Claims Controls (Fixed Width) */}
        <aside className={`w-[25%] min-w-[250px] max-w-[320px] border-r h-full p-5 overflow-y-auto space-y-6 flex flex-col transition-colors duration-300 min-h-0 ${isLightMode ? "bg-slate-50 border-slate-200" : "bg-[#0f172a]/30 border-white/10"}`}>
          <div>
            <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2 transition-colors ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>
              <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              JWT Claims Context
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className={`block text-xs mb-1.5 transition-colors ${isLightMode ? "text-slate-600 font-semibold" : "text-slate-400"}`}>mock_user_id</label>
                <input
                  type="text"
                  value={mockUserId}
                  onChange={(e) => setMockUserId(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-lg transition-colors ${
                    isLightMode ? "bg-white text-slate-800 border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" : "glass-input"
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs mb-1.5 transition-colors ${isLightMode ? "text-slate-600 font-semibold" : "text-slate-400"}`}>mock_tenant_id</label>
                <input
                  type="text"
                  value={mockTenantId}
                  onChange={(e) => setMockTenantId(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-lg transition-colors ${
                    isLightMode ? "bg-white text-slate-800 border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" : "glass-input"
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs mb-1.5 transition-colors ${isLightMode ? "text-slate-600 font-semibold" : "text-slate-400"}`}>Custom Claims (JSON)</label>
                <textarea
                  value={customClaims}
                  onChange={(e) => setCustomClaims(e.target.value)}
                  rows={6}
                  className={`w-full px-3 py-2 text-xs rounded-lg font-mono transition-colors ${
                    isLightMode ? "bg-white text-slate-800 border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" : "glass-input"
                  }`}
                />
              </div>
            </div>
          </div>
          
          <div className={`p-4 rounded-lg text-[11px] leading-relaxed transition-colors ${
            isLightMode 
              ? "bg-amber-50 border border-amber-200 text-amber-800" 
              : "bg-yellow-950/20 border border-yellow-500/20 text-yellow-300/80"
          }`}>
            <strong>Security Rule:</strong> The guard will automatically wrap all SQL queries with subqueries based on the claims set above if corresponding columns exist (e.g. <code className={isLightMode ? "bg-amber-100/80 text-amber-950 px-1 py-0.5 rounded" : ""}>user_id</code> or <code className={isLightMode ? "bg-amber-100/80 text-amber-950 px-1 py-0.5 rounded" : ""}>tenant_id</code>).
          </div>
        </aside>

        {/* Resizable Center and Right */}
        <PanelGroup id="sandbox-layout" orientation="horizontal" className="flex-1 overflow-hidden min-h-0">
          {/* Center: Live Chat Sandbox Widget */}
          <Panel id="panel-chat" defaultSize={45} minSize={30}>
            <section className={`h-full flex flex-col relative min-w-0 transition-colors duration-300 min-h-0 ${isLightMode ? "bg-white" : "bg-[#0b0f19]"}`}>
          <div className={`p-4 border-b flex items-center justify-between transition-colors duration-300 ${isLightMode ? "border-slate-200 bg-slate-50/50" : "border-white/5 bg-slate-900/10"}`}>
            <span className={`text-xs font-semibold ${isLightMode ? "text-slate-700" : "text-slate-300"}`}>Widget Chat Simulator</span>
            <div className="flex items-center gap-3">
              {loading && (
                <span className="text-xs text-blue-500 flex items-center gap-1.5 animate-pulse">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                  AI is thinking...
                </span>
              )}
              <button
                onClick={handleResetSession}
                className={`text-[10px] px-2 py-1 rounded border transition-colors flex items-center gap-1 font-semibold ${
                  isLightMode
                    ? "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-red-500"
                    : "bg-[#0f172a] border-white/10 text-slate-400 hover:bg-white/5 hover:text-red-400"
                }`}
                title="Clear chat and restart session"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset Chat
              </button>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex flex-col ${
                  msg.sender === "user" ? "items-end" : "items-start"
                }`}
              >
                <div className="text-[10px] text-slate-500 mb-1 capitalize">
                  {msg.sender === "user" ? `User (${mockUserId})` : msg.sender === "system" ? "System Error" : "AI Agent"}
                </div>
                
                <div
                  className={`max-w-[85%] rounded-xl p-3.5 text-sm transition-all whitespace-pre-wrap break-words ${
                    msg.sender === "user"
                      ? "bg-blue-600 text-white rounded-tr-none shadow-sm"
                      : msg.sender === "system"
                      ? "bg-red-950/40 border border-red-500/20 text-red-300"
                      : isLightMode
                      ? "bg-slate-100 border border-slate-200 text-slate-800 rounded-tl-none shadow-sm"
                      : "bg-slate-800 text-slate-100 rounded-tl-none border border-white/5"
                  }`}
                >
                  {msg.sender === "assistant" ? renderFormattedContent(msg.content) : msg.content}
                </div>

                {msg.thoughtLog && (
                  <button
                    onClick={() => setActiveThoughtLog(msg.thoughtLog || "")}
                    className="mt-1.5 text-xs text-blue-500 hover:text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Inspect Engine Thoughts
                  </button>
                )}

                {(msg.sender === "system" || msg.content.startsWith("Error:")) && i === messages.length - 1 && (
                  <button
                    onClick={() => handleRetryMessage(lastQuery)}
                    disabled={loading}
                    className="mt-1.5 text-xs text-red-500 hover:text-red-650 hover:underline flex items-center gap-1.5 font-semibold disabled:opacity-50"
                  >
                    <svg className="w-3.5 h-3.5 animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.28 15H18" />
                    </svg>
                    Retry Query
                  </button>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Form */}
          {error && (
            <div className="mx-4 p-3 rounded bg-red-950/20 border border-red-500/20 text-red-400 text-xs">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSendMessage} className={`p-4 border-t flex flex-col gap-2 transition-colors duration-300 ${isLightMode ? "bg-slate-50 border-slate-200" : "bg-[#0f172a]/20 border-white/5"}`}>
            {selectedImage && (
              <div className="relative inline-block self-start">
                <img src={selectedImage} alt="Preview" className="h-16 w-16 object-cover rounded-lg border border-slate-300" />
                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-sm hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            )}
            <div className="flex gap-2 w-full">
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleImageFile(e.target.files[0]);
                  }
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 text-slate-500 hover:text-blue-500 transition-colors"
                title="Attach Image"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>
              <textarea
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (query.trim() || selectedImage) {
                      handleSendMessage(e as any);
                    }
                  }
                }}
                placeholder="e.g. Why is my checkout payment still pending?"
                rows={1}
                className={`flex-1 px-4 py-3 rounded-lg text-sm transition-colors resize-none overflow-y-auto min-h-[44px] ${
                  isLightMode ? "bg-white text-slate-800 border border-slate-300 focus:border-blue-500 outline-none" : "glass-input"
                }`}
                required
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || (!query.trim() && !selectedImage)}
                className="px-5 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-all disabled:opacity-50 shadow-md"
              >
                Send
              </button>
            </div>
          </form>
        </section>
        </Panel>
        
        <PanelResizeHandle id="handle-2" className={`z-10 relative w-2 transition-colors hover:bg-blue-500/50 active:bg-blue-500 cursor-col-resize flex items-center justify-center ${isLightMode ? "bg-slate-200" : "bg-white/10"}`}>
          <div className={`h-8 w-0.5 rounded-full ${isLightMode ? "bg-slate-400" : "bg-slate-600"}`} />
        </PanelResizeHandle>

        {/* Right Side: Developer Console / Thought logs (2/5 space) */}
        <Panel id="panel-inspector" defaultSize={40} minSize={25}>
          <section className={`h-full flex flex-col min-w-0 overflow-hidden transition-colors duration-300 min-h-0 ${isLightMode ? "bg-slate-50" : "bg-[#0b1329]"}`}>
          <div className={`p-4 border-b flex items-center justify-between transition-colors duration-300 ${isLightMode ? "border-slate-200 bg-slate-100" : "border-white/5 bg-slate-900/10"}`}>
            <span className={`text-xs font-semibold flex items-center gap-1.5 ${isLightMode ? "text-slate-700" : "text-slate-300"}`}>
              <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              AI Engine Thoughts & SQL Inspector
            </span>
          </div>

          <div className={`flex-1 overflow-y-auto min-h-0 p-5 font-mono text-xs leading-relaxed select-text whitespace-pre-wrap break-all transition-colors ${isLightMode ? "text-slate-700 bg-white" : "text-slate-300"}`}>
            {activeThoughtLog ? (
              // Format thought logs nicely
              activeThoughtLog.split("\n").map((line, idx) => {
                if (line.startsWith("---") && line.endsWith("---")) {
                  return (
                    <div key={idx} className={`text-sm font-bold border-b pb-1 mt-6 mb-3 flex items-center ${isLightMode ? "text-blue-600 border-slate-200" : "text-blue-400 border-white/5"}`}>
                      {line.replace(/---/g, "").trim()}
                    </div>
                  );
                }
                if (line.toLowerCase().startsWith("select") || line.toLowerCase().startsWith("where") || line.toLowerCase().startsWith("from")) {
                  return (
                    <div key={idx} className={`p-2 rounded border my-1 font-semibold ${isLightMode ? "text-emerald-800 bg-emerald-50 border-emerald-200" : "text-emerald-400 bg-emerald-950/20 border-emerald-500/10"}`}>
                      {line}
                    </div>
                  );
                }
                if (line.includes("[SQL Execution/Security Error]")) {
                  return (
                    <div key={idx} className={`p-3 rounded border my-1 font-semibold ${isLightMode ? "text-red-800 bg-red-50 border-red-200" : "text-red-400 bg-red-950/20 border-red-500/20"}`}>
                      {line}
                    </div>
                  );
                }
                return <div key={idx} className="my-0.5">{line}</div>;
              })
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center px-4">
                <svg className="w-12 h-12 mb-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                <p className="text-slate-400 text-xs">Send a message in the simulator or click "Inspect Engine Thoughts" to view the execution trace here.</p>
              </div>
            )}
          </div>
        </section>
        </Panel>
      </PanelGroup>
      </div>
    </div>
  );
}
