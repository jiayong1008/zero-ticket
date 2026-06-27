"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface Message {
  sender: "user" | "assistant" | "system";
  content: string;
}

function WidgetChatContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  
  const [sessionId, setSessionId] = useState("");
  const [isLightMode, setIsLightMode] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "assistant",
      content: "Hello! How can I help you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const BACKEND_URL = "http://localhost:8088";

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
          <div key={pIdx} className="flex items-start gap-1.5 ml-2.5 my-0.5">
            <span className="text-blue-500 mt-1 text-[8px]">•</span>
            <span className="flex-1 leading-relaxed text-[11px]">{parts}</span>
          </div>
        );
      }
      
      return (
        <p key={pIdx} className="leading-relaxed mb-1 text-[11px]">
          {parts}
        </p>
      );
    });
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
      setIsLightMode(true);
      document.body.classList.add("light");
    } else {
      setIsLightMode(false);
      document.body.classList.remove("light");
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Create session on load if token is available
  useEffect(() => {
    if (!token) {
      setError("Authorization failed: Missing security token. Please contact site administrator.");
      return;
    }

    const initSession = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/chat/session`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Authentication expired or invalid.");
        }
        
        const data = await res.json();
        setSessionId(data.session_id);
      } catch (err: any) {
        setError(err.message || "Failed to initialize support chat session.");
      }
    };

    initSession();
  }, [token]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading || !sessionId || !token) return;

    const userText = input;
    setInput("");
    setMessages((prev) => [...prev, { sender: "user", content: userText }]);
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/chat/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: sessionId,
          message: userText,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to get reply from support agent.");
      }

      const data = await res.json();
      setMessages((prev) => [...prev, { sender: "assistant", content: data.answer }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          sender: "system",
          content: `Error: ${err.message || "Failed to send message."}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex flex-col h-screen max-h-screen border rounded-xl overflow-hidden font-sans transition-colors duration-300 ${
      isLightMode ? "bg-white border-slate-200" : "bg-[#0b0f19] border-white/10"
    }`}>
      {/* Header */}
      <header className={`px-4 py-3 border-b flex items-center justify-between transition-colors duration-300 ${
        isLightMode ? "bg-slate-50 border-slate-200" : "bg-[#0f172a]/80 border-white/5"
      }`}>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className={`text-xs font-bold ${isLightMode ? "text-slate-700" : "text-slate-200"}`}>Customer Support Chat</span>
        </div>
      </header>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {error && (
          <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/25 text-red-300 text-xs leading-relaxed">
            {error}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col ${
              msg.sender === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[85%] rounded-xl p-3 text-xs leading-relaxed transition-all ${
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
          </div>
        ))}
        {loading && (
          <div className={`flex items-center gap-1 text-xs px-3 py-2 rounded-xl rounded-tl-none max-w-[60px] animate-pulse ${
            isLightMode ? "bg-slate-150 border border-slate-200 text-slate-500" : "bg-slate-800 border border-white/5 text-slate-400"
          }`}>
            <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSendMessage} className={`p-3 border-t flex gap-2 transition-colors duration-300 ${
        isLightMode ? "bg-slate-50 border-slate-200" : "bg-[#0f172a]/20 border-white/5"
      }`}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          className={`flex-1 px-3 py-2 rounded-lg text-xs transition-colors ${
            isLightMode ? "bg-white text-slate-800 border border-slate-300 focus:border-blue-500 outline-none" : "bg-slate-900/60 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          }`}
          disabled={loading || !sessionId}
        />
        <button
          type="submit"
          disabled={loading || !input.trim() || !sessionId}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
        >
          Send
        </button>
      </form>
      
      {/* Brand footer */}
      <div className={`py-1 text-center border-t transition-colors duration-300 ${
        isLightMode ? "bg-slate-50 border-slate-200" : "bg-slate-950/40 border-white/5"
      }`}>
        <span className="text-[9px] text-slate-500">
          Powered by <strong className={isLightMode ? "text-slate-700" : "text-slate-400"}>ZeroTicket</strong>
        </span>
      </div>
    </div>
  );
}

export default function WidgetPage() {
  return (
    <Suspense fallback={<div className="p-4 text-xs text-slate-400">Loading support widget...</div>}>
      <WidgetChatContent />
    </Suspense>
  );
}
