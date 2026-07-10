"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function OnboardingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAddingProject = Boolean(searchParams.get("step"));
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // State variables
  const [companyName, setCompanyName] = useState("");
  const [companyId, setCompanyId] = useState("");
  
  const [repoPath, setRepoPath] = useState("");
  const [projectName, setProjectName] = useState("");
  const [branch, setBranch] = useState("main");
  const [repositoryId, setRepositoryId] = useState("");
  
  const [dbType, setDbType] = useState<"mysql" | "postgres">("mysql");
  const [dbHost, setDbHost] = useState("127.0.0.1");
  const [dbPort, setDbPort] = useState(3306);
  const [dbUser, setDbUser] = useState("root");
  const [dbPass, setDbPass] = useState("");
  const [dbName, setDbName] = useState("");
  const [skipDb, setSkipDb] = useState(false);

  // LLM Provider
  const [llmProvider, setLlmProvider] = useState("gemini");
  const [llmModel, setLlmModel] = useState("");
  const [llmBaseUrl, setLlmBaseUrl] = useState("http://localhost:11434/v1");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [companyApiKey, setCompanyApiKey] = useState("");
  
  const pollRef = useRef<any>(null);

  // Ingestion status state
  const [syncStatus, setSyncStatus] = useState("idle");
  const [indexedChunks, setIndexedChunks] = useState(0);
  const [chunksTotal, setChunksTotal] = useState(0);
  const [syncMessage, setSyncMessage] = useState("");
  const [isLightMode, setIsLightMode] = useState(false);

  const BACKEND_URL = "http://localhost:8088";

  // Admin lock states
  const [mounted, setMounted] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [loginPassphrase, setLoginPassphrase] = useState("");
  const [loginError, setLoginError] = useState("");

  const getAdminHeaders = (extraHeaders: Record<string, string> = {}) => {
    const token = adminToken || localStorage.getItem("admin_token") || "";
    const headers: Record<string, string> = { ...extraHeaders };
    if (token) {
      headers["X-Admin-Token"] = token;
    }
    return headers;
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    try {
      const res = await fetch(`http://localhost:8088/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: loginPassphrase }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Invalid admin passphrase.");
      }
      const data = await res.json();
      localStorage.setItem("admin_token", data.token);
      setAdminToken(data.token);
      setLoginError("");
      setLoginRequired(false);
    } catch (err: any) {
      setLoginError(err.message || "Failed to login.");
    }
  };

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
      setIsLightMode(true);
      document.body.classList.add("light");
    } else {
      setIsLightMode(false);
      document.body.classList.remove("light");
    }

    const savedCompanyId = localStorage.getItem("company_id");
    const savedLinked = localStorage.getItem("repo_linked");
    const targetStep = searchParams.get("step");

    // Always try to load saved LLM settings if they exist
    const savedLlmProvider = localStorage.getItem("llm_provider");
    if (savedLlmProvider) setLlmProvider(savedLlmProvider);
    const savedLlmModel = localStorage.getItem("llm_model");
    if (savedLlmModel) setLlmModel(savedLlmModel);
    const savedLlmBaseUrl = localStorage.getItem("llm_base_url");
    if (savedLlmBaseUrl) setLlmBaseUrl(savedLlmBaseUrl);
    const savedLlmApiKey = localStorage.getItem("llm_api_key") || localStorage.getItem("gemini_api_key");
    if (savedLlmApiKey) setLlmApiKey(savedLlmApiKey);

    if (savedCompanyId) {
      setCompanyId(savedCompanyId);
      setCompanyName(localStorage.getItem("company_name") || "");
      setCompanyApiKey(localStorage.getItem("api_key") || "");
    }

    if (targetStep) {
      setStep(Number(targetStep));
    } else if (savedCompanyId && savedLinked === "true") {
      router.push("/");
    }

    // Check admin status
    fetch("http://localhost:8088/api/admin/status")
      .then((r) => r.json())
      .then((statusData) => {
        if (statusData.login_required) {
          const savedToken = localStorage.getItem("admin_token");
          if (!savedToken) {
            setLoginRequired(true);
          } else {
            setAdminToken(savedToken);
          }
        }
      })
      .catch(() => {});

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [router, searchParams]);

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

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${BACKEND_URL}/api/company/register`, {
        method: "POST",
        headers: getAdminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name: companyName }),
      });
      
      if (!res.ok) throw new Error("Failed to register company.");
      const data = await res.json();
      
      setCompanyId(data.company_id);
      setCompanyApiKey(data.api_key);
      localStorage.setItem("company_id", data.company_id);
      localStorage.setItem("api_key", data.api_key);
      localStorage.setItem("company_name", data.name);
      
      setStep(2);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleConnectRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoPath.trim()) return;
    setLoading(true);
    setError("");

    try {
      let activeCompanyId = companyId;

      const attemptConnect = async (cid: string) => {
        return fetch(`${BACKEND_URL}/api/repository/connect`, {
          method: "POST",
          headers: getAdminHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            company_id: cid,
            repo_path: repoPath,
            branch: branch,
            project_name: projectName || undefined,
          }),
        });
      };

      let res = await attemptConnect(activeCompanyId);

      // If company no longer exists in the DB (e.g. after a DB reset), auto re-register it.
      if (res.status === 404) {
        const errBody = await res.json().catch(() => ({}));
        if ((errBody?.detail || "").includes("Company not found")) {
          const savedName = companyName || localStorage.getItem("company_name") || "My Company";
          const regRes = await fetch(`${BACKEND_URL}/api/company/register`, {
            method: "POST",
            headers: getAdminHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ name: savedName }),
          });
          if (!regRes.ok) throw new Error("Failed to re-register company. Please reload and try again.");
          const regData = await regRes.json();
          activeCompanyId = regData.company_id;
          setCompanyId(activeCompanyId);
          localStorage.setItem("company_id", activeCompanyId);
          localStorage.setItem("api_key", regData.api_key);
          localStorage.setItem("company_name", regData.name);
          // Retry the repo connect with the new company id
          res = await attemptConnect(activeCompanyId);
        }
      }

      if (!res.ok) throw new Error("Failed to connect repository folder.");
      const data = await res.json();
      
      setRepositoryId(data.repository_id);
      localStorage.setItem("repo_path", repoPath);
      localStorage.setItem("repo_branch", branch);
      localStorage.setItem("repository_id", data.repository_id);
      localStorage.setItem("repo_name", projectName || repoPath.split("/").pop() || "");
      
      setStep(3);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleConnectDB = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbHost.trim() || !dbUser.trim() || !dbName.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${BACKEND_URL}/api/db/connect`, {
        method: "POST",
        headers: getAdminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          company_id: companyId,
          repository_id: repositoryId || undefined,
          db_type: dbType,
          db_host: dbHost,
          db_port: Number(dbPort),
          db_user: dbUser,
          db_pass: dbPass,
          db_name: dbName,
        }),
      });
      
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || `Failed to connect target ${dbType === "postgres" ? "PostgreSQL" : "MySQL"} DB connection details.`);
      }
      
      localStorage.setItem("db_host", dbHost);
      localStorage.setItem("db_name", dbName);
      localStorage.setItem("db_user", dbUser);
      localStorage.setItem("db_type", dbType);
      
      setStep(4);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleSkipDB = () => {
    localStorage.removeItem("db_host");
    localStorage.removeItem("db_name");
    localStorage.removeItem("db_user");
    localStorage.removeItem("db_type");
    setStep(4);
  };

  const handleRunIngestion = async () => {
    setLoading(true);
    setError("");
    setSyncStatus("cloning");

    try {
      if (llmApiKey.trim()) {
        localStorage.setItem("gemini_api_key", llmApiKey);
        localStorage.setItem("llm_api_key", llmApiKey);
      } else {
        localStorage.removeItem("gemini_api_key");
        localStorage.removeItem("llm_api_key");
      }
      localStorage.setItem("llm_provider", llmProvider);
      localStorage.setItem("llm_model", llmModel);
      
      const res = await fetch(`${BACKEND_URL}/api/ingest`, {
        method: "POST",
        headers: getAdminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          company_id: companyId,
          repository_id: repositoryId || undefined,
          llm_provider: llmProvider,
          api_key: llmApiKey,
          llm_base_url: llmBaseUrl,
        }),
      });
      
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || "Ingestion process failed. Verify repository path and try again.");
      }
      
      // Start polling project status from backend
      const pollInterval = setInterval(() => {
        fetch(`${BACKEND_URL}/api/company/projects?company_id=${companyId}`, { headers: getAdminHeaders() })
          .then((r) => r.json())
          .then((projects: any[]) => {
            if (Array.isArray(projects)) {
              const active = projects.find((p) => p.repository_id === repositoryId);
              if (active) {
                setSyncStatus(active.sync_status);
                setChunksTotal(active.chunks_total || 0);
                setIndexedChunks(active.chunks_indexed || 0);
                setSyncMessage(active.sync_message || "");
                if (active.sync_status === "linked") {
                  clearInterval(pollInterval);
                  localStorage.setItem("repo_linked", "true");
                  setLoading(false);
                  setTimeout(() => {
                    router.push("/");
                  }, 2000);
                } else if (active.sync_status === "failed") {
                  clearInterval(pollInterval);
                  setLoading(false);
                  setError(active.sync_message || "Ingestion process failed. Verify repository path or check backend logs.");
                }
              }
            }
          })
          .catch(() => {});
      }, 2000);
      pollRef.current = pollInterval;

    } catch (err: any) {
      setSyncStatus("failed");
      setError(err.message || "An error occurred during ingestion");
      setLoading(false);
    }
  };


  if (mounted && loginRequired && !adminToken) {
    return (
      <div className={`min-h-screen flex items-center justify-center font-sans transition-colors duration-300 ${
        isLightMode ? "bg-slate-50" : "bg-[#0b0f19]"
      }`}>
        <div className={`w-full max-w-md p-8 rounded-2xl border transition-all duration-300 ${
          isLightMode 
            ? "bg-white border-slate-200/80 shadow-lg shadow-slate-100" 
            : "bg-[#0f172a]/40 border-white/5 shadow-2xl shadow-black/60 backdrop-blur-xl"
        }`}>
          <div className="flex flex-col items-center gap-4 text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 text-blue-500">
              <svg className="w-6 h-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h1 className={`text-lg font-bold tracking-tight ${isLightMode ? "text-slate-900" : "text-white"}`}>
                ZeroTicket Admin Panel
              </h1>
              <p className={`text-xs mt-1 leading-relaxed ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>
                Please enter the self-hosted admin passphrase to configure or manage ZeroTicket.
              </p>
            </div>
          </div>
          
          <form onSubmit={handleAdminLogin} className="space-y-4">
            {loginError && (
              <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/25 text-red-300 text-xs text-center leading-relaxed">
                {loginError}
              </div>
            )}
            <div>
              <input
                type="password"
                value={loginPassphrase}
                onChange={(e) => setLoginPassphrase(e.target.value)}
                placeholder="Admin Passphrase..."
                required
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 ${
                  isLightMode
                    ? "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400"
                    : "bg-slate-950/60 border-white/5 text-white placeholder-slate-500"
                }`}
              />
            </div>
            
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-[0_8px_25px_-4px_rgba(37,99,235,0.4)] transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              Access Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
      {/* Background gradients */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[128px] pointer-events-none" />

      <div className={`w-full max-w-xl rounded-2xl p-8 border z-10 transition-colors ${
        isLightMode
          ? "bg-white border-slate-200 shadow-xl shadow-slate-200/60"
          : "glass-panel border-white/10"
      }`}>
        {/* Theme Toggle + Back Button Row */}
        <div className="flex justify-between items-center mb-2">
          {isAddingProject ? (
            <button
              type="button"
              onClick={() => router.push("/")}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all ${
                isLightMode ? "text-slate-600 hover:bg-slate-100" : "text-slate-400 hover:bg-white/5"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Dashboard
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={toggleTheme}
            type="button"
            className={`p-1.5 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold ${
              isLightMode 
                ? "bg-slate-200 hover:bg-slate-350 text-slate-700 shadow-sm border border-slate-300" 
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
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className={`text-3xl font-extrabold tracking-tight mb-2 transition-colors ${
            isLightMode ? "text-slate-800" : "text-white"
          }`}>
            {isAddingProject ? (
              <>Add <span className="text-gradient">New Project</span></>
            ) : (
              <>Setup <span className="text-gradient">ZeroTicket</span></>
            )}
          </h1>
          <p className={`text-sm transition-colors ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>
            {isAddingProject
              ? `Adding project to ${companyName || "your account"}`
              : "Automate customer support directly from your source code and database rules"}
          </p>
        </div>

        {/* Step Indicators — only show steps relevant to current mode */}
        <div className="flex items-center justify-between mb-8 px-4">
          {(isAddingProject ? [2, 3, 4] : [1, 2, 3, 4]).map((s, idx, arr) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  step === s
                    ? "bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                    : step > s
                    ? "bg-emerald-500 text-white"
                    : isLightMode
                    ? "bg-slate-200 text-slate-500 border border-slate-300"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                {step > s ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  isAddingProject ? idx + 1 : s
                )}
              </div>
              {idx < arr.length - 1 && (
                <div
                  className={`h-0.5 w-16 sm:w-24 transition-colors duration-300 ${
                    step > s
                      ? "bg-emerald-500"
                      : isLightMode
                      ? "bg-slate-200"
                      : "bg-slate-800"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className={`mb-6 p-4 rounded-lg border text-sm ${
            isLightMode
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-red-950/50 border-red-500/30 text-red-300"
          }`}>
            {error}
          </div>
        )}

        {/* Step 1: Create Company */}
        {step === 1 && (
          <form onSubmit={handleCreateCompany} className="space-y-6">
            <div>
              <label htmlFor="companyName" className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                isLightMode ? "text-slate-600" : "text-slate-400"
              }`}>
                Company / Organization Name
              </label>
              <input
                id="companyName"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. ZeroTicket Web Portal"
                className="w-full px-4 py-3 rounded-lg glass-input text-sm"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm transition-all shadow-[0_4px_20px_rgba(59,130,246,0.25)] hover:shadow-[0_4px_25px_rgba(59,130,246,0.4)] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? "Registering organization..." : "Continue"}
              {!loading && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </form>
        )}

        {/* Step 2: Connect Repo */}
        {step === 2 && (
          <form onSubmit={handleConnectRepo} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="projectName" className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                  isLightMode ? "text-slate-600" : "text-slate-400"
                }`}>
                  Project Name <span className={`normal-case font-normal ${
                    isLightMode ? "text-slate-400" : "text-slate-600"
                  }`}>(optional)</span>
                </label>
                <input
                  id="projectName"
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. ZeroTicket Web Portal"
                  className="w-full px-4 py-3 rounded-lg glass-input text-sm"
                />
                <p className={`mt-1 text-xs ${isLightMode ? "text-slate-400" : "text-slate-500"}`}>
                  A friendly label for this project. Defaults to the folder name if left blank.
                </p>
              </div>

              <div>
                <label htmlFor="repoPath" className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                  isLightMode ? "text-slate-600" : "text-slate-400"
                }`}>
                  Local Repository Absolute Path
                </label>
                <input
                  id="repoPath"
                  type="text"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  placeholder="e.g. /Users/jiayong/GitHub/zeroticket"
                  className="w-full px-4 py-3 rounded-lg glass-input text-sm"
                  required
                />
                <p className={`mt-1 text-xs ${isLightMode ? "text-slate-400" : "text-slate-500"}`}>
                  Input the folder path of the software project code on your machine.
                </p>
              </div>

              <div>
                <label htmlFor="branch" className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                  isLightMode ? "text-slate-600" : "text-slate-400"
                }`}>
                  Target Branch
                </label>
                <input
                  id="branch"
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full px-4 py-3 rounded-lg glass-input text-sm"
                />
              </div>
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={loading}
                className={`px-6 py-3 rounded-lg border font-semibold text-sm transition-all disabled:opacity-50 ${
                  isLightMode
                    ? "border-slate-300 hover:bg-slate-50 text-slate-600"
                    : "border-white/10 hover:bg-white/5 text-slate-300"
                }`}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm transition-all shadow-[0_4px_20px_rgba(59,130,246,0.25)] hover:shadow-[0_4px_25px_rgba(59,130,246,0.4)] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? "Connecting directory..." : "Connect codebase"}
                {!loading && (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Connect DB */}
        {step === 3 && (
          <form onSubmit={skipDb ? (e) => { e.preventDefault(); handleSkipDB(); } : handleConnectDB} className="space-y-6">

            {/* Skip toggle */}
            <button
              type="button"
              onClick={() => setSkipDb(!skipDb)}
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-sm font-semibold transition-all ${
                skipDb
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-400"
                  : isLightMode
                  ? "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                  : "border-white/10 text-slate-400 hover:border-white/20 hover:bg-white/5"
              }`}
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                skipDb
                  ? "bg-amber-500 border-amber-500"
                  : isLightMode ? "border-slate-300" : "border-slate-600"
              }`}>
                {skipDb && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="text-left">
                <div>No database for this project</div>
                <div className={`text-xs font-normal mt-0.5 ${
                  skipDb ? "text-amber-400/70" : isLightMode ? "text-slate-400" : "text-slate-500"
                }`}>Code-only projects — AI answers from codebase logic alone, no SQL queries</div>
              </div>
            </button>

            {/* DB fields — hidden when skipping */}
            {!skipDb && (
              <>
                {/* DB Type Selector */}
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                    isLightMode ? "text-slate-600" : "text-slate-400"
                  }`}>
                    Database Type
                  </label>
                  <div className="flex gap-2">
                    {(["mysql", "postgres"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setDbType(t);
                          setDbPort(t === "postgres" ? 5432 : 3306);
                        }}
                        className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold border transition-all ${
                          dbType === t
                            ? "bg-blue-600/20 border-blue-500/60 text-blue-400"
                            : isLightMode
                            ? "border-slate-300 text-slate-500 hover:border-slate-400"
                            : "border-white/10 text-slate-400 hover:border-white/20"
                        }`}
                      >
                        {t === "mysql" ? "MySQL" : "PostgreSQL"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-6 gap-4">
                  <div className="col-span-4">
                    <label htmlFor="dbHost" className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                      isLightMode ? "text-slate-600" : "text-slate-400"
                    }`}>
                      {dbType === "postgres" ? "PostgreSQL" : "MySQL"} Host
                    </label>
                    <input
                      id="dbHost"
                      type="text"
                      value={dbHost}
                      onChange={(e) => setDbHost(e.target.value)}
                      placeholder="127.0.0.1"
                      className="w-full px-4 py-3 rounded-lg glass-input text-sm"
                      required
                    />
                  </div>

                  <div className="col-span-2">
                    <label htmlFor="dbPort" className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                      isLightMode ? "text-slate-600" : "text-slate-400"
                    }`}>
                      Port
                    </label>
                    <input
                      id="dbPort"
                      type="number"
                      value={dbPort}
                      onChange={(e) => setDbPort(Number(e.target.value))}
                      placeholder="3306"
                      className="w-full px-4 py-3 rounded-lg glass-input text-sm"
                      required
                    />
                  </div>

                  <div className="col-span-3">
                    <label htmlFor="dbUser" className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                      isLightMode ? "text-slate-600" : "text-slate-400"
                    }`}>
                      User (Read-Only Recommended)
                    </label>
                    <input
                      id="dbUser"
                      type="text"
                      value={dbUser}
                      onChange={(e) => setDbUser(e.target.value)}
                      placeholder="root"
                      className="w-full px-4 py-3 rounded-lg glass-input text-sm"
                      required
                    />
                  </div>

                  <div className="col-span-3">
                    <label htmlFor="dbPass" className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                      isLightMode ? "text-slate-600" : "text-slate-400"
                    }`}>
                      Password
                    </label>
                    <input
                      id="dbPass"
                      type="password"
                      value={dbPass}
                      onChange={(e) => setDbPass(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 rounded-lg glass-input text-sm"
                    />
                  </div>

                  <div className="col-span-6">
                    <label htmlFor="dbName" className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                      isLightMode ? "text-slate-600" : "text-slate-400"
                    }`}>
                      Database Name
                    </label>
                    <input
                      id="dbName"
                      type="text"
                      value={dbName}
                      onChange={(e) => setDbName(e.target.value)}
                      placeholder="e.g. zeroticket_db"
                      className="w-full px-4 py-3 rounded-lg glass-input text-sm"
                      required
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={loading}
                className={`px-6 py-3 rounded-lg border font-semibold text-sm transition-all disabled:opacity-50 ${
                  isLightMode
                    ? "border-slate-300 hover:bg-slate-50 text-slate-600"
                    : "border-white/10 hover:bg-white/5 text-slate-300"
                }`}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                  skipDb
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-[0_4px_20px_rgba(245,158,11,0.25)]"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-[0_4px_20px_rgba(59,130,246,0.25)] hover:shadow-[0_4px_25px_rgba(59,130,246,0.4)]"
                }`}
              >
                {skipDb
                  ? "Continue without database"
                  : loading
                  ? `Testing ${dbType === "postgres" ? "PostgreSQL" : "MySQL"} connection...`
                  : "Connect Target Database"}
                {!loading && (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Step 4: Run Ingestion */}
        {step === 4 && (
          <div className="space-y-6">
            {/* Model Provider Selector */}
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                isLightMode ? "text-slate-600" : "text-slate-400"
              }`}>
                AI Model Provider
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: "gemini", label: "Gemini", sub: "Google" },
                  { id: "openai", label: "GPT-4o", sub: "OpenAI" },
                  { id: "anthropic", label: "Claude", sub: "Anthropic" },
                  { id: "deepseek", label: "DeepSeek", sub: "DeepSeek AI" },
                  { id: "qwen", label: "Qwen", sub: "Alibaba" },
                  { id: "custom", label: "AMD GPU (Gemma)", sub: "Ollama / vLLM (ROCm)" },
                ] as const).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setLlmProvider(p.id)}
                    className={`py-2.5 px-3 rounded-lg text-xs font-semibold border transition-all text-left ${
                      llmProvider === p.id
                        ? p.id === "custom"
                          ? "bg-gradient-to-br from-amber-600/20 to-rose-600/20 border-orange-500/60 text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.15)] animate-pulse-slow"
                          : "bg-blue-600/20 border-blue-500/60 text-blue-400"
                        : isLightMode
                        ? "border-slate-300 text-slate-500 hover:border-slate-400"
                        : "border-white/10 text-slate-400 hover:border-white/20"
                    }`}
                  >
                    <div className="font-bold">{p.label}</div>
                    <div className="text-[10px] opacity-60">{p.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Model name override (optional) */}
            <div>
              <label htmlFor="llmModel" className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                isLightMode ? "text-slate-600" : "text-slate-400"
              }`}>
                Model Name <span className={`normal-case font-normal ${
                  isLightMode ? "text-slate-400" : "text-slate-600"
                }`}>({llmProvider === "custom" ? "required" : "optional override"})</span>
              </label>
              <input
                id="llmModel"
                type="text"
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                placeholder={llmProvider === "openai" ? "gpt-4o" : llmProvider === "anthropic" ? "claude-3-5-sonnet-20241022" : llmProvider === "deepseek" ? "deepseek-chat" : llmProvider === "qwen" ? "qwen-plus" : llmProvider === "custom" ? "gemma4" : "gemini-2.5-flash"}
                className={`w-full px-4 py-3 rounded-lg text-sm transition-colors ${
                  isLightMode 
                    ? "bg-white border-slate-300 text-slate-700" 
                    : "glass-input"
                }`}
              />
              <p className={`mt-1 text-xs ${isLightMode ? "text-slate-400" : "text-slate-500"}`}>
                {llmProvider === "custom" ? "Routes requests to your custom local LLM server endpoint." : "Leave blank to use the recommended default model for the selected provider."}
              </p>
            </div>

            {llmProvider === "custom" && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="llmBaseUrl" className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                    isLightMode ? "text-slate-600" : "text-slate-400"
                  }`}>
                    Custom Base URL
                  </label>
                  <input
                    id="llmBaseUrl"
                    type="text"
                    value={llmBaseUrl}
                    onChange={(e) => setLlmBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434/v1"
                    className={`w-full px-4 py-3 rounded-lg text-sm transition-colors ${
                      isLightMode 
                        ? "bg-white border-slate-300 text-slate-700" 
                        : "glass-input"
                    }`}
                  />
                </div>

                <div className="rounded-lg border border-orange-500/20 bg-gradient-to-br from-orange-950/20 to-rose-950/20 p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-orange-400">
                    <svg className="w-4 h-4 text-orange-400 fill-none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>AMD ROCm Local Compute Configuration Guide</span>
                  </div>
                  <div className="text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
                    <p>To qualify for the **AMD GPU Track**, run Google's **Gemma 4** model locally on your GPU node:</p>
                    <div className="bg-black/40 border border-white/5 rounded p-2 font-mono text-[10px] text-orange-300 select-all space-y-1">
                      <div># 1. Run Ollama on the server:</div>
                      <div>curl -fsSL https://ollama.com/install.sh | sh</div>
                      <div>ollama run gemma4</div>
                      <div># 2. Or launch vLLM with ROCm:</div>
                      <div>python -m vllm.entrypoints.openai.api_server --model google/gemma-4-9b-it</div>
                    </div>
                    <p className="text-[10px] opacity-75">Ensure the server's API is exposed globally or port-forwarded (default Ollama port: 11434, vLLM port: 8000).</p>
                  </div>
                </div>
              </div>
            )}


            <div>
              <label htmlFor="apiKeyInput" className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                isLightMode ? "text-slate-600" : "text-slate-400"
              }`}>
                {llmProvider === "gemini" ? "GEMINI_API_KEY" : llmProvider === "openai" ? "OPENAI_API_KEY" : llmProvider === "anthropic" ? "ANTHROPIC_API_KEY" : llmProvider === "deepseek" ? "DEEPSEEK_API_KEY" : "DASHSCOPE_API_KEY"}
                <span className={`normal-case font-normal ml-1 ${
                  isLightMode ? "text-slate-400" : "text-slate-600"
                }`}>(Leave blank if set in backend environment)</span>
              </label>
              <input
                id="apiKeyInput"
                type="password"
                value={llmApiKey}
                onChange={(e) => setLlmApiKey(e.target.value)}
                placeholder={llmProvider === "gemini" ? "AIzaSy..." : llmProvider === "openai" ? "sk-..." : llmProvider === "anthropic" ? "sk-ant-..." : "Enter API key"}
                className="w-full px-4 py-3 rounded-lg glass-input text-sm"
              />
              <p className={`mt-1 text-xs ${isLightMode ? "text-slate-400" : "text-slate-500"}`}>
                Required to generate code embeddings and execute the agent thought processes.
              </p>
            </div>

            <div className={`p-5 rounded-lg border space-y-4 transition-colors ${
              isLightMode ? "bg-slate-50 border-slate-200" : "glass-panel border-white/5"
            }`}>
              <h3 className={`text-sm font-semibold transition-colors ${isLightMode ? "text-slate-800" : "text-white"}`}>Pipeline Sync Progress</h3>
              
              <div className="space-y-3">
                {/* Scan Status */}
                <div className="flex items-center justify-between text-xs">
                  <span className={`flex items-center gap-2 ${isLightMode ? "text-slate-600" : "text-slate-400"}`}>
                    {syncStatus === "cloning" || (syncStatus === "parsing" && chunksTotal === 0) ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                    ) : syncStatus === "linked" || chunksTotal > 0 ? (
                      <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <div className={`w-2.5 h-2.5 rounded-full ${isLightMode ? "bg-slate-300" : "bg-slate-700"}`} />
                    )}
                    1. Code Parsing & AST Mapping
                  </span>
                  <span className={`font-semibold capitalize ${isLightMode ? "text-slate-700" : "text-slate-300"}`}>
                    {syncStatus === "idle" 
                      ? "Pending" 
                      : syncStatus === "linked" || chunksTotal > 0 
                      ? "Success" 
                      : syncStatus === "failed" 
                      ? "Failed" 
                      : "Running..."}
                  </span>
                </div>

                {/* Vector DB Status */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`flex items-center gap-2 ${isLightMode ? "text-slate-600" : "text-slate-400"}`}>
                      {syncStatus === "parsing" ? (
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                      ) : syncStatus === "linked" ? (
                        <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <div className={`w-2.5 h-2.5 rounded-full ${isLightMode ? "bg-slate-300" : "bg-slate-700"}`} />
                      )}
                      2. Vectorizing Codebase (ChromaDB)
                    </span>
                    <span className={`font-semibold ${isLightMode ? "text-slate-700" : "text-slate-300"}`}>
                      {syncStatus === "linked" 
                        ? `${indexedChunks} chunks` 
                        : syncStatus === "parsing" 
                        ? chunksTotal > 0 
                          ? `Embedding (${indexedChunks}/${chunksTotal})` 
                          : "Embedding..."
                        : syncStatus === "failed" && chunksTotal > 0
                        ? "Failed"
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
                          style={{ width: `${Math.min(100, Math.round((indexedChunks / chunksTotal) * 100))}%` }}
                        />
                      </div>
                      {syncMessage && (
                        <p className="text-[10px] text-amber-500 font-semibold animate-pulse">
                          {syncMessage}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* DB Schema Extraction */}
                {!skipDb && (
                  <div className="flex items-center justify-between text-xs">
                    <span className={`flex items-center gap-2 ${isLightMode ? "text-slate-600" : "text-slate-400"}`}>
                      {syncStatus === "linked" ? (
                        <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <div className={`w-2.5 h-2.5 rounded-full ${isLightMode ? "bg-slate-300" : "bg-slate-700"}`} />
                      )}
                      3. Target DB Schema & Relationships Linked
                    </span>
                    <span className={`font-semibold ${isLightMode ? "text-slate-700" : "text-slate-300"}`}>
                      {syncStatus === "linked" ? "Synced" : "Pending"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {syncStatus === "linked" ? (
              <div className={`flex items-center justify-center gap-2 text-sm p-3 rounded-lg border animate-pulse ${
                isLightMode
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-emerald-950/20 border-emerald-500/20 text-emerald-400"
              }`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                ZeroTicket is armed and ready! Redirecting...
              </div>
            ) : (
              <div className="flex flex-col gap-3 w-full animate-fade-in">
                {loading && (syncStatus === "parsing" || syncStatus === "cloning") ? (
                  <div className="flex flex-col gap-3 w-full">
                    <button
                      type="button"
                      onClick={() => {
                        if (pollRef.current) clearInterval(pollRef.current);
                        localStorage.setItem("repo_linked", "true");
                        router.push("/");
                      }}
                      className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2.5 shadow-[0_8px_25px_-4px_rgba(37,99,235,0.4)]"
                    >
                      <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Proceed to Dashboard (Sync in Background)
                    </button>
                    
                    <button
                      type="button"
                      onClick={async () => {
                        if (pollRef.current) clearInterval(pollRef.current);
                        try {
                          await fetch(`${BACKEND_URL}/api/ingest/cancel`, {
                            method: "POST",
                            headers: getAdminHeaders({ "Content-Type": "application/json" }),
                            body: JSON.stringify({
                              company_id: companyId,
                              repository_id: repositoryId,
                            }),
                          });
                        } catch (e) {}
                        setSyncStatus("idle");
                        setLoading(false);
                        setStep(3);
                      }}
                      className={`w-full py-2.5 rounded-xl border text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 ${
                        isLightMode
                          ? "border-red-200 hover:bg-red-50 text-red-600"
                          : "border-red-500/20 hover:bg-red-950/20 text-red-400"
                      }`}
                    >
                      Cancel Synchronization & Go Back
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setStep(3);
                        setSyncStatus("idle");
                        setError("");
                      }}
                      disabled={loading}
                      className={`px-6 py-3 rounded-lg border font-semibold text-sm transition-all disabled:opacity-50 ${
                        isLightMode
                          ? "border-slate-300 hover:bg-slate-50 text-slate-600"
                          : "border-white/10 hover:bg-white/5 text-slate-300"
                      }`}
                    >
                      Back
                    </button>
                    <button
                      onClick={handleRunIngestion}
                      disabled={loading}
                      className="flex-1 py-3 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm transition-all shadow-[0_4px_20px_rgba(16,185,129,0.25)] hover:shadow-[0_4px_25px_rgba(16,185,129,0.4)] disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {loading ? "Arming agent (parsing & mapping)..." : "Arm ZeroTicket Agent"}
                      {!loading && (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-400">Loading onboarding...</div>}>
      <OnboardingPageContent />
    </Suspense>
  );
}
