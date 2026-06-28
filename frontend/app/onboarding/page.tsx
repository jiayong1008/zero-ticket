"use client";

import React, { useState, useEffect, Suspense } from "react";
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
      let activeCompanyId = companyId;

      const attemptConnect = async (cid: string) => {
        return fetch(`${BACKEND_URL}/api/repository/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
            headers: { "Content-Type": "application/json" },
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
      
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || "Ingestion process failed. Verify repository path and try again.");
      }
      
      // Start polling project status from backend
      const pollInterval = setInterval(() => {
        fetch(`${BACKEND_URL}/api/company/projects?company_id=${companyId}`)
          .then((r) => r.json())
          .then((projects: any[]) => {
            if (Array.isArray(projects)) {
              const active = projects.find((p) => p.repository_id === repositoryId);
              if (active) {
                setSyncStatus(active.sync_status);
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
                  setError("Ingestion process failed. Verify repository path or check backend logs.");
                }
              }
            }
          })
          .catch(() => {});
      }, 2000);

    } catch (err: any) {
      setSyncStatus("failed");
      setError(err.message || "An error occurred during ingestion");
      setLoading(false);
    }
  };


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
                  placeholder="e.g. EduKids Web Portal"
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
                  placeholder="e.g. /Users/jiayong/GitHub/edukids-web"
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
                      placeholder="e.g. edukids_db"
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
              <label htmlFor="llmModel" className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                isLightMode ? "text-slate-600" : "text-slate-400"
              }`}>
                Model Name <span className={`normal-case font-normal ${
                  isLightMode ? "text-slate-400" : "text-slate-600"
                }`}>(optional override)</span>
              </label>
              <input
                id="llmModel"
                type="text"
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                placeholder={llmProvider === "openai" ? "gpt-4o" : llmProvider === "anthropic" ? "claude-3-5-sonnet-20241022" : llmProvider === "deepseek" ? "deepseek-chat" : llmProvider === "qwen" ? "qwen-plus" : "gemini-2.5-flash"}
                className="w-full px-4 py-3 rounded-lg glass-input text-sm"
              />
              <p className={`mt-1 text-xs ${isLightMode ? "text-slate-400" : "text-slate-500"}`}>
                Leave blank to use the recommended default model for the selected provider.
              </p>
            </div>

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
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
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
                    {syncStatus === "cloning" || syncStatus === "parsing" ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                    ) : syncStatus === "linked" ? (
                      <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <div className={`w-2.5 h-2.5 rounded-full ${isLightMode ? "bg-slate-300" : "bg-slate-700"}`} />
                    )}
                    1. Code Parsing & AST Mapping
                  </span>
                  <span className={`font-semibold capitalize ${isLightMode ? "text-slate-700" : "text-slate-300"}`}>{syncStatus === "idle" ? "Pending" : syncStatus === "linked" ? "Success" : syncStatus === "failed" ? "Failed" : "Running..."}</span>
                </div>

                {/* Vector DB Status */}
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
                    {syncStatus === "linked" ? `${indexedChunks} chunks` : syncStatus === "parsing" ? "Generating..." : "Pending"}
                  </span>
                </div>

                {/* DB Schema Extraction */}
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
                  <span className={`font-semibold ${isLightMode ? "text-slate-700" : "text-slate-300"}`}>{syncStatus === "linked" ? "Synced" : "Pending"}</span>
                </div>
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
