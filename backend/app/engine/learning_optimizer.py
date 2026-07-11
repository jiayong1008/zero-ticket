import os
import hashlib
from google import genai
from app.config import settings
from app.db import Company, decrypt_password

def optimize_and_save_context_rules(
    repository_path: str,
    user_correction: str,
    chat_history: list,
    company_id: str,
    db
) -> str:
    """
    Reads existing custom context rules, uses the company's LLM to merge and consolidate
    the new user correction in a token-aware/length-restricted format, and overwrites the rule file.
    """
    if not repository_path or not os.path.exists(repository_path):
        raise ValueError("Invalid repository path or directory does not exist.")

    # 1. Resolve existing rules
    rules_filepath = os.path.join(repository_path, "ai_context_rules.txt")
    existing_rules = ""
    if os.path.exists(rules_filepath):
        try:
            with open(rules_filepath, "r", encoding="utf-8", errors="ignore") as f:
                existing_rules = f.read().strip()
        except Exception as e:
            existing_rules = f"# Error reading existing rules: {str(e)}"

    # 2. Format chat history for context
    formatted_chat = []
    if chat_history:
        # Keep last 5 messages to save tokens and context
        for msg in chat_history[-5:]:
            sender = msg.get("sender", "user")
            content = msg.get("content", "")
            formatted_chat.append(f"{sender.upper()}: {content}")
    chat_context = "\n".join(formatted_chat)

    # 3. Resolve LLM client and key
    company = db.query(Company).filter(Company.id == company_id).first()
    api_key = ""
    provider = "gemini"
    model_name = "gemini-2.5-flash"

    if company:
        if company.encrypted_llm_api_key:
            try:
                api_key = decrypt_password(company.encrypted_llm_api_key)
            except Exception:
                pass
        provider = company.llm_provider or provider
        model_name = company.llm_model or model_name

    if not api_key:
        api_key = settings.GEMINI_API_KEY

    # 4. Construct prompt
    prompt = f"""You are the ZeroTicket Self-Tuning Context Optimizer.
Your task is to merge a new user-provided correction or codebase rule into the existing repository rules file (`ai_context_rules.txt`).

--- NEW CORRECTION FROM SUPPORT ENGINEER ---
{user_correction}

--- CONVERSATION CONTEXT ---
{chat_context}

--- EXISTING REPOSITORY GUIDELINES ---
{existing_rules if existing_rules else "(None yet - this is the first rule)"}

--- INSTRUCTIONS FOR MERGING ---
1. Consolidate and merge the new correction logically into the existing list.
2. Group similar concepts together to keep rules clean and structured.
3. Keep the rules clear, concise, and highly specific to database structures or custom business logic.
4. STRICT LENGTH BOUNDARY: The final rules file MUST NOT exceed 10 bullet points and MUST NOT exceed 3,500 characters. If it exceeds these limits, you must compress, merge, and prune older, less critical or redundant rules to prioritize the new correction.
5. Return ONLY the raw updated guidelines as plain text/markdown bullets. Do not include markdown code fences (like ```), headers, or conversational introductions. Just return the merged guidelines.
"""

    # 5. Call LLM to optimize rules
    merged_output = ""
    prov = (provider or "gemini").lower()

    try:
        if prov == "openai" and api_key:
            from openai import OpenAI
            client = OpenAI(api_key=api_key)
            response = client.chat.completions.create(
                model=model_name or "gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0
            )
            merged_output = response.choices[0].message.content or ""
        elif prov == "anthropic" and api_key:
            from anthropic import Anthropic
            client = Anthropic(api_key=api_key)
            response = client.messages.create(
                model=model_name or "claude-3-5-sonnet-20241022",
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0
            )
            merged_output = response.content[0].text or ""
        else:
            # Fallback to Gemini
            if not api_key:
                raise ValueError("No Gemini API key available for learning loop optimization.")
            client = genai.Client(api_key=api_key, http_options={'timeout': 30000})
            response = client.models.generate_content(
                model=model_name or "gemini-2.5-flash",
                contents=[prompt]
            )
            merged_output = response.text or ""
    except Exception as e:
        raise RuntimeError(f"LLM optimization failed: {str(e)}")

    # Clean up output (remove markdown code fences if LLM ignored instructions)
    cleaned_output = merged_output.strip()
    if cleaned_output.startswith("```"):
        # Remove first line of code block
        lines = cleaned_output.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        cleaned_output = "\n".join(lines).strip()

    # 6. Write back to disk
    try:
        with open(rules_filepath, "w", encoding="utf-8") as f:
            f.write(cleaned_output)
    except Exception as e:
        raise RuntimeError(f"Failed to write updated guidelines to disk: {str(e)}")

    # 7. Git commit the changes if it is a git repo
    git_dir = os.path.join(repository_path, ".git")
    if os.path.exists(git_dir):
        import subprocess
        try:
            subprocess.run(["git", "add", "ai_context_rules.txt"], cwd=repository_path, check=True, capture_output=True, timeout=10)
            commit_msg = "chore(ai): auto-update context guidelines via teach loop"
            # Set author details to avoid error if git config user.name is missing in some server envs
            env = os.environ.copy()
            env["GIT_AUTHOR_NAME"] = "ZeroTicket AI Engine"
            env["GIT_AUTHOR_EMAIL"] = "engine@zeroticket.ai"
            env["GIT_COMMITTER_NAME"] = "ZeroTicket AI Engine"
            env["GIT_COMMITTER_EMAIL"] = "engine@zeroticket.ai"
            subprocess.run(["git", "commit", "-m", commit_msg], cwd=repository_path, check=True, capture_output=True, env=env, timeout=10)
        except Exception as git_err:
            # Safe fallback: don't crash the API response if git commit fails (e.g. no changes, lock, etc.)
            print(f"Git auto-commit failed: {str(git_err)}")

    return cleaned_output
