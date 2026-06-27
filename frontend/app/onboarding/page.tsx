"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function OnboardingPage() {
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

  // LLM Provider
  const [llmProvider, setLlmProvider] = useState("gemini");
  const [llmModel, setLlmModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  
  // Ingestion status state
  const [syncStatus, setSyncStatus] = useState("idle");
  const [indexedChunks, setIndexedChunks] = useState(0);
  const [isLightMode, setIsLightMode] = useState(false);

  const BACKEND_URL = "http://localhost:8088";

  // Check if already onboarded and load theme
  useEffect(() => {
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

    if (targetStep) {
      // User was intentionally redirected here to add a new project.
      // Restore existing company context and jump to the requested step.
      if (savedCompanyId) {
        setCompanyId(savedCompanyId);
        setCompanyName(localStorage.getItem("company_name") || "");
        // Restore existing llm settings so step 4 looks right
        setLlmProvider(localStorage.getItem("llm_provider") || "gemini");
        setLlmModel(localStorage.getItem("llm_model") || "");
      }
      setStep(Number(targetStep));
    } else if (savedCompanyId && savedLinked === "true") {
      // Fully onboarded with no explicit step override → go to dashboard.
      router.push("/");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${BACKEND_URL}/api/company/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: companyName }),
      });
      
      if (!res.ok) throw new Error("Failed to register company.");
      const data = await res.json();
      
      setCompanyId(data.company_id);
      setApiKey(data.api_key);
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
      const res = await fetch(`${BACKEND_URL}/api/repository/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          repo_path: repoPath,
          branch: branch,
          project_name: projectName || undefined,
        }),
      });
      
      if (!res.ok) throw new Error("Failed to connect repository folder.");
      const data = await res.json();
      
      setRepositoryId(data.repository_id);
      localStorage.setItem("repo_path", repoPath);
      localStorage.setItem("repo_branch", branch);
      localStorage.setItem("repository_id", data.repository_id);
      
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
        headers: { "Content-Type": "application/json" },
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
      
      if (!res.ok) throw new Error(`Failed to connect target ${dbType === "postgres" ? "PostgreSQL" : "MySQL"} DB connection details.`);
      
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

  const handleRunIngestion = async () => {
    setLoading(true);
    setError("");
    setSyncStatus("cloning");

    try {
      if (apiKey.trim()) {
        localStorage.setItem("gemini_api_key", apiKey);
        localStorage.setItem("llm_api_key", apiKey);
      }
      localStorage.setItem("llm_provider", llmProvider);
      localStorage.setItem("llm_model", llmModel);
      
      const res = await fetch(`${BACKEND_URL}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          repository_id: repositoryId || undefined,
          llm_provider: llmProvider,
          api_key: apiKey,
        }),
      });
      
      if (!res.ok) throw new Error("Ingestion process failed. Verify repository path and target database replica are reachable.");
      
      const data = await res.json();
      setIndexedChunks(data.code_chunks_indexed);
      setSyncStatus("linked");
      localStorage.setItem("repo_linked", "true");
      
      setTimeout(() => {
        router.push("/");
      }, 2000);
    } catch (err: any) {
      setSyncStatus("failed");
      setError(err.message || "An error occurred during ingestion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
      {/* Background gradients */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[128px] pointer-events-none" />

      <div className="w-full max-w-xl glass-panel rounded-2xl p-8 border border-white/10 z-10">
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
          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
            {isAddingProject ? (
              <>Add <span className="text-gradient">New Project</span></>
            ) : (
              <>Setup <span className="text-gradient">ZeroTicket</span></>
            )}
          </h1>
          <p className="text-sm text-slate-400">
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
                    step > s ? "bg-emerald-500" : "bg-slate-800"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-950/50 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Step 1: Create Company */}
        {step === 1 && (
          <form onSubmit={handleCreateCompany} className="space-y-6">
            <div>
              <label htmlFor="companyName" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Company / Organization Name
              </label>
              <input
                id="companyName"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. EduKids Web Portal"
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
                <label htmlFor="projectName" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Project Name <span className="text-slate-600 normal-case font-normal">(optional)</span>
                </label>
                <input
                  id="projectName"
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. EduKids Web Portal"
                  className="w-full px-4 py-3 rounded-lg glass-input text-sm"
                />
                <p className="mt-1 text-xs text-slate-500">
                  A friendly label for this project. Defaults to the folder name if left blank.
                </p>
              </div>

              <div>
                <label htmlFor="repoPath" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Local Repository Absolute Path
                </label>
                <input
                  id="repoPath"
                  type="text"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  placeholder="e.g. /Users/jiayong/GitHub/edukids-web"
                  className="w-full px-4 py-3 rounded-lg glass-input text-sm"
                  required
                />
                <p className="mt-1 text-xs text-slate-500">
                  Input the folder path of the software project code on your machine.
                </p>
              </div>

              <div>
                <label htmlFor="branch" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
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
                className="px-6 py-3 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 font-semibold text-sm transition-all disabled:opacity-50"
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
          <form onSubmit={handleConnectDB} className="space-y-6">
            {/* DB Type Selector */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
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
                <label htmlFor="dbHost" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
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
                <label htmlFor="dbPort" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
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
                <label htmlFor="dbUser" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
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
                <label htmlFor="dbPass" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
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
                <label htmlFor="dbName" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Database Name
                </label>
                <input
                  id="dbName"
                  type="text"
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  placeholder="e.g. edukids_db"
                  className="w-full px-4 py-3 rounded-lg glass-input text-sm"
                  required
                />
              </div>
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={loading}
                className="px-6 py-3 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 font-semibold text-sm transition-all disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm transition-all shadow-[0_4px_20px_rgba(59,130,246,0.25)] hover:shadow-[0_4px_25px_rgba(59,130,246,0.4)] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? `Testing ${dbType === "postgres" ? "PostgreSQL" : "MySQL"} connection...` : "Connect Target Database"}
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
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                AI Model Provider
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: "gemini", label: "Gemini", sub: "Google" },
                  { id: "openai", label: "GPT-4o", sub: "OpenAI" },
                  { id: "anthropic", label: "Claude", sub: "Anthropic" },
                  { id: "deepseek", label: "DeepSeek", sub: "DeepSeek AI" },
                  { id: "qwen", label: "Qwen", sub: "Alibaba" },
                ] as const).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setLlmProvider(p.id)}
                    className={`py-2.5 px-3 rounded-lg text-xs font-semibold border transition-all text-left ${
                      llmProvider === p.id
                        ? "bg-blue-600/20 border-blue-500/60 text-blue-400"
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
              <label htmlFor="llmModel" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Model Name <span className="text-slate-600 normal-case font-normal">(optional override)</span>
              </label>
              <input
                id="llmModel"
                type="text"
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                placeholder={llmProvider === "openai" ? "gpt-4o" : llmProvider === "anthropic" ? "claude-3-5-sonnet-20241022" : llmProvider === "deepseek" ? "deepseek-chat" : llmProvider === "qwen" ? "qwen-plus" : "gemini-2.5-flash"}
                className="w-full px-4 py-3 rounded-lg glass-input text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Leave blank to use the recommended default model for the selected provider.
              </p>
            </div>

            <div>
              <label htmlFor="apiKeyInput" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                {llmProvider === "gemini" ? "GEMINI_API_KEY" : llmProvider === "openai" ? "OPENAI_API_KEY" : llmProvider === "anthropic" ? "ANTHROPIC_API_KEY" : llmProvider === "deepseek" ? "DEEPSEEK_API_KEY" : "DASHSCOPE_API_KEY"}
                <span className="text-slate-600 normal-case font-normal ml-1">(Leave blank if set in backend environment)</span>
              </label>
              <input
                id="apiKeyInput"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={llmProvider === "gemini" ? "AIzaSy..." : llmProvider === "openai" ? "sk-..." : llmProvider === "anthropic" ? "sk-ant-..." : "Enter API key"}
                className="w-full px-4 py-3 rounded-lg glass-input text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Required to generate code embeddings and execute the agent thought processes.
              </p>
            </div>

            <div className="glass-panel p-5 rounded-lg border border-white/5 space-y-4">
              <h3 className="text-sm font-semibold text-white">Pipeline Sync Progress</h3>
              
              <div className="space-y-3">
                {/* Scan Status */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-2">
                    {syncStatus === "cloning" || syncStatus === "parsing" ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                    ) : syncStatus === "linked" ? (
                      <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                    )}
                    1. Code Parsing & AST Mapping
                  </span>
                  <span className="font-semibold text-slate-300 capitalize">{syncStatus === "idle" ? "Pending" : syncStatus === "linked" ? "Success" : syncStatus === "failed" ? "Failed" : "Running..."}</span>
                </div>

                {/* Vector DB Status */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-2">
                    {syncStatus === "parsing" ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                    ) : syncStatus === "linked" ? (
                      <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                    )}
                    2. Vectorizing Codebase (ChromaDB)
                  </span>
                  <span className="font-semibold text-slate-300">
                    {syncStatus === "linked" ? `${indexedChunks} chunks` : syncStatus === "parsing" ? "Generating..." : "Pending"}
                  </span>
                </div>

                {/* DB Schema Extraction */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-2">
                    {syncStatus === "linked" ? (
                      <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                    )}
                    3. Target DB Schema & Relationships Linked
                  </span>
                  <span className="font-semibold text-slate-300">{syncStatus === "linked" ? "Synced" : "Pending"}</span>
                </div>
              </div>
            </div>

            {syncStatus === "linked" ? (
              <div className="flex items-center justify-center gap-2 text-sm text-emerald-400 bg-emerald-950/20 border border-emerald-500/20 p-3 rounded-lg animate-pulse">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                ZeroTicket is armed and ready! Redirecting...
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
                  className="px-6 py-3 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 font-semibold text-sm transition-all disabled:opacity-50"
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
    </div>
  );
}
