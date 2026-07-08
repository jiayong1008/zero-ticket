"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface Message {
  sender: "user" | "assistant" | "system";
  content: string;
  imageData?: string;
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
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isEmbedded, setIsEmbedded] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

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
      
      let isHeading = false;
      let headingLevel = 0;
      if (text.startsWith('#')) {
        const match = text.match(/^(#{1,6})\s+(.*)$/);
        if (match) {
          isHeading = true;
          headingLevel = match[1].length;
          text = match[2];
        }
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
        parts.push(<strong key={matchIdx} className="font-extrabold">{match[1]}</strong>);
        currentIdx = boldRegex.lastIndex;
      }
      
      if (currentIdx < text.length) {
        parts.push(text.substring(currentIdx));
      }

      // Second pass: parse italics in the text segments
      const finalParts: React.ReactNode[] = [];
      parts.forEach((part, pIndex) => {
        if (typeof part !== 'string') {
          finalParts.push(part);
          return;
        }
        
        let currentItalicIdx = 0;
        const italicRegex = /\*(.*?)\*/g;
        let italicMatch;
        
        while ((italicMatch = italicRegex.exec(part)) !== null) {
          const matchIdx = italicMatch.index;
          if (matchIdx > currentItalicIdx) {
            finalParts.push(part.substring(currentItalicIdx, matchIdx));
          }
          finalParts.push(<em key={`${pIndex}-${matchIdx}`} className="italic">{italicMatch[1]}</em>);
          currentItalicIdx = italicRegex.lastIndex;
        }
        
        if (currentItalicIdx < part.length) {
          finalParts.push(part.substring(currentItalicIdx));
        }
      });
      
      if (isHeading) {
        const HeaderTag = `h${headingLevel}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
        const sizeClasses: Record<number, string> = {
          1: "text-lg font-black mt-3 mb-1.5",
          2: "text-base font-bold mt-2 mb-1",
          3: "text-[13px] font-bold mt-1.5 mb-1",
          4: "text-xs font-bold mt-1.5 mb-1",
          5: "text-[11px] font-semibold mt-1 mb-1",
          6: "text-[11px] font-semibold mt-1 mb-1",
        };
        const activeClass = sizeClasses[headingLevel] || "text-[13px] font-bold mt-1.5 mb-1";
        
        return (
          <HeaderTag key={pIdx} className={`${activeClass} leading-tight`}>
            {finalParts}
          </HeaderTag>
        );
      }
      
      if (isBullet) {
        return (
          <div key={pIdx} className="flex items-start gap-1.5 ml-2.5 my-0.5">
            <span className="text-blue-500 mt-1 text-[8px]">•</span>
            <span className="flex-1 leading-relaxed text-[11px]">{finalParts}</span>
          </div>
        );
      }
      
      return (
        <p key={pIdx} className="leading-relaxed mb-1 text-[11px]">
          {finalParts}
        </p>
      );
    });
  };

  useEffect(() => {
    setIsEmbedded(window.self !== window.top);
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
      setIsLightMode(true);
      document.body.classList.add("light");
    } else if (savedTheme === "dark") {
      setIsLightMode(false);
      document.body.classList.remove("light");
    } else {
      // Default to dark mode if nothing is set
      setIsLightMode(false);
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedImage) || loading || !sessionId || !token) return;

    const userText = input;
    const currentImage = selectedImage;
    setInput("");
    setSelectedImage(null);
    setMessages((prev) => [...prev, { sender: "user", content: userText, imageData: currentImage || undefined }]);
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`${BACKEND_URL}/api/chat/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          session_id: sessionId,
          message: userText,
          image_data: currentImage,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to get reply from support agent.");
      }

      const data = await res.json();
      setMessages((prev) => [...prev, { sender: "assistant", content: data.answer }]);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            sender: "system",
            content: "Generation stopped by user.",
          },
        ]);
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          sender: "system",
          content: `Error: ${err.message || "Failed to send message."}`,
        },
      ]);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const widgetUI = (
    <div className={`flex flex-col h-full border rounded-xl overflow-hidden font-sans transition-colors duration-300 shadow-xl ${
      isLightMode ? "bg-white border-slate-200 shadow-slate-200/50" : "bg-[#0b0f19] border-white/10 shadow-black/50"
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
          <div className={`p-3 rounded-lg text-xs leading-relaxed border ${
            isLightMode 
              ? "bg-red-50 border-red-200 text-red-800" 
              : "bg-red-950/40 border-red-500/25 text-red-300"
          }`}>
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
              {msg.imageData && (
                <img 
                  src={msg.imageData} 
                  alt="Attached" 
                  className={`max-h-40 w-auto rounded-lg mb-2 cursor-zoom-in hover:opacity-90 transition-opacity border ${isLightMode ? 'border-slate-200' : 'border-white/10'}`} 
                  onClick={() => setFullScreenImage(msg.imageData || null)}
                />
              )}
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
      <form onSubmit={handleSendMessage} className={`p-3 border-t flex flex-col gap-2 transition-colors duration-300 ${
        isLightMode ? "bg-slate-50 border-slate-200" : "bg-[#0f172a]/20 border-white/5"
      }`}>
        {selectedImage && (
          <div className="relative inline-block self-start z-10 hover:z-50 group">
            <img 
              src={selectedImage} 
              alt="Preview" 
              className="h-16 w-16 object-cover rounded-lg border border-slate-300 transition-transform duration-200 origin-bottom-left group-hover:scale-[4] group-hover:shadow-2xl cursor-zoom-in" 
            />
            <button
              type="button"
              onClick={() => setSelectedImage(null)}
              className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-sm hover:bg-red-600 z-10 opacity-100 group-hover:opacity-0 transition-opacity"
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
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                // Check if form is submittable
                if (input.trim() || selectedImage) {
                  handleSendMessage(e as any);
                }
              }
            }}
            placeholder="Ask a question..."
            rows={1}
            className={`flex-1 px-3 py-2 rounded-lg text-xs transition-colors resize-none overflow-y-auto min-h-[36px] ${
              isLightMode ? "bg-white text-slate-800 border border-slate-300 focus:border-blue-500 outline-none" : "bg-slate-900/60 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            }`}
            disabled={loading || !sessionId}
          />
          {loading ? (
            <button
              type="button"
              onClick={handleStopGeneration}
              className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors shadow-sm flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={(!input.trim() && !selectedImage) || !sessionId}
              className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg transition-colors disabled:opacity-50 shadow-sm flex items-center justify-center"
              title="Send"
            >
              <svg className="w-4 h-4 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          )}
        </div>
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

  if (!isEmbedded) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-300 ${
        isLightMode ? "bg-slate-100" : "bg-slate-900"
      }`}>
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className={`absolute top-4 right-4 p-2.5 rounded-xl transition-all flex items-center justify-center shadow-sm border ${
            isLightMode 
              ? "bg-white hover:bg-slate-50 border-slate-200 text-amber-500" 
              : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-indigo-400"
          }`}
          title="Toggle Light/Dark Mode"
        >
          {isLightMode ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 100 2h1z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
          )}
        </button>

        <div className="w-full max-w-[380px] sm:max-w-[420px] md:max-w-[450px] h-[85vh] max-h-[750px] min-h-[500px] relative">
          <div className={`absolute -top-10 left-0 right-0 text-center text-sm font-semibold tracking-wide ${
            isLightMode ? "text-slate-500" : "text-slate-400"
          }`}>
            Live Widget Preview
          </div>
          {widgetUI}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen max-h-screen w-full">
      {widgetUI}
      {fullScreenImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out p-4 md:p-8"
          onClick={() => setFullScreenImage(null)}
        >
          <img 
            src={fullScreenImage} 
            alt="Fullscreen" 
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" 
          />
        </div>
      )}
    </div>
  );
}

export default function WidgetPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0b0f19] flex items-center justify-center text-white text-xs">Loading Widget Context...</div>}>
      <WidgetChatContent />
    </Suspense>
  );
}
