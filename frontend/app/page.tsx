"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  
  // Settings state
  const [companyName, setCompanyName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [repoBranch, setRepoBranch] = useState("");
  const [dbHost, setDbHost] = useState("");
  const [dbName, setDbName] = useState("");
  const [dbType, setDbType] = useState("");
  const [llmProvider, setLlmProvider] = useState("gemini");

  // Multi-project state
  type Project = { 
    id: string; 
    name: string; 
    repo_path: string; 
    branch: string; 
    sync_status: string; 
    db_type?: string; 
    chunks_total?: number;
    chunks_indexed?: number;
    sync_message?: string;
  };
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeRepoId, setActiveRepoId] = useState("");
  const [projectDropOpen, setProjectDropOpen] = useState(false);
  
  const [syncStatus, setSyncStatus] = useState("linked");
  const [syncing, setSyncing] = useState(false);
  const [chunksTotal, setChunksTotal] = useState(0);
  const [chunksIndexed, setChunksIndexed] = useState(0);
  const [syncMessage, setSyncMessage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLightMode, setIsLightMode] = useState(false);

  const BACKEND_URL = "http://localhost:8088";

  useEffect(() => {
    setMounted(true);
    const savedCompanyId = localStorage.getItem("company_id");
    const repoLinked = localStorage.getItem("repo_linked");
    const savedTheme = localStorage.getItem("theme");

    if (savedTheme === "light") {
      setIsLightMode(true);
      document.body.classList.add("light");
    } else {
      setIsLightMode(false);
      document.body.classList.remove("light");
    }

    if (!savedCompanyId || repoLinked !== "true") {
      router.push("/onboarding");
    } else {
      setCompanyId(savedCompanyId);
      setCompanyName(localStorage.getItem("company_name") || "Developer Account");
      setApiKey(localStorage.getItem("api_key") || "zt_secret_key");
      setRepoPath(localStorage.getItem("repo_path") || "");
      setRepoBranch(localStorage.getItem("repo_branch") || "main");
      setDbHost(localStorage.getItem("db_host") || "");
      setDbName(localStorage.getItem("db_name") || "");
      setDbType(localStorage.getItem("db_type") || "mysql");
      setLlmProvider(localStorage.getItem("llm_provider") || "gemini");
      const savedRepoId = localStorage.getItem("repository_id") || "";
      setActiveRepoId(savedRepoId);

      // Fetch all projects for this company
      fetch(`http://localhost:8088/api/company/projects?company_id=${savedCompanyId}`)
        .then((r) => r.json())
        .then((data: any[]) => {
          if (Array.isArray(data)) {
            const mapped = data.map((p) => ({
              id: p.repository_id,
              name: p.project_name || p.repo_path?.split("/").pop() || "Unnamed",
              repo_path: p.repo_path,
              branch: p.branch,
              sync_status: p.sync_status,
              db_type: p.db_type,
              chunks_total: p.chunks_total,
              chunks_indexed: p.chunks_indexed,
              sync_message: p.sync_message,
            }));
            setProjects(mapped);
          }
        })
        .catch(() => {});
    }
  }, [router]);

  // Update active repository details when activeRepoId or projects list changes
  useEffect(() => {
    if (!activeRepoId || projects.length === 0) return;
    const active = projects.find((p) => p.id === activeRepoId);
    if (active) {
      setSyncStatus(active.sync_status);
      setChunksTotal(active.chunks_total || 0);
      setChunksIndexed(active.chunks_indexed || 0);
      setSyncMessage(active.sync_message || "");
      if (active.sync_status === "cloning" || active.sync_status === "parsing") {
        setSyncing(true);
      } else {
        setSyncing(false);
      }
    }
  }, [activeRepoId, projects]);

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

  const handleSyncCodebase = async () => {
    setSyncing(true);
    setError("");
    setSuccess("");
    setSyncStatus("cloning");

    try {
      const savedKey = localStorage.getItem("llm_api_key") || localStorage.getItem("gemini_api_key") || "";
      const provider = localStorage.getItem("llm_provider") || "gemini";
      const res = await fetch(`${BACKEND_URL}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          repository_id: activeRepoId || undefined,
          llm_provider: provider,
          api_key: savedKey,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || "Failed to initiate codebase synchronization.");
      }
    } catch (err: any) {
      setSyncStatus("failed");
      setError(err.message || "An error occurred during synchronization.");
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!syncing || !companyId || !activeRepoId) return;

    const interval = setInterval(() => {
      fetch(`${BACKEND_URL}/api/company/projects?company_id=${companyId}`)
        .then((r) => r.json())
        .then((data: any[]) => {
          if (Array.isArray(data)) {
            setProjects(data.map((p) => ({
              id: p.repository_id,
              name: p.project_name || p.repo_path?.split("/").pop() || "Unnamed",
              repo_path: p.repo_path,
              branch: p.branch,
              sync_status: p.sync_status,
              db_type: p.db_type,
              chunks_total: p.chunks_total,
              chunks_indexed: p.chunks_indexed,
              sync_message: p.sync_message,
            })));

            const active = data.find((p) => p.repository_id === activeRepoId);
            if (active) {
              setSyncStatus(active.sync_status);
              setChunksTotal(active.chunks_total || 0);
              setChunksIndexed(active.chunks_indexed || 0);
              setSyncMessage(active.sync_message || "");
              if (active.sync_status === "linked") {
                setSyncing(false);
                setSuccess("Success! Codebase is fully synchronized and ready.");
              } else if (active.sync_status === "failed") {
                setSyncing(false);
                setError("Ingestion process failed. Verify repository path or check backend logs.");
              } else if (active.sync_status === "pending") {
                setSyncing(false);
              }
            }
          }
        })
        .catch(() => {});
    }, 2000);

    return () => clearInterval(interval);
  }, [syncing, companyId, activeRepoId]);

  const handleResetSettings = () => {
    if (confirm("Are you sure you want to reset ZeroTicket onboarding details? This will clear local configurations.")) {
      localStorage.clear();
      router.push("/onboarding");
    }
  };

  if (!mounted || !companyId) {
    return <div className="p-8 text-xs text-slate-400">Loading ZeroTicket Dashboard...</div>;
  }

  // Sample widget embedding code snippet
  const embedCode = `<iframe 
  src="http://localhost:3000/widget?token=VERIFIED_JWT_TOKEN" 
  style="border: none; width: 350px; height: 500px; position: fixed; bottom: 20px; right: 20px; z-index: 9999;"
></iframe>`;

  const backendSignCode = `// PHP (Laravel) Controller Example to generate signed JWT for Widget
use Firebase\\JWT\\JWT;

$payload = [
    'iss' => '${companyId}',
    'company_id' => '${companyId}',
    'user_id' => Auth::user()->id,       // Logged in User ID
    'tenant_id' => Auth::user()->company_id, // Tenant Context ID
    'exp' => time() + 3600,             // 1 Hour Expiry
];

// Sign using your raw API Key
$jwt = JWT::encode($payload, '${apiKey}', 'HS256');`;

  return (
    <div className="flex-1 flex flex-col p-6 max-w-6xl mx-auto w-full space-y-8 relative">
      {/* Background blur */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-[128px] pointer-events-none" />

      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-6">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight flex items-center gap-2 transition-colors ${isLightMode ? "text-slate-800" : "text-white"}`}>
            ZeroTicket <span className="text-gradient font-extrabold text-sm uppercase tracking-wider bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">Dashboard</span>
          </h1>
          <p className="text-xs text-slate-400">Manage connections and embedded AI ticket widget details</p>

          {/* Project Switcher */}
          {projects.length > 0 && (
            <div className="relative mt-2" id="project-switcher">
              <button
                type="button"
                onClick={() => setProjectDropOpen((o) => !o)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  isLightMode
                    ? "bg-white border-slate-200 text-slate-700 hover:border-slate-300 shadow-sm"
                    : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                }`}
              >
                <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" />
                </svg>
                {projects.find((p) => p.id === activeRepoId)?.name ||
                  repoPath.split("/").pop() ||
                  "Select Project"}
                <svg className={`w-3 h-3 transition-transform ${projectDropOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {projectDropOpen && (
                <div className={`absolute top-full mt-1 left-0 z-50 rounded-xl border shadow-xl min-w-[240px] py-1 ${
                  isLightMode ? "bg-white border-slate-200 shadow-slate-200" : "bg-slate-900 border-white/10"
                }`}>
                  {projects.map((proj) => (
                    <button
                      key={proj.id}
                      type="button"
                      onClick={() => {
                        setActiveRepoId(proj.id);
                        setRepoPath(proj.repo_path);
                        setRepoBranch(proj.branch);
                        localStorage.setItem("repository_id", proj.id);
                        localStorage.setItem("repo_path", proj.repo_path);
                        localStorage.setItem("repo_branch", proj.branch);
                        setProjectDropOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-xs transition-colors flex items-center gap-2 ${
                        proj.id === activeRepoId
                          ? isLightMode ? "bg-blue-50 text-blue-700 font-semibold" : "bg-blue-600/10 text-blue-400 font-semibold"
                          : isLightMode ? "text-slate-700 hover:bg-slate-50" : "text-slate-300 hover:bg-white/5"
                      }`}
                    >
                      {proj.id === activeRepoId && (
                        <svg className="w-3 h-3 text-blue-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      <div>
                        <div className="font-semibold">{proj.name || proj.repo_path.split("/").pop()}</div>
                        <div className={`text-[10px] ${isLightMode ? "text-slate-400" : "text-slate-500"}`}>{proj.branch}</div>
                      </div>
                    </button>
                  ))}
                  <div className={`border-t my-1 ${isLightMode ? "border-slate-100" : "border-white/5"}`} />
                  <button
                    type="button"
                    onClick={() => { setProjectDropOpen(false); router.push("/onboarding?step=2"); }}
                    className={`w-full text-left px-4 py-2.5 text-xs flex items-center gap-2 ${
                      isLightMode ? "text-blue-600 hover:bg-blue-50" : "text-blue-400 hover:bg-blue-600/10"
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Add Another Project
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold ${
              isLightMode 
                ? "bg-slate-250 hover:bg-slate-300 text-slate-700 shadow-sm border border-slate-300" 
                : "bg-white/5 hover:bg-white/10 text-slate-300"
            }`}
          >
            {isLightMode ? (
              <>
                <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 100 2h1z" clipRule="evenodd" />
                </svg>
                Light
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
                Dark
              </>
            )}
          </button>

          <button
            onClick={() => router.push("/sandbox")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 transition-colors text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 shadow-md"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Open Sandbox Emulator
          </button>

          <button
            onClick={handleResetSettings}
            className={`px-3 py-2 transition-colors text-xs rounded-lg ${isLightMode ? "bg-slate-200 hover:bg-slate-300 text-slate-700" : "bg-white/5 hover:bg-white/10 text-slate-300"}`}
          >
            Reset Settings
          </button>
        </div>
      </div>

      {error && (
        <div className={`p-4 rounded-lg border text-sm transition-colors ${
          isLightMode 
            ? "bg-red-50 border-red-200 text-red-800" 
            : "bg-red-950/40 border border-red-500/30 text-red-300"
        }`}>
          {error}
        </div>
      )}

      {success && (
        <div className={`p-4 rounded-lg border text-sm transition-colors ${
          isLightMode 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
            : "bg-emerald-950/20 border border-emerald-500/30 text-emerald-400"
        }`}>
          {success}
        </div>
      )}

      {/* Grid of Connections Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Repo Card */}
        <div className={`rounded-xl p-5 border flex flex-col justify-between transition-all shadow-sm ${
          isLightMode ? "bg-white border-slate-200/80 shadow-slate-100" : "glass-panel border-white/5 shadow-black/45"
        }`}>
          <div className="space-y-2">
            <span className={`text-[10px] uppercase font-bold tracking-wider transition-colors ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>Codebase</span>
            <h2 className={`text-sm font-bold truncate transition-colors ${isLightMode ? "text-slate-800" : "text-white"}`}>{repoPath.split("/").pop()}</h2>
            <div className={`text-xs space-y-1 transition-colors ${isLightMode ? "text-slate-600" : "text-slate-400"}`}>
              <p>Path: <code className={`px-1 py-0.5 rounded text-[10px] ${isLightMode ? "bg-slate-100 text-slate-700" : "bg-white/5 text-slate-300"}`}>{repoPath}</code></p>
              <p>Branch: <span className={`font-semibold ${isLightMode ? "text-slate-700" : "text-slate-300"}`}>{repoBranch}</span></p>
            </div>

            {syncing && (
              <div className={`mt-3 pt-3 border-t border-dashed space-y-1.5 text-[11px] ${
                isLightMode ? "border-slate-200" : "border-white/10"
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`flex items-center gap-1.5 ${
                    syncStatus === "cloning" ? (isLightMode ? "text-blue-600 font-semibold" : "text-blue-400 font-semibold") : (isLightMode ? "text-slate-600" : "text-slate-400")
                  }`}>
                    {syncStatus === "cloning" ? (
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                    ) : syncStatus === "parsing" || syncStatus === "linked" ? (
                      <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                    )}
                    1. Code Parsing & AST Mapping
                  </span>
                  <span className={`font-semibold ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>
                    {syncStatus === "cloning" ? "Running..." : syncStatus === "parsing" || syncStatus === "linked" ? "Done" : "Pending"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`flex items-center gap-1.5 ${
                    syncStatus === "parsing" ? (isLightMode ? "text-blue-600 font-semibold" : "text-blue-400 font-semibold") : (isLightMode ? "text-slate-600" : "text-slate-400")
                  }`}>
                    {syncStatus === "parsing" ? (
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                    ) : syncStatus === "linked" ? (
                      <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                    )}
                    2. Vectorizing Codebase (ChromaDB)
                  </span>
                  <span className={`font-semibold ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>
                    {syncStatus === "parsing" 
                      ? chunksTotal > 0 
                        ? `Embedding (${chunksIndexed}/${chunksTotal})` 
                        : "Embedding..."
                      : syncStatus === "linked" 
                      ? "Done" 
                      : "Pending"}
                  </span>
                </div>
                {syncStatus === "parsing" && chunksTotal > 0 && (
                  <div className="space-y-1 w-full">
                    <div className={`w-full rounded-full h-1 overflow-hidden transition-colors ${
                      isLightMode ? "bg-slate-100" : "bg-white/5"
                    }`}>
                      <div 
                        className="bg-blue-500 h-full rounded-full transition-all duration-300" 
                        style={{ width: `${Math.min(100, Math.round((chunksIndexed / chunksTotal) * 100))}%` }}
                      />
                    </div>
                    {syncMessage && (
                      <p className="text-[10px] text-amber-500 font-semibold animate-pulse">
                        {syncMessage}
                      </p>
                    )}
                  </div>
                )}
                {dbName && (
                  <div className="flex items-center justify-between">
                    <span className={`flex items-center gap-1.5 ${
                      syncStatus === "linked" ? (isLightMode ? "text-slate-600" : "text-slate-400") : (isLightMode ? "text-slate-600" : "text-slate-400")
                    }`}>
                      {syncStatus === "linked" ? (
                        <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                      )}
                      3. DB Schema Extraction
                    </span>
                    <span className={`font-semibold ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>
                      {syncStatus === "linked" ? "Done" : "Pending"}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={`mt-4 pt-4 border-t flex items-center justify-between text-xs transition-colors ${isLightMode ? "border-slate-100" : "border-white/5"}`}>
            <span className={isLightMode ? "text-slate-500" : "text-slate-400"}>Status</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              syncStatus === "linked" 
                ? (isLightMode ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20") 
                : syncStatus === "pending"
                ? (isLightMode ? "bg-slate-100 text-slate-600 border border-slate-200" : "bg-slate-800/40 text-slate-400 border border-white/5")
                : "bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse"
            }`}>
              {syncStatus === "linked" ? "Synced" : syncStatus === "failed" ? "Failed" : syncStatus === "pending" ? "Pending" : "Syncing..."}
            </span>
          </div>

        </div>

        {/* Database Card */}
        <div className={`rounded-xl p-5 border flex flex-col justify-between transition-all shadow-sm ${
          isLightMode ? "bg-white border-slate-200/80 shadow-slate-100" : "glass-panel border-white/5 shadow-black/45"
        }`}>
          <div className="space-y-2">
            <span className={`text-[10px] uppercase font-bold tracking-wider transition-colors ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>Target Database</span>
            <h2 className={`text-sm font-bold truncate transition-colors ${isLightMode ? "text-slate-800" : "text-white"}`}>{dbName}</h2>
            <div className={`text-xs space-y-1 transition-colors ${isLightMode ? "text-slate-600" : "text-slate-400"}`}>
              <p>Host: <span className={`font-semibold ${isLightMode ? "text-slate-700" : "text-slate-300"}`}>{dbHost}</span></p>
              <p>Type: <span className={`font-semibold ${isLightMode ? "text-slate-700" : "text-slate-300"}`}>{dbType === "postgres" ? "PostgreSQL" : "MySQL"}</span></p>
            </div>
          </div>
          <div className={`mt-4 pt-4 border-t flex items-center justify-between text-xs transition-colors ${isLightMode ? "border-slate-100" : "border-white/5"}`}>
            <span className={isLightMode ? "text-slate-500" : "text-slate-400"}>Connection</span>
            <span className={`font-semibold flex items-center gap-1 ${isLightMode ? "text-emerald-600" : "text-emerald-400"}`}>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Active
            </span>
          </div>
        </div>

        {/* Platform API Details */}
        <div className={`rounded-xl p-5 border flex flex-col justify-between transition-all shadow-sm ${
          isLightMode ? "bg-white border-slate-200/80 shadow-slate-100" : "glass-panel border-white/5 shadow-black/45"
        }`}>
          <div className="space-y-2">
            <span className={`text-[10px] uppercase font-bold tracking-wider transition-colors ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>Developer API Keys</span>
            <h2 className={`text-sm font-bold transition-colors ${isLightMode ? "text-slate-800" : "text-white"}`}>{companyName}</h2>
            <div className={`text-xs space-y-1 transition-colors ${isLightMode ? "text-slate-600" : "text-slate-400"}`}>
              <p>API Key: <code className={`px-1 py-0.5 rounded text-[10px] ${isLightMode ? "bg-slate-100 text-slate-700" : "bg-white/5 text-slate-300"}`}>{apiKey.substring(0, 8)}...</code></p>
              <p>Company ID: <code className={`px-1 py-0.5 rounded text-[10px] ${isLightMode ? "bg-slate-100 text-slate-700" : "bg-white/5 text-slate-300"}`}>{companyId.substring(0, 8)}...</code></p>
              <p>AI Provider: <span className={`font-semibold capitalize ${isLightMode ? "text-slate-700" : "text-slate-300"}`}>{llmProvider}</span></p>
            </div>
          </div>
          
          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={handleSyncCodebase}
              disabled={syncing}
              className={`w-full py-2 transition-colors text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 ${
                isLightMode 
                  ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-250 shadow-sm" 
                  : "bg-white/5 hover:bg-white/10 text-slate-200"
              }`}
            >
              {syncing ? "Syncing..." : "Sync Repository Code"}
              {!syncing && (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.28 15H18" />
                </svg>
              )}
            </button>
            {projects.length === 0 && (
              <button
                onClick={() => router.push("/onboarding?step=2")}
                className={`w-full py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 border transition-all ${
                  isLightMode ? "border-slate-200 text-slate-500 hover:bg-slate-50" : "border-white/10 text-slate-400 hover:bg-white/5"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Another Project
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Integration Code Blocks Section */}
      <div className="space-y-4">
        <h2 className={`text-sm font-bold uppercase tracking-wider transition-colors ${isLightMode ? "text-slate-600" : "text-slate-400"}`}>
          Widget Embedding Guide
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Frontend Embedding code */}
          <div className={`p-5 rounded-xl border space-y-3 transition-all ${
            isLightMode ? "bg-white border-slate-200/80 shadow-sm shadow-slate-100" : "glass-panel border-white/5 shadow-md shadow-black/45"
          }`}>
            <div>
              <h3 className={`text-xs font-bold transition-colors ${isLightMode ? "text-slate-800" : "text-white"}`}>1. Embed Iframe Widget</h3>
              <p className={`text-[11px] transition-colors ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>Embed this iframe in your website. Ensure you pass the signed JWT token in search parameters.</p>
            </div>
            
            <pre className={`p-3 border rounded-lg text-[10px] font-mono overflow-x-auto whitespace-pre transition-colors ${
              isLightMode ? "bg-slate-50 border-slate-200 text-slate-700" : "bg-slate-950/80 border-white/5 text-slate-300"
            }`}>
              {embedCode}
            </pre>
          </div>

          {/* Backend JWT sign code */}
          <div className={`p-5 rounded-xl border space-y-3 transition-all ${
            isLightMode ? "bg-white border-slate-200/80 shadow-sm shadow-slate-100" : "glass-panel border-white/5 shadow-md shadow-black/45"
          }`}>
            <div>
              <h3 className={`text-xs font-bold transition-colors ${isLightMode ? "text-slate-800" : "text-white"}`}>2. Generate JWT Token on Client Backend</h3>
              <p className={`text-[11px] transition-colors ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>Sign user information using your ZeroTicket API key before rendering the support chat widget.</p>
            </div>
            
            <pre className={`p-3 border rounded-lg text-[10px] font-mono overflow-x-auto whitespace-pre transition-colors ${
              isLightMode ? "bg-slate-50 border-slate-200 text-slate-700" : "bg-slate-950/80 border-white/5 text-slate-300"
            }`}>
              {backendSignCode}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
