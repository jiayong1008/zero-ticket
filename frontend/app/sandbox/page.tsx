"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";

interface Message {
  sender: "user" | "assistant" | "system";
  content: string;
  thoughtLog?: string;
  imageData?: string;
}

const ThoughtLogSection = ({ 
  title, 
  content, 
  isLightMode, 
  defaultExpanded = false,
  previousSectionContent = []
}: { 
  title: string, 
  content: string[], 
  isLightMode: boolean, 
  defaultExpanded?: boolean,
  previousSectionContent?: string[]
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Helper to check if a line is a SQL query line
  const isSqlLine = (line: string) => {
    const l = line.toLowerCase().trim();
    return l.startsWith("select") || l.startsWith("where") || l.startsWith("from") || l.startsWith("join") || l.startsWith("and ") || l.startsWith("order by") || l.startsWith("limit");
  };

  // Helper to render DB Query results as a styled table
  const renderDbResultsTable = (rawText: string) => {
    try {
      // Clean up Python stringified list of dicts
      let jsonSafe = rawText
        .trim()
        .replace(/'/g, '"')
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null');
      
      const parsed = JSON.parse(jsonSafe);
      if (parsed.isArray || (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object')) {
        const headers = Object.keys(parsed[0]);
        return (
          <div className={`overflow-x-auto rounded border my-2 ${isLightMode ? 'border-slate-200 bg-slate-50' : 'border-white/5'}`}>
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className={isLightMode ? "bg-slate-100 border-b border-slate-200" : "bg-slate-900/50 border-b border-white/10"}>
                  {headers.map(h => (
                    <th key={h} className={`p-2 font-semibold uppercase tracking-wider ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${isLightMode ? 'divide-slate-200' : 'divide-white/5'}`}>
                {parsed.map((row: any, idx: number) => (
                  <tr key={idx} className={isLightMode ? "hover:bg-slate-200/50" : "hover:bg-slate-900/20"}>
                    {headers.map(h => (
                      <td key={h} className={`p-2 font-mono ${isLightMode ? 'text-slate-800' : 'text-slate-300'}`}>{String(row[h])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
    } catch (e) {
      // Fallback if not parseable
    }
    return (
      <div className={`p-2 border rounded my-1 font-mono break-words whitespace-pre-wrap ${
        isLightMode 
          ? 'text-slate-700 bg-slate-50 border-slate-200' 
          : 'text-slate-400 bg-slate-950/20 border-white/5'
      }`}>
        {rawText}
      </div>
    );
  };

  // Clean title for mapping
  const lowerTitle = title.toLowerCase();

  // 1. Live Server Logs Section Style
  if (lowerTitle.includes("live logs") || lowerTitle.includes("server logs")) {
    return (
      <div className="mb-4">
        <button 
          onClick={() => setExpanded(!expanded)}
          className={`w-full text-left text-sm font-bold border-b pb-1 flex items-center justify-between transition-colors hover:opacity-80 ${isLightMode ? "text-emerald-700 border-slate-200" : "text-emerald-400 border-white/10"}`}
        >
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            📟 Live Server Logs Scanner
          </span>
          <svg className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {expanded && (
          <div className="mt-3 rounded-lg border border-emerald-500/20 bg-black/90 p-4 font-mono text-[11px] text-emerald-400 shadow-lg overflow-x-auto leading-relaxed max-h-60 overflow-y-auto">
            <div className="text-emerald-500 border-b border-emerald-500/10 pb-1 mb-2 flex items-center justify-between">
              <span>tail -n 100 server.log --secure-filter</span>
              <span className="text-[9px] uppercase bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">Active Isolation</span>
            </div>
            {content.map((line, idx) => (
              <div key={idx} className="hover:bg-emerald-950/20 px-1 py-0.5 rounded transition-colors break-words whitespace-pre-wrap">
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 2. SQL Security Guard Diff Style
  if (lowerTitle.includes("sanitized sql") || lowerTitle.includes("security guard")) {
    const rawSqlDraft = previousSectionContent.join("\n").trim();
    const sanitizedSql = content.join("\n").trim();
    
    return (
      <div className="mb-4">
        <button 
          onClick={() => setExpanded(!expanded)}
          className={`w-full text-left text-sm font-bold border-b pb-1 flex items-center justify-between transition-colors hover:opacity-80 ${isLightMode ? "text-cyan-700 border-slate-200" : "text-cyan-400 border-white/10"}`}
        >
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            🛡️ SQL Security Guard Sanitizer
          </span>
          <svg className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {expanded && (
          <div className="mt-3 space-y-3 font-mono text-[11px]">
            {rawSqlDraft && (
              <div className={`rounded border p-3 ${isLightMode ? 'border-red-200 bg-red-50/50' : 'border-red-500/20 bg-red-950/10'}`}>
                <div className={`font-bold mb-1 flex items-center gap-1 ${isLightMode ? 'text-red-700' : 'text-red-400'}`}>
                  <span>-</span> LLM Raw Drafted SQL (Insecure)
                </div>
                <div className={`pl-3 border-l break-words whitespace-pre-wrap ${isLightMode ? 'border-red-300 text-red-800' : 'border-red-500/20 text-red-300'}`}>
                  {rawSqlDraft}
                </div>
              </div>
            )}
            <div className={`rounded border p-3 ${isLightMode ? 'border-emerald-200 bg-emerald-50/50' : 'border-emerald-500/20 bg-emerald-950/10'}`}>
              <div className={`font-bold mb-1 flex items-center gap-1 ${isLightMode ? 'text-emerald-700' : 'text-emerald-400'}`}>
                <span>+</span> Sanitized Query (Tenant Isolated)
              </div>
              <div className={`pl-3 border-l break-words whitespace-pre-wrap font-semibold ${isLightMode ? 'border-emerald-300 text-emerald-800' : 'border-emerald-500/20 text-emerald-300'}`}>
                {sanitizedSql}
              </div>
              <div className={`mt-2 text-[9.5px] p-1.5 rounded border flex items-center gap-1 ${
                isLightMode 
                  ? 'text-emerald-850 bg-emerald-100/60 border-emerald-200' 
                  : 'text-emerald-500 bg-emerald-950/30 border-emerald-500/10'
              }`}>
                <svg className={`w-3.5 h-3.5 flex-shrink-0 ${isLightMode ? 'text-emerald-650' : 'text-emerald-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Compile-time tenant isolation injected successfully.</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Skip rendering Drafted SQL separately since we group it in the Sanitized SQL diff!
  if (lowerTitle.includes("drafted sql")) {
    return null;
  }

  // 3. Database Execution Results Style
  if (lowerTitle.includes("database query results") || lowerTitle.includes("query results")) {
    const headerLine = title; // e.g. "Database Query Results (Time: 12ms)"
    const execTimeMatch = headerLine.match(/Time:\s*(\w+)/);
    const execTime = execTimeMatch ? execTimeMatch[1] : "N/A";
    
    return (
      <div className="mb-4">
        <button 
          onClick={() => setExpanded(!expanded)}
          className={`w-full text-left text-sm font-bold border-b pb-1 flex items-center justify-between transition-colors hover:opacity-80 ${isLightMode ? "text-indigo-700 border-slate-200" : "text-indigo-400 border-white/10"}`}
        >
          <span className="flex items-center gap-1.5">
            ⚡ Database Query Execution ({execTime})
          </span>
          <svg className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {expanded && (
          <div className="mt-3">
            {renderDbResultsTable(content.join("\n"))}
          </div>
        )}
      </div>
    );
  }

  // 4. Code Snippets / RAG Context Style
  if (lowerTitle.includes("retrieved code")) {
    return (
      <div className="mb-4">
        <button 
          onClick={() => setExpanded(!expanded)}
          className={`w-full text-left text-sm font-bold border-b pb-1 flex items-center justify-between transition-colors hover:opacity-80 ${isLightMode ? "text-amber-700 border-slate-200" : "text-amber-400 border-white/10"}`}
        >
          <span>📁 Retrieved Codebase Rules</span>
          <svg className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {expanded && (
          <div className="mt-3 space-y-2">
            {content.join("\n").split("### File: ").filter(Boolean).map((block, bIdx) => {
              const linesOfBlock = block.trim().split("\n");
              const header = linesOfBlock[0]; // e.g. "PaymentController.php (Lines 10-20)"
              const codeLines = linesOfBlock.slice(1).join("\n").replace(/```/g, "").trim();
              return (
                <div key={bIdx} className={`rounded border overflow-hidden ${isLightMode ? 'border-slate-200 bg-slate-50' : 'border-white/5 bg-slate-900/20'}`}>
                  <div className={`p-2 font-mono text-[10px] border-b ${isLightMode ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-900/50 text-slate-400 border-white/5'} flex items-center justify-between`}>
                    <span>{header.replace(/```/g, "").trim()}</span>
                  </div>
                  <pre className={`p-3 overflow-x-auto text-[10.5px] leading-relaxed font-mono whitespace-pre ${isLightMode ? 'text-slate-800' : 'text-slate-300'}`}>{codeLines}</pre>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // 5. Default Section style
  return (
    <div className="mb-4">
      <button 
        onClick={() => setExpanded(!expanded)}
        className={`w-full text-left text-sm font-bold border-b pb-1 flex items-center justify-between transition-colors hover:opacity-80 ${isLightMode ? "text-blue-600 border-slate-200" : "text-blue-400 border-white/10"}`}
      >
        <span>{title}</span>
        <svg className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {expanded && (
        <div className="mt-3 space-y-1 font-mono text-[11px] leading-relaxed">
          {content.map((line, idx) => {
            if (isSqlLine(line)) {
              return (
                <div key={idx} className={`p-2 rounded border my-1 font-semibold ${isLightMode ? "text-emerald-800 bg-emerald-50 border-emerald-200" : "text-emerald-400 bg-emerald-950/20 border-emerald-500/10"}`}>
                  {line}
                </div>
              );
            }
            if (line.includes("[SQL Execution/Security Error]") || line.includes("Error:") || line.toLowerCase().includes("failed")) {
              return (
                <div key={idx} className={`p-3 rounded border my-1 font-semibold ${isLightMode ? "text-red-800 bg-red-50 border-red-200" : "text-red-400 bg-red-950/20 border-red-500/20"}`}>
                  {line}
                </div>
              );
            }
            return <div key={idx} className="my-0.5">{line}</div>;
          })}
        </div>
      )}
    </div>
  );
};

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

  const DEMO_SCENARIOS = [
    {
      name: "1. ACH Clearing (Alice)",
      query: "Why is my payment pending?",
      userId: "101",
      tenantId: "1",
      customClaims: '{\n  "role": "user",\n  "plan": "premium"\n}',
      loadImage: false,
      desc: "Checks payments DB, finds Alice's ACH payment ($1,500) and references PaymentController.php's 3-day rule."
    },
    {
      name: "2. Tiered Discount (Alice)",
      query: "Why was I charged $900 instead of $1,000 for invoice 10?",
      userId: "101",
      tenantId: "1",
      customClaims: '{\n  "role": "user",\n  "plan": "premium"\n}',
      loadImage: false,
      desc: "Checks DiscountController.php (Premium gets 10% off for invoices >= $1000) and Alice's Invoice 10."
    },
    {
      name: "3. Flat Discount (Bob)",
      query: "Why was I charged $160 instead of $200 for invoice 20?",
      userId: "102",
      tenantId: "2",
      customClaims: '{\n  "role": "user",\n  "plan": "enterprise"\n}',
      loadImage: false,
      desc: "Checks DiscountController.php (Enterprise flat 20% off) and Bob's Invoice 20."
    },
    {
      name: "4. SQL Security Guard",
      query: "Show me all invoices.",
      userId: "101",
      tenantId: "1",
      customClaims: '{\n  "role": "user",\n  "plan": "premium"\n}',
      loadImage: false,
      desc: "Alice queries all invoices. Security Guard rewrites the SQL to force tenant_id=1, completely blocking Bob's Tenant 2 data."
    },
    {
      name: "5. Multimodal OCR (Image)",
      query: "Why is my payment failing?",
      userId: "101",
      tenantId: "1",
      customClaims: '{\n  "role": "user",\n  "plan": "premium"\n}',
      loadImage: true,
      desc: "Loads a mock screenshot of a billing failure. AI extracts 'ERR-ACH-502' via OCR, checks PaymentController.php and gives routing/ACH solutions."
    },
    {
      name: "6. Intent Debugger (Alice)",
      query: "Why did the chatbot classify my intent as cobroke yesterday?",
      userId: "101",
      tenantId: "1",
      customClaims: '{\n  "role": "user",\n  "plan": "premium"\n}',
      loadImage: false,
      desc: "Alice queries a chatbot classification discrepancy. ZeroTicket inspects the live server.log and matches the IntentClassifier trigger rule."
    }
  ];

  const handleSelectScenario = (sc: typeof DEMO_SCENARIOS[0]) => {
    setQuery(sc.query);
    setMockUserId(sc.userId);
    setMockTenantId(sc.tenantId);
    setCustomClaims(sc.customClaims);
    setSelectedImage(null);

    if (sc.loadImage) {
      fetch('/billing_error.png')
        .then(res => res.blob())
        .then(blob => {
          const reader = new FileReader();
          reader.onload = (e) => {
            setSelectedImage(e.target?.result as string);
          };
          reader.readAsDataURL(blob);
        })
        .catch(err => {
          console.error("Failed to load demo image:", err);
        });
    }

    setMessages((prev) => [
      ...prev,
      {
        sender: "system",
        content: `👉 Ready to test **${sc.name}**\n\n**Goal:** ${sc.desc}\n\n*Click "Send" in the chat box to run the simulation.*`
      }
    ]);
  };
  
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
        parts.push(<strong key={matchIdx} className={`font-extrabold`}>{match[1]}</strong>);
        currentIdx = boldRegex.lastIndex;
      }
      
      if (currentIdx < text.length) {
        parts.push(text.substring(currentIdx));
      }
      
      if (isHeading) {
        const HeaderTag = `h${headingLevel}` as keyof JSX.IntrinsicElements;
        const sizeClasses: Record<number, string> = {
          1: "text-xl font-black mt-4 mb-2",
          2: "text-lg font-bold mt-3 mb-1.5",
          3: "text-base font-bold mt-2 mb-1",
          4: "text-sm font-bold mt-2 mb-1",
          5: "text-sm font-semibold mt-1 mb-1",
          6: "text-xs font-semibold mt-1 mb-1",
        };
        const activeClass = sizeClasses[headingLevel] || "text-base font-bold mt-2 mb-1";
        
        return (
          <HeaderTag key={pIdx} className={activeClass}>
            {parts}
          </HeaderTag>
        );
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
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [activeThoughtLog, setActiveThoughtLog] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
    if ((!query.trim() && !selectedImage) || loading) return;

    const userMessage = query;
    const currentImage = selectedImage;
    setQuery("");
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setSelectedImage(null);
    setLastQuery(userMessage);
    setMessages((prev) => [...prev, { sender: "user", content: userMessage, imageData: currentImage }]);
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

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const savedKey = localStorage.getItem("llm_api_key") || localStorage.getItem("gemini_api_key") || "";
      
      const historyPayload = messages
        .filter(m => m.sender === "user" || m.sender === "assistant")
        .slice(-10) // Optimization: Only send the last 10 messages to reduce network payload
        .map(m => ({ role: m.sender, content: m.content }));

      const res = await fetch(`${BACKEND_URL}/api/sandbox/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
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

      if (!res.ok || !res.body) throw new Error("Agent failed to process inquiry.");
      
      // Initialize the assistant message
      setMessages((prev) => [
        ...prev,
        {
          sender: "assistant",
          content: "",
          thoughtLog: "",
        },
      ]);
      setActiveThoughtLog("");

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let answerText = "";
      let thoughtText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        let eventEnd = buffer.indexOf("\n\n");
        while (eventEnd !== -1) {
          const eventString = buffer.substring(0, eventEnd);
          buffer = buffer.substring(eventEnd + 2);
          
          if (eventString.startsWith("data: ")) {
            try {
              const data = JSON.parse(eventString.substring(6));
              if (data.type === "thought") {
                thoughtText += data.content;
                setActiveThoughtLog(thoughtText);
              } else if (data.type === "error") {
                thoughtText += data.content;
                setActiveThoughtLog(thoughtText);
                answerText += "\n\n" + data.content;
              } else if (data.type === "answer") {
                answerText += data.content;
              }
              
              setMessages((prev) => {
                const newMessages = [...prev];
                const lastMsg = { ...newMessages[newMessages.length - 1] };
                lastMsg.content = answerText;
                lastMsg.thoughtLog = thoughtText;
                newMessages[newMessages.length - 1] = lastMsg;
                return newMessages;
              });
            } catch (e) {
              console.error("Failed to parse SSE event:", e);
            }
          }
          eventEnd = buffer.indexOf("\n\n");
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const newMessages = [...prev];
          const lastMsg = { ...newMessages[newMessages.length - 1] };
          if (lastMsg.sender === "assistant") {
            lastMsg.content = lastMsg.content + " _[Generation stopped by user]_";
            newMessages[newMessages.length - 1] = lastMsg;
          } else {
            newMessages.push({
              sender: "system",
              content: "Generation stopped by user.",
            });
          }
          return newMessages;
        });
        return;
      }
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
      abortControllerRef.current = null;
    }
  };

  const handleRetryMessage = async (queryToRetry?: string) => {
    let targetQuery = typeof queryToRetry === 'string' ? queryToRetry : lastQuery;
    if (!targetQuery || !targetQuery.trim()) {
      const lastUserMsg = [...messages].reverse().find(m => m.sender === "user");
      if (lastUserMsg) {
        targetQuery = lastUserMsg.content;
      }
    }

    if (!targetQuery || !targetQuery.trim() || loading) return;

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

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const savedKey = localStorage.getItem("llm_api_key") || localStorage.getItem("gemini_api_key") || "";
      
      let historyPayload = messages
        .filter(m => m.sender === "user" || m.sender === "assistant")
        .map(m => ({ role: m.sender, content: m.content }));
        
      if (historyPayload.length > 0 && historyPayload[historyPayload.length - 1].role === "user" && historyPayload[historyPayload.length - 1].content === targetQuery) {
        historyPayload = historyPayload.slice(0, -1);
      }

      const res = await fetch(`${BACKEND_URL}/api/sandbox/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          company_id: companyId,
          repository_id: repositoryId || undefined,
          query: targetQuery,
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
      abortControllerRef.current = null;
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
            <h2 className={`text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2 transition-colors ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>
              <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Quick Demo Scenarios
            </h2>
            <div className="space-y-2">
              {DEMO_SCENARIOS.map((sc, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectScenario(sc)}
                  className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all flex flex-col gap-1 ${
                    isLightMode 
                      ? "bg-white border-slate-200 hover:border-blue-500 hover:bg-blue-50/30 text-slate-800" 
                      : "bg-[#0f172a]/85 border-white/5 hover:border-blue-500/50 hover:bg-blue-500/5 text-slate-300"
                  }`}
                >
                  <span className="font-semibold text-blue-500">{sc.name}</span>
                  <span className={`text-[10px] leading-normal opacity-75`}>{sc.desc}</span>
                </button>
              ))}
            </div>
          </div>

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
                  {msg.sender === "user" 
                    ? `User (${mockUserId})` 
                    : msg.sender === "system" 
                      ? (msg.content.startsWith("Error:") ? "System Error" : "System Notification") 
                      : "AI Agent"}
                </div>
                
                <div
                  className={`max-w-[85%] rounded-xl p-3.5 text-sm transition-all whitespace-pre-wrap break-words ${
                    msg.sender === "user"
                      ? "bg-blue-600 text-white rounded-tr-none shadow-sm"
                      : msg.sender === "system"
                      ? (isLightMode 
                          ? (msg.content.startsWith("Error:") ? "bg-red-50 border border-red-200 text-red-800" : "bg-amber-50 border border-amber-200 text-amber-900") 
                          : (msg.content.startsWith("Error:") ? "bg-red-950/40 border border-red-500/20 text-red-300" : "bg-yellow-950/20 border border-yellow-500/20 text-yellow-300"))
                      : isLightMode
                      ? "bg-slate-100 border border-slate-200 text-slate-800 rounded-tl-none shadow-sm"
                      : "bg-slate-800 text-slate-100 rounded-tl-none border border-white/5"
                  }`}
                >
                  {msg.imageData && (
                    <img 
                      src={msg.imageData} 
                      alt="Attached" 
                      className={`max-h-48 w-auto rounded-lg mb-3 cursor-zoom-in hover:opacity-90 transition-opacity border ${isLightMode ? 'border-slate-200' : 'border-white/10'}`} 
                      onClick={() => setFullScreenImage(msg.imageData || null)}
                    />
                  )}
                  {msg.sender === "assistant" || msg.sender === "system" ? (
                    msg.content ? (
                      renderFormattedContent(msg.content)
                    ) : (
                      <div className="flex items-center gap-1.5 h-5 px-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    )
                  ) : (
                    msg.content
                  )}
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
                    <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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
                ref={textareaRef}
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
              {loading ? (
                <button
                  type="button"
                  onClick={handleStopGeneration}
                  className="px-5 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-sm transition-all shadow-md flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!query.trim() && !selectedImage}
                  className="p-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-all disabled:opacity-50 shadow-md flex items-center justify-center"
                  title="Send"
                >
                  <svg className="w-5 h-5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                </button>
              )}
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
              <svg className="w-4 h-4 text-blue-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              ZeroTicket Cyber-Security Trace Debugger
            </span>
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-950/50 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              100% Isolated
            </div>
          </div>

          <div className={`flex-1 overflow-y-auto min-h-0 p-5 font-mono text-xs leading-relaxed select-text whitespace-pre-wrap break-all transition-colors ${isLightMode ? "text-slate-700 bg-white" : "text-slate-300"}`}>
            {activeThoughtLog ? (
              (() => {
                const lines = activeThoughtLog.split("\n");
                const sections: { title: string, content: string[] }[] = [];
                let currentSection: { title: string, content: string[] } | null = null;
                
                for (const line of lines) {
                  if (line.startsWith("---") && line.endsWith("---")) {
                    if (currentSection) {
                      sections.push(currentSection);
                    }
                    currentSection = { title: line.replace(/---/g, "").trim(), content: [] };
                  } else {
                    if (currentSection) {
                      currentSection.content.push(line);
                    } else if (line.trim()) {
                      currentSection = { title: "Initialization", content: [line] };
                    }
                  }
                }
                if (currentSection) {
                  sections.push(currentSection);
                }

                // Find the drafted SQL content to pass as previous content for the Diff view
                let draftedSqlContent: string[] = [];
                const draftSec = sections.find(s => s.title.includes("LLM Drafted SQL"));
                if (draftSec) {
                  draftedSqlContent = draftSec.content;
                }

                return sections.map((section, idx) => {
                  const isLongSection = section.title.includes("DB Schema") || section.title.includes("Retrieved Code");
                  return (
                    <ThoughtLogSection 
                      key={idx} 
                      title={section.title} 
                      content={section.content} 
                      isLightMode={isLightMode}
                      defaultExpanded={!isLongSection}
                      previousSectionContent={draftedSqlContent}
                    />
                  );
                });
              })()
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
