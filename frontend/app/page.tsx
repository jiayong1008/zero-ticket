"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, prism } from 'react-syntax-highlighter/dist/esm/styles/prism';

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
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmModel, setLlmModel] = useState("llama3");
  const [llmBaseUrl, setLlmBaseUrl] = useState("http://localhost:11434/v1");
  const [selectedPresetModel, setSelectedPresetModel] = useState("gemini-2.5-flash");

  const geminiPresets = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.5-pro", "gemini-1.5-pro"];
  const openaiPresets = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"];
  const customPresets = ["gemma2", "llama3", "mistral"];

  const [isEditingLLM, setIsEditingLLM] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLightMode, setIsLightMode] = useState(false);

  // AI Context Rules states
  const [contextRules, setContextRules] = useState("");
  const [isSavingRules, setIsSavingRules] = useState(false);
  const [isLoadingRules, setIsLoadingRules] = useState(false);

  // Onboarding questions states
  interface OnboardingQuestion {
    id: string;
    question: string;
    options: string[];
    answer: string | null;
    is_answered: boolean;
    context_key: string;
  }
  const [onboardingQuestions, setOnboardingQuestions] = useState<OnboardingQuestion[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState("");
  const [writeInAnswer, setWriteInAnswer] = useState("");
  const [isSubmittingOnboarding, setIsSubmittingOnboarding] = useState(false);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);

  // Admin lock states
  const [loginRequired, setLoginRequired] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [loginPassphrase, setLoginPassphrase] = useState("");
  const [loginError, setLoginError] = useState("");
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [showLlmKey, setShowLlmKey] = useState(false);

  // Confirm Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const BACKEND_URL = "http://localhost:8088";

  const loadProjects = (targetCompanyId: string, token: string) => {
    const headers: Record<string, string> = {};
    const actToken = token || localStorage.getItem("admin_token") || "";
    if (actToken) {
      headers["X-Admin-Token"] = actToken;
    }
    fetch(`http://localhost:8088/api/company/projects?company_id=${targetCompanyId}`, { headers })
      .then((r) => {
        if (!r.ok) {
          if (r.status === 401) {
            setAdminToken("");
            setLoginRequired(true);
          }
          throw new Error("Failed to load projects");
        }
        return r.json();
      })
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
      .catch(() => {})
      .finally(() => setIsLoadingProjects(false));
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
    const repoLinked = localStorage.getItem("repo_linked");

    if (!savedCompanyId || repoLinked !== "true") {
      router.push("/onboarding");
      return;
    }

    setCompanyId(savedCompanyId);
    setCompanyName(localStorage.getItem("company_name") || "Developer Account");
    setApiKey(localStorage.getItem("api_key") || "zt_secret_key");
    setRepoPath(localStorage.getItem("repo_path") || "");
    setRepoBranch(localStorage.getItem("repo_branch") || "main");
    setDbHost(localStorage.getItem("db_host") || "");
    setDbName(localStorage.getItem("db_name") || "");
    setDbType(localStorage.getItem("db_type") || "mysql");
    setLlmProvider(localStorage.getItem("llm_provider") || "gemini");
    setLlmApiKey(localStorage.getItem("llm_api_key") || localStorage.getItem("gemini_api_key") || "");
    setLlmModel(localStorage.getItem("llm_model") || "llama3");
    setLlmBaseUrl(localStorage.getItem("llm_base_url") || "http://localhost:11434/v1");
    const savedRepoId = localStorage.getItem("repository_id") || "";
    setActiveRepoId(savedRepoId);

    // Check admin status first
    fetch("http://localhost:8088/api/admin/status")
      .then((r) => r.json())
      .then((statusData) => {
        if (statusData.login_required) {
          const savedToken = localStorage.getItem("admin_token");
          if (!savedToken) {
            setLoginRequired(true);
          } else {
            setAdminToken(savedToken);
            loadProjects(savedCompanyId, savedToken);
          }
        } else {
          loadProjects(savedCompanyId, "");
        }
      })
      .catch(() => {
        loadProjects(savedCompanyId, "");
      });
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

  // Fetch rules whenever the active repository changes
  useEffect(() => {
    if (!activeRepoId) {
      setContextRules("");
      return;
    }
    
    setIsLoadingRules(true);
    const headers: Record<string, string> = {};
    const token = adminToken || localStorage.getItem("admin_token") || "";
    if (token) {
      headers["X-Admin-Token"] = token;
    }

    fetch(`${BACKEND_URL}/api/repository/${activeRepoId}/rules`, { headers })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load rules");
        return r.json();
      })
      .then((data) => {
        setContextRules(data.rules || "");
      })
      .catch((err) => {
        console.error("Error loading rules:", err);
      })
      .finally(() => setIsLoadingRules(false));
  }, [activeRepoId, adminToken]);

  // Fetch onboarding questions whenever the active repository changes
  useEffect(() => {
    if (!activeRepoId) {
      setOnboardingQuestions([]);
      return;
    }

    setIsLoadingQuestions(true);
    const headers: Record<string, string> = {};
    const token = adminToken || localStorage.getItem("admin_token") || "";
    if (token) {
      headers["X-Admin-Token"] = token;
    }

    fetch(`${BACKEND_URL}/api/repository/${activeRepoId}/onboarding-questions`, { headers })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load questions");
        return r.json();
      })
      .then((data) => {
        const unanswered = (data || []).filter((q: any) => !q.is_answered);
        setOnboardingQuestions(unanswered);
        setCurrentQuestionIdx(0);
        setSelectedOption("");
        setWriteInAnswer("");
      })
      .catch((err) => {
        console.error("Error loading onboarding questions:", err);
      })
      .finally(() => setIsLoadingQuestions(false));
  }, [activeRepoId, adminToken]);

  const handleNextQuestion = () => {
    if (onboardingQuestions.length === 0) return;
    const currentQ = onboardingQuestions[currentQuestionIdx];
    const finalAns = selectedOption === "Other / Write-in..." || currentQ.options.length === 0
      ? writeInAnswer
      : selectedOption;

    const updatedQuestions = [...onboardingQuestions];
    updatedQuestions[currentQuestionIdx].answer = finalAns || "Skipped";
    setOnboardingQuestions(updatedQuestions);

    if (currentQuestionIdx < onboardingQuestions.length - 1) {
      setCurrentQuestionIdx((prev) => prev + 1);
      setSelectedOption("");
      setWriteInAnswer("");
    } else {
      // It was the last question, submit all answers!
      setIsSubmittingOnboarding(true);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token = adminToken || localStorage.getItem("admin_token") || "";
      if (token) {
        headers["X-Admin-Token"] = token;
      }

      const answersToSend = updatedQuestions.map((q) => ({
        id: q.id,
        answer: q.answer || "Skipped"
      }));

      fetch(`${BACKEND_URL}/api/repository/${activeRepoId}/onboarding-questions/submit`, {
        method: "POST",
        headers,
        body: JSON.stringify({ answers: answersToSend }),
      })
        .then((r) => {
          if (!r.ok) throw new Error("Failed to submit answers");
          return r.json();
        })
        .then((data) => {
          toast.success("AI Context Guidelines tuned successfully!");
          setContextRules(data.rules || "");
          // Re-fetch questions to update answered status
          return fetch(`${BACKEND_URL}/api/repository/${activeRepoId}/onboarding-questions`, { headers });
        })
        .then((r) => r.json())
        .then((data) => {
          const unanswered = (data || []).filter((q: any) => !q.is_answered);
          setOnboardingQuestions(unanswered);
        })
        .catch((err) => {
          console.error("Error submitting onboarding answers:", err);
          toast.error("Failed to submit answers.");
        })
        .finally(() => setIsSubmittingOnboarding(false));
    }
  };

  const handleSkipQuestion = () => {
    if (onboardingQuestions.length === 0) return;
    const updatedQuestions = [...onboardingQuestions];
    updatedQuestions[currentQuestionIdx].answer = "Skipped";
    setOnboardingQuestions(updatedQuestions);

    if (currentQuestionIdx < onboardingQuestions.length - 1) {
      setCurrentQuestionIdx((prev) => prev + 1);
      setSelectedOption("");
      setWriteInAnswer("");
    } else {
      // It was the last question, submit all!
      setIsSubmittingOnboarding(true);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token = adminToken || localStorage.getItem("admin_token") || "";
      if (token) {
        headers["X-Admin-Token"] = token;
      }

      const answersToSend = updatedQuestions.map((q) => ({
        id: q.id,
        answer: q.answer || "Skipped"
      }));

      fetch(`${BACKEND_URL}/api/repository/${activeRepoId}/onboarding-questions/submit`, {
        method: "POST",
        headers,
        body: JSON.stringify({ answers: answersToSend }),
      })
        .then((r) => {
          if (!r.ok) throw new Error("Failed to submit answers");
          return r.json();
        })
        .then((data) => {
          toast.success("AI Context Guidelines saved!");
          setContextRules(data.rules || "");
          return fetch(`${BACKEND_URL}/api/repository/${activeRepoId}/onboarding-questions`, { headers });
        })
        .then((r) => r.json())
        .then((data) => {
          const unanswered = (data || []).filter((q: any) => !q.is_answered);
          setOnboardingQuestions(unanswered);
        })
        .catch((err) => {
          console.error("Error submitting onboarding:", err);
          toast.error("Failed to submit answers.");
        })
        .finally(() => setIsSubmittingOnboarding(false));
    }
  };

  const handleResetOnboarding = () => {
    if (!activeRepoId) return;
    setIsLoadingQuestions(true);
    const headers: Record<string, string> = {};
    const token = adminToken || localStorage.getItem("admin_token") || "";
    if (token) {
      headers["X-Admin-Token"] = token;
    }

    fetch(`${BACKEND_URL}/api/repository/${activeRepoId}/onboarding-questions/reset`, {
      method: "POST",
      headers,
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to trigger reset");
        toast.success("Regenerating onboarding questions in background...");
        // Poll for questions after 2 seconds
        setTimeout(() => {
          fetch(`${BACKEND_URL}/api/repository/${activeRepoId}/onboarding-questions`, { headers })
            .then((r) => r.json())
            .then((data) => {
              const unanswered = (data || []).filter((q: any) => !q.is_answered);
              setOnboardingQuestions(unanswered);
              setCurrentQuestionIdx(0);
              setSelectedOption("");
              setWriteInAnswer("");
              setIsLoadingQuestions(false);
            });
        }, 2500);
      })
      .catch((err) => {
        console.error("Error resetting onboarding:", err);
        toast.error("Failed to reset onboarding questions.");
        setIsLoadingQuestions(false);
      });
  };

  const handleSaveRules = () => {
    if (!activeRepoId) return;
    
    setIsSavingRules(true);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = adminToken || localStorage.getItem("admin_token") || "";
    if (token) {
      headers["X-Admin-Token"] = token;
    }

    fetch(`${BACKEND_URL}/api/repository/${activeRepoId}/rules`, {
      method: "POST",
      headers,
      body: JSON.stringify({ rules: contextRules }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to save rules");
        return r.json();
      })
      .then(() => {
        toast.success("AI Context Guidelines saved successfully!");
      })
      .catch((err) => {
        console.error("Error saving rules:", err);
        toast.error("Failed to save AI Context Guidelines.");
      })
      .finally(() => setIsSavingRules(false));
  };

  useEffect(() => {
    if (!mounted) return;
    if (llmProvider === "gemini") {
      if (geminiPresets.includes(llmModel)) {
        setSelectedPresetModel(llmModel);
      } else if (!llmModel) {
        setSelectedPresetModel("gemini-2.5-flash");
        setLlmModel("gemini-2.5-flash");
      } else {
        setSelectedPresetModel("other");
      }
    } else if (llmProvider === "openai") {
      if (openaiPresets.includes(llmModel)) {
        setSelectedPresetModel(llmModel);
      } else if (!llmModel) {
        setSelectedPresetModel("gpt-4o");
        setLlmModel("gpt-4o");
      } else {
        setSelectedPresetModel("other");
      }
    } else if (llmProvider === "custom") {
      if (customPresets.includes(llmModel)) {
        setSelectedPresetModel(llmModel);
      } else if (!llmModel) {
        setSelectedPresetModel("gemma2");
        setLlmModel("gemma2");
      } else {
        setSelectedPresetModel("other");
      }
    }
  }, [llmProvider, llmModel, mounted]);

  const handlePresetModelChange = (modelName: string) => {
    setSelectedPresetModel(modelName);
    if (modelName !== "other") {
      setLlmModel(modelName);
      localStorage.setItem("llm_model", modelName);
    } else {
      setLlmModel("");
      localStorage.setItem("llm_model", "");
    }
  };

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

  const handleSaveLLMConfig = async () => {
    try {
      const token = localStorage.getItem("admin_token") || "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["X-Admin-Token"] = token;
      
      const payload = {
        company_id: companyId,
        llm_provider: llmProvider,
        api_key: llmApiKey,
        llm_model: llmModel
      };
      
      const res = await fetch(`${BACKEND_URL}/api/company/save_llm_config`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        throw new Error("Failed to save LLM config to server");
      }
      
      setIsEditingLLM(false);
      toast.success("LLM Configuration Saved to Database!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save config");
    }
  };

  const handleTestWidget = async () => {
    try {
      const token = localStorage.getItem("admin_token") || "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["X-Admin-Token"] = token;
      
      const payload = {
        company_id: companyId,
        user_id: "2",
        tenant_id: "1"
      };
      
      const res = await fetch(`${BACKEND_URL}/api/admin/generate_jwt`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        throw new Error("Failed to generate test token");
      }
      
      const data = await res.json();
      window.open(`/widget?token=${data.token}`, '_blank');
    } catch (err: any) {
      toast.error(err.message || "Failed to generate test token");
    }
  };

  const handleSyncCodebase = async (forceResync = false) => {
    setSyncing(true);
    setError("");
    setSuccess("");
    setSyncStatus(forceResync ? "parsing" : "cloning");

    const token = localStorage.getItem("admin_token") || "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers["X-Admin-Token"] = token;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/ingest`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          company_id: companyId,
          repository_id: activeRepoId || undefined,
          llm_provider: llmProvider,
          api_key: llmApiKey,
          llm_base_url: llmBaseUrl,
          force_resync: forceResync,
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

  const handleCancelSync = async () => {
    const token = localStorage.getItem("admin_token") || "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers["X-Admin-Token"] = token;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/ingest/cancel`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          company_id: companyId,
          repository_id: activeRepoId,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || "Failed to cancel synchronization.");
      }

      setSyncing(false);
      setSyncStatus("failed");
      setSyncMessage("Cancelled");
      setSuccess("Synchronization cancelled successfully.");
    } catch (err: any) {
      setError(err.message || "An error occurred while cancelling sync.");
    }
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
      
      const savedCompanyId = localStorage.getItem("company_id") || "";
      loadProjects(savedCompanyId, data.token);
    } catch (err: any) {
      setLoginError(err.message || "Failed to login.");
    }
  };

  useEffect(() => {
    if (!syncing || !companyId || !activeRepoId) return;

    const interval = setInterval(() => {
      const token = localStorage.getItem("admin_token") || "";
      const headers: Record<string, string> = {};
      if (token) {
        headers["X-Admin-Token"] = token;
      }
      fetch(`${BACKEND_URL}/api/company/projects?company_id=${companyId}`, { headers })
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
    setConfirmModal({
      isOpen: true,
      title: "Reset Settings",
      message: "Are you sure you want to reset ZeroTicket onboarding details? This will clear local configurations.",
      confirmText: "Reset",
      isDestructive: true,
      onConfirm: () => {
        localStorage.clear();
        router.push("/onboarding");
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
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
                        localStorage.setItem("repo_name", proj.name || proj.repo_path.split("/").pop() || "");
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
        {isLoadingProjects ? (
          <>
            <div className={`rounded-xl p-5 border min-h-[250px] animate-pulse flex flex-col justify-between ${
              isLightMode ? "bg-slate-100 border-slate-200" : "bg-white/5 border-white/5"
            }`}>
              <div className="space-y-3">
                <div className={`h-2 w-16 rounded ${isLightMode ? "bg-slate-200" : "bg-white/10"}`}></div>
                <div className={`h-4 w-32 rounded ${isLightMode ? "bg-slate-200" : "bg-white/10"}`}></div>
                <div className="space-y-2 mt-4">
                  <div className={`h-3 w-3/4 rounded ${isLightMode ? "bg-slate-200" : "bg-white/10"}`}></div>
                  <div className={`h-3 w-1/2 rounded ${isLightMode ? "bg-slate-200" : "bg-white/10"}`}></div>
                </div>
              </div>
              <div className={`h-8 w-full rounded mt-6 ${isLightMode ? "bg-slate-200" : "bg-white/10"}`}></div>
            </div>
            
            <div className={`rounded-xl p-5 border min-h-[250px] animate-pulse flex flex-col justify-between ${
              isLightMode ? "bg-slate-100 border-slate-200" : "bg-white/5 border-white/5"
            }`}>
              <div className="space-y-3">
                <div className={`h-2 w-24 rounded ${isLightMode ? "bg-slate-200" : "bg-white/10"}`}></div>
                <div className={`h-4 w-28 rounded ${isLightMode ? "bg-slate-200" : "bg-white/10"}`}></div>
                <div className="space-y-2 mt-4">
                  <div className={`h-3 w-1/3 rounded ${isLightMode ? "bg-slate-200" : "bg-white/10"}`}></div>
                  <div className={`h-3 w-1/4 rounded ${isLightMode ? "bg-slate-200" : "bg-white/10"}`}></div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
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
              
              <div className={`mt-2 pt-2 border-t ${isLightMode ? "border-slate-200" : "border-white/10"}`}>
                <p className={`font-semibold ${isLightMode ? "text-slate-700" : "text-slate-300"} mb-1`}>GitHub Webhook:</p>
                <div className={`flex items-center gap-2 p-1.5 rounded border ${isLightMode ? "bg-slate-50 border-slate-200" : "bg-black/30 border-white/5"}`}>
                  <code className={`text-[9px] truncate flex-1 ${isLightMode ? "text-slate-600" : "text-slate-400"}`}>
                    /api/webhooks/github?repository_id={activeRepoId}
                  </code>
                  <button 
                    onClick={() => {
                      const url = `${window.location.origin}/api/webhooks/github?repository_id=${activeRepoId}`;
                      navigator.clipboard.writeText(url);
                      toast.success("Webhook URL copied to clipboard!");
                      setCopiedWebhook(true);
                      setTimeout(() => setCopiedWebhook(false), 2000);
                    }}
                    className={`p-1 rounded hover:bg-white/10 transition-colors flex items-center justify-center ${
                      copiedWebhook 
                        ? "text-emerald-500 hover:text-emerald-600" 
                        : isLightMode ? "text-slate-500 hover:text-slate-700" : "text-slate-400 hover:text-white"
                    }`}
                    title={copiedWebhook ? "Copied!" : "Copy Webhook URL"}
                  >
                    {copiedWebhook ? (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className={`text-[9px] mt-1.5 opacity-80 ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>
                  Webhook Secret: <code className="font-mono bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded">{activeRepoId}</code>
                </p>
              </div>
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
        </>
        )}

        {/* Platform API Details */}
        <div className={`rounded-xl p-5 border flex flex-col justify-between transition-all shadow-sm ${
          isLightMode ? "bg-white border-slate-200/80 shadow-slate-100" : "glass-panel border-white/5 shadow-black/45"
        }`}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] uppercase font-bold tracking-wider transition-colors ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>Developer API Keys</span>
              <button
                type="button"
                onClick={() => setIsEditingLLM(!isEditingLLM)}
                className={`text-[10px] font-semibold underline transition-colors ${
                  isLightMode ? "text-blue-600 hover:text-blue-700" : "text-blue-400 hover:text-blue-300"
                }`}
              >
                {isEditingLLM ? "Cancel" : "Edit LLM Config"}
              </button>
            </div>
            
            <h2 className={`text-sm font-bold transition-colors ${isLightMode ? "text-slate-800" : "text-white"}`}>{companyName}</h2>
            
            {isEditingLLM ? (
              <div className="space-y-2.5">
                <div>
                  <label className={`block text-[10px] font-bold uppercase mb-1 ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>AI Provider</label>
                  <select
                    value={llmProvider}
                    onChange={(e) => {
                      setLlmProvider(e.target.value);
                      localStorage.setItem("llm_provider", e.target.value);
                    }}
                    className={`w-full px-2 py-1 text-xs rounded border transition-colors ${
                      isLightMode 
                        ? "bg-slate-50 border-slate-200 text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none" 
                        : "bg-slate-950/60 border-white/5 text-slate-300 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    }`}
                  >
                    <option value="gemini">Gemini</option>
                    <option value="openai">OpenAI</option>
                    <option value="custom">Custom / Ollama</option>
                  </select>
                </div>
                <div className="space-y-2">
                  {llmProvider !== "custom" && (
                    <div>
                      <label className={`block text-[10px] font-bold uppercase mb-1 ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>LLM API Key</label>
                      <div className="relative">
                        <input
                          type={showLlmKey ? "text" : "password"}
                          value={llmApiKey}
                          onChange={(e) => {
                            setLlmApiKey(e.target.value);
                            localStorage.setItem("llm_api_key", e.target.value);
                            localStorage.setItem("gemini_api_key", e.target.value);
                          }}
                          placeholder={llmProvider === "gemini" ? "AIzaSy..." : "sk-..."}
                          className={`w-full pl-2 pr-8 py-1 text-xs rounded border transition-colors ${
                            isLightMode 
                              ? "bg-slate-50 border-slate-200 text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none" 
                              : "bg-slate-950/60 border-white/5 text-slate-300 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 outline-none"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowLlmKey(!showLlmKey)}
                          className={`absolute right-2 top-1/2 -translate-y-1/2 transition-colors ${
                            isLightMode ? "text-slate-400 hover:text-slate-600" : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          {showLlmKey ? (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0a10.05 10.05 0 015.71-1.581c4.478 0 8.268 2.943 9.543 7a9.97 9.97 0 01-1.563 3.029m-5.858-.908a3 3 0 00-4.243-4.243M9.878 9.878L14.12 14.12" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className={`block text-[10px] font-bold uppercase mb-1 ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>
                      Model Name
                    </label>
                    <select
                      value={selectedPresetModel}
                      onChange={(e) => handlePresetModelChange(e.target.value)}
                      className={`w-full px-2 py-1 text-xs rounded border transition-colors ${
                        selectedPresetModel === "other" ? "mb-1.5" : ""
                      } ${
                        isLightMode 
                          ? "bg-slate-50 border-slate-200 text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none" 
                          : "bg-slate-950/60 border-white/5 text-slate-300 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 outline-none"
                      }`}
                    >
                      {llmProvider === "gemini" && (
                        <>
                          <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                          <option value="gemini-2.5-flash">Gemini 2.5 Flash (Default)</option>
                          <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                          <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                          <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                        </>
                      )}
                      {llmProvider === "openai" && (
                        <>
                          <option value="gpt-4o">GPT-4o (Default)</option>
                          <option value="gpt-4o-mini">GPT-4o Mini</option>
                          <option value="gpt-4-turbo">GPT-4 Turbo</option>
                        </>
                      )}
                      {llmProvider === "custom" && (
                        <>
                          <option value="gemma2">Gemma 2 (Default)</option>
                          <option value="llama3">Llama 3</option>
                          <option value="mistral">Mistral</option>
                        </>
                      )}
                      <option value="other">Custom Model Name...</option>
                    </select>

                    {selectedPresetModel === "other" && (
                      <input
                        type="text"
                        value={llmModel}
                        onChange={(e) => {
                          setLlmModel(e.target.value);
                          localStorage.setItem("llm_model", e.target.value);
                        }}
                        placeholder="Type custom model name (e.g. models/gemini-2.5-flash)..."
                        className={`w-full px-2 py-1 text-xs rounded border transition-colors ${
                          isLightMode 
                            ? "bg-slate-50 border-slate-200 text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none" 
                            : "bg-slate-950/60 border-white/5 text-slate-300 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 outline-none"
                        }`}
                        required
                      />
                    )}
                  </div>

                  {llmProvider === "custom" && (
                    <div>
                      <label className={`block text-[10px] font-bold uppercase mb-1 ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>Custom Base URL</label>
                      <input
                        type="text"
                        value={llmBaseUrl}
                        onChange={(e) => {
                          setLlmBaseUrl(e.target.value);
                          localStorage.setItem("llm_base_url", e.target.value);
                        }}
                        placeholder="http://localhost:11434/v1"
                        className={`w-full px-2 py-1 text-xs rounded border transition-colors ${
                          isLightMode 
                            ? "bg-slate-50 border-slate-200 text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none" 
                            : "bg-slate-950/60 border-white/5 text-slate-300 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 outline-none"
                        }`}
                      />
                    </div>
                  )}

                  {llmProvider === "custom" && (
                    <p className="text-[9px] text-slate-500 italic mt-0.5">
                      Routes requests to your custom local LLM server endpoint.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleSaveLLMConfig}
                  className="w-full py-1 text-[10px] font-bold bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded transition-all"
                >
                  Save Config
                </button>
              </div>
            ) : (
              <div className={`text-xs space-y-1 transition-colors ${isLightMode ? "text-slate-600" : "text-slate-400"}`}>
                <p>API Key: <code className={`px-1 py-0.5 rounded text-[10px] ${isLightMode ? "bg-slate-100 text-slate-700" : "bg-white/5 text-slate-300"}`}>{apiKey.substring(0, 8)}...</code></p>
                <p>Company ID: <code className={`px-1 py-0.5 rounded text-[10px] ${isLightMode ? "bg-slate-100 text-slate-700" : "bg-white/5 text-slate-300"}`}>{companyId.substring(0, 8)}...</code></p>
                <p>AI Provider: <span className={`font-semibold capitalize ${isLightMode ? "text-slate-700" : "text-slate-300"}`}>{llmProvider}</span></p>
                {llmProvider === "custom" ? (
                  <p>Custom Model: <code className={`px-1 py-0.5 rounded text-[10px] ${isLightMode ? "bg-slate-100 text-slate-700" : "bg-white/5 text-slate-300"}`}>{llmModel || "llama3"}</code></p>
                ) : (
                  <p>LLM API Key: <code className={`px-1 py-0.5 rounded text-[10px] ${isLightMode ? "bg-slate-100 text-slate-700" : "bg-white/5 text-slate-300"}`}>
                    {llmApiKey ? (llmApiKey.length > 12 ? `${llmApiKey.substring(0, 6)}...${llmApiKey.substring(llmApiKey.length - 4)}` : `${llmApiKey.substring(0, 4)}...`) : "None"}
                  </code></p>
                )}
              </div>
            )}
          </div>
          
          <div className="mt-4 flex flex-col gap-2">
            {syncing ? (
              <button
                type="button"
                onClick={handleCancelSync}
                className="w-full py-2 bg-red-600 hover:bg-red-500 active:scale-95 transition-all text-xs font-semibold text-white rounded-lg flex items-center justify-center gap-1.5 shadow-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel Synchronization
              </button>
            ) : (
              <div className="flex gap-2 w-full">
                <button
                  onClick={() => handleSyncCodebase(false)}
                  className={`flex-1 py-2 transition-all active:scale-95 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 ${
                    isLightMode 
                      ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-250 shadow-sm" 
                      : "bg-white/5 hover:bg-white/10 text-slate-200"
                  }`}
                >
                  Sync Codebase
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setConfirmModal({
                      isOpen: true,
                      title: "Clean Resync",
                      message: "Are you sure you want to clear the vector database index and perform a clean resync for this project? This will re-index all codebase files.",
                      confirmText: "Clean Resync",
                      isDestructive: true,
                      onConfirm: () => {
                        handleSyncCodebase(true);
                        setConfirmModal(prev => ({ ...prev, isOpen: false }));
                      }
                    });
                  }}
                  title="Clear vector index and sync from scratch"
                  className={`px-3 py-2 transition-all active:scale-95 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 border border-red-500/30 hover:border-red-500/50 ${
                    isLightMode 
                      ? "bg-red-50 hover:bg-red-100 text-red-700 shadow-sm" 
                      : "bg-red-500/10 hover:bg-red-500/20 text-red-200"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clean Resync
                </button>
              </div>
            )}
            {!isLoadingProjects && projects.length === 0 && (
              <button
                onClick={() => router.push("/onboarding?step=2")}
                className={`w-full py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 border transition-all active:scale-95 ${
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

      {/* AI Onboarding discovery questionnaire card */}
      {activeRepoId && onboardingQuestions.length > 0 && onboardingQuestions.some(q => !q.is_answered) && (
        <div className={`rounded-xl p-5 border flex flex-col gap-4 transition-all shadow-sm ${
          isLightMode ? "bg-white border-slate-200/80 shadow-slate-100" : "glass-panel border-white/5 shadow-black/45"
        }`}>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-blue-500">
                AI Onboarding Assistant
              </span>
              <h2 className={`text-sm font-bold transition-colors ${isLightMode ? "text-slate-800" : "text-white"}`}>
                ZeroTicket Setup Discovery
              </h2>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
              isLightMode ? "bg-slate-100 text-slate-600" : "bg-white/5 text-slate-300"
            }`}>
              Question {currentQuestionIdx + 1} of {onboardingQuestions.length}
            </span>
          </div>

          {isLoadingQuestions ? (
            <div className="h-32 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-3 py-2">
                <p className={`text-xs font-semibold ${isLightMode ? "text-slate-700" : "text-slate-200"}`}>
                  {onboardingQuestions[currentQuestionIdx]?.question}
                </p>

                {/* If options exist, render MCQs */}
                {onboardingQuestions[currentQuestionIdx]?.options && onboardingQuestions[currentQuestionIdx].options.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {onboardingQuestions[currentQuestionIdx].options.map((opt: string) => (
                      <button
                        key={opt}
                        onClick={() => {
                          setSelectedOption(opt);
                          if (opt !== "Other / Write-in...") setWriteInAnswer("");
                        }}
                        className={`p-3 text-left text-xs rounded-lg border transition-all active:scale-[0.98] ${
                          selectedOption === opt
                            ? "border-blue-500 bg-blue-500/10 text-blue-500 font-medium"
                            : isLightMode
                              ? "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
                              : "border-white/5 bg-white/5 hover:bg-white/10 text-slate-300"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                ) : null}

                {/* If "Other / Write-in..." selected, or if no options are present, show text area */}
                {(selectedOption === "Other / Write-in..." || !onboardingQuestions[currentQuestionIdx]?.options || onboardingQuestions[currentQuestionIdx]?.options.length === 0) && (
                  <textarea
                    value={writeInAnswer}
                    onChange={(e) => setWriteInAnswer(e.target.value)}
                    placeholder="Type your response or details here..."
                    className={`w-full h-20 px-3 py-2 text-xs rounded-lg border transition-colors outline-none resize-none ${
                      isLightMode
                        ? "bg-slate-50 border-slate-200 text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        : "bg-slate-950/60 border-white/5 text-slate-300 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
                    }`}
                  />
                )}
              </div>

              <div className="flex items-center justify-between border-t border-slate-200/20 pt-4">
                <button
                  onClick={handleSkipQuestion}
                  disabled={isSubmittingOnboarding}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 ${
                    isLightMode ? "text-slate-500 hover:bg-slate-150" : "text-slate-400 hover:bg-white/5"
                  }`}
                >
                  Skip Question
                </button>

                <button
                  onClick={handleNextQuestion}
                  disabled={
                    isSubmittingOnboarding || 
                    (!selectedOption && onboardingQuestions[currentQuestionIdx]?.options && onboardingQuestions[currentQuestionIdx].options.length > 0) ||
                    ((selectedOption === "Other / Write-in..." || !onboardingQuestions[currentQuestionIdx]?.options || onboardingQuestions[currentQuestionIdx]?.options.length === 0) && !writeInAnswer.trim())
                  }
                  className={`px-4 py-1.5 text-[11px] font-bold rounded-lg transition-all active:scale-95 shadow-sm bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isSubmittingOnboarding ? "Saving..." : currentQuestionIdx === onboardingQuestions.length - 1 ? "Finish & Apply" : "Next Question"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* AI Context Rules / Knowledge Base Section */}
      {activeRepoId && (
        <div className={`rounded-xl p-5 border flex flex-col gap-4 transition-all shadow-sm ${
          isLightMode ? "bg-white border-slate-200/80 shadow-slate-100" : "glass-panel border-white/5 shadow-black/45"
        }`}>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <span className={`text-[10px] uppercase font-bold tracking-wider transition-colors ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>
                Knowledge Base & Tuning
              </span>
              <h2 className={`text-sm font-bold transition-colors ${isLightMode ? "text-slate-800" : "text-white"}`}>
                Custom AI Context Guidelines
              </h2>
            </div>
            
            <div className="flex items-center gap-4">
              <p className={`text-[11px] max-w-xs text-right transition-colors ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>
                Specify log paths, database mappings, error resolutions, and logic in <code>ai_context_rules.txt</code>.
              </p>
              <button
                onClick={handleResetOnboarding}
                disabled={isLoadingQuestions}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border transition-all active:scale-95 flex items-center gap-1.5 shadow-sm ${
                  isLightMode
                    ? "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                    : "border-white/10 bg-white/5 hover:bg-white/10 text-slate-200"
                }`}
                title="Force re-generate onboarding clarification questions from project files & database schema."
              >
                <svg className="w-3.5 h-3.5 animate-duration-1000" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                Re-run AI Discovery
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {isLoadingRules ? (
              <div className="h-32 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              </div>
            ) : (
              <div className="relative">
                <textarea
                  value={contextRules}
                  onChange={(e) => setContextRules(e.target.value)}
                  maxLength={3500}
                  placeholder={"Example:\n- The primary server log is located at 'server.log'.\n- Each User ID is mapped to a contact number. You can extract it from the log if needed.\n- When payment is ACH and status is pending, it takes 3 business days to clear."}
                  className={`w-full h-36 px-3 py-2 pb-6 text-xs font-mono rounded-lg border transition-colors outline-none resize-y ${
                    isLightMode
                      ? "bg-slate-50 border-slate-200 text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      : "bg-slate-950/60 border-white/5 text-slate-300 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
                  }`}
                />
                <span className={`absolute bottom-2.5 right-3 text-[9px] font-semibold tracking-wide ${
                  contextRules.length >= 3200 
                    ? "text-rose-500 font-bold" 
                    : isLightMode ? "text-slate-400" : "text-slate-500"
                }`}>
                  {contextRules.length} / 3,500 chars
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className={isLightMode ? "text-slate-500" : "text-slate-400"}>
              Guidelines will be automatically read on every support query.
            </span>
            <button
              onClick={handleSaveRules}
              disabled={isSavingRules || isLoadingRules}
              className={`px-4 py-1.5 text-[11px] font-bold rounded-lg transition-all active:scale-95 shadow-sm flex items-center gap-1.5 ${
                isSavingRules 
                  ? "bg-slate-500 text-slate-200 cursor-not-allowed" 
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              {isSavingRules ? (
                <>
                  <div className="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  Save Guidelines
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Integration Code Blocks Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className={`text-sm font-bold uppercase tracking-wider transition-colors ${isLightMode ? "text-slate-600" : "text-slate-400"}`}>
            Widget Embedding Guide
          </h2>
          <button
            onClick={handleTestWidget}
            className="px-4 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-full transition-all shadow-md flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Test Live Widget
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Frontend Embedding code */}
          <div className={`p-5 rounded-xl border space-y-3 transition-all ${
            isLightMode ? "bg-white border-slate-200/80 shadow-sm shadow-slate-100" : "glass-panel border-white/5 shadow-md shadow-black/45"
          }`}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className={`text-xs font-bold transition-colors ${isLightMode ? "text-slate-800" : "text-white"}`}>1. Embed Iframe Widget</h3>
                <p className={`text-[11px] transition-colors ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>Embed this iframe in your website. Ensure you pass the signed JWT token in search parameters.</p>
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(embedCode);
                  toast.success("Copied to clipboard!");
                }}
                className={`p-1.5 rounded transition-colors ${isLightMode ? "bg-slate-100 hover:bg-slate-200 text-slate-500" : "bg-white/5 hover:bg-white/10 text-slate-400"}`}
                title="Copy code"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            
            <div className={`border rounded-lg text-[10px] overflow-hidden transition-colors ${
              isLightMode ? "border-slate-200" : "border-white/5"
            }`}>
              <SyntaxHighlighter 
                language="html" 
                style={isLightMode ? prism : vscDarkPlus}
                customStyle={{ margin: 0, padding: '12px', background: 'transparent' }}
              >
                {embedCode}
              </SyntaxHighlighter>
            </div>
          </div>

          {/* Backend JWT sign code */}
          <div className={`p-5 rounded-xl border space-y-3 transition-all ${
            isLightMode ? "bg-white border-slate-200/80 shadow-sm shadow-slate-100" : "glass-panel border-white/5 shadow-md shadow-black/45"
          }`}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className={`text-xs font-bold transition-colors ${isLightMode ? "text-slate-800" : "text-white"}`}>2. Generate JWT Token on Client Backend</h3>
                <p className={`text-[11px] transition-colors ${isLightMode ? "text-slate-500" : "text-slate-400"}`}>Sign user information using your ZeroTicket API key before rendering the support chat widget.</p>
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(backendSignCode);
                  toast.success("Copied to clipboard!");
                }}
                className={`p-1.5 rounded transition-colors ${isLightMode ? "bg-slate-100 hover:bg-slate-200 text-slate-500" : "bg-white/5 hover:bg-white/10 text-slate-400"}`}
                title="Copy code"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            
            <div className={`border rounded-lg text-[10px] overflow-hidden transition-colors ${
              isLightMode ? "border-slate-200" : "border-white/5"
            }`}>
              <SyntaxHighlighter 
                language="php" 
                style={isLightMode ? prism : vscDarkPlus}
                customStyle={{ margin: 0, padding: '12px', background: 'transparent' }}
              >
                {backendSignCode}
              </SyntaxHighlighter>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border transform transition-all scale-100 ${
            isLightMode ? "bg-white border-slate-200" : "bg-slate-900 border-slate-800"
          }`}>
            <div className={`p-5 border-b ${isLightMode ? "border-slate-100" : "border-slate-800"}`}>
              <h3 className={`text-lg font-bold ${isLightMode ? "text-slate-900" : "text-white"}`}>
                {confirmModal.title}
              </h3>
            </div>
            <div className="p-5">
              <p className={`text-sm ${isLightMode ? "text-slate-600" : "text-slate-400"}`}>
                {confirmModal.message}
              </p>
            </div>
            <div className={`p-4 flex justify-end gap-3 border-t ${isLightMode ? "bg-slate-50 border-slate-100" : "bg-slate-800/50 border-slate-800"}`}>
              <button
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  isLightMode 
                    ? "text-slate-600 hover:bg-slate-200/50" 
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                {confirmModal.cancelText || "Cancel"}
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className={`px-4 py-2 text-sm font-semibold rounded-lg text-white transition-colors shadow-sm ${
                  confirmModal.isDestructive
                    ? "bg-red-600 hover:bg-red-500"
                    : "bg-blue-600 hover:bg-blue-500"
                }`}
              >
                {confirmModal.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
