import io
import os
import re
import shutil
import tarfile

import requests

_GITHUB_URL_RE = re.compile(r'^(?:https?://)?(?:www\.)?github\.com/([^/\s]+)/([^/\s]+)')
_SHORTHAND_RE = re.compile(r'^[\w.-]+/[\w.-]+$')


def resolve_repo_path(repo_ref: str, branch: str, repository_id: str, github_token: str = None) -> str:
    """
    Resolve a repo_name value (stored verbatim from onboarding) into a local
    directory CodeParser can walk. Local filesystem paths pass through
    unchanged (only valid when the backend itself runs on localhost). GitHub
    URLs / "owner/repo" shorthand are fetched as a tarball -- no git binary
    required, since the Vercel Python runtime doesn't guarantee one exists.
    Supports optional github_token for private repositories.
    """
    repo_ref = (repo_ref or "").strip()
    owner_repo = _extract_owner_repo(repo_ref)
    if owner_repo is None:
        if not os.path.exists(repo_ref):
            raise ValueError(f"Repository directory does not exist: '{repo_ref}'")
        return repo_ref

    owner, repo = owner_repo
    return _download_github_tarball(owner, repo, branch, repository_id, github_token=github_token)


def _extract_owner_repo(repo_ref: str):
    m = _GITHUB_URL_RE.match(repo_ref)
    if m:
        owner, repo = m.group(1), m.group(2)
        if repo.endswith(".git"):
            repo = repo[:-4]
        return owner, repo

    # Bare "owner/repo" shorthand -- only treat as GitHub if it isn't an
    # actual local path that happens to exist (relevant for local dev).
    if _SHORTHAND_RE.match(repo_ref) and not os.path.isabs(repo_ref) and not os.path.exists(repo_ref):
        owner, repo = repo_ref.split("/", 1)
        return owner, repo

    return None


def _download_github_tarball(owner: str, repo: str, branch: str, repository_id: str, github_token: str = None) -> str:
    dest_root = f"/tmp/zeroticket_repos/{repository_id}"
    if os.path.exists(dest_root):
        shutil.rmtree(dest_root, ignore_errors=True)
    os.makedirs(dest_root, exist_ok=True)

    token = (github_token or "").strip() or os.environ.get("GITHUB_TOKEN", "").strip() or os.environ.get("GITHUB_PAT", "").strip()

    branches_to_try = [b for b in [(branch or "").strip(), "main", "master"] if b]
    # de-dupe while preserving order
    seen = set()
    branches_to_try = [b for b in branches_to_try if not (b in seen or seen.add(b))]

    last_error = "unknown error"
    for candidate_branch in branches_to_try:
        urls_to_try = [
            f"https://api.github.com/repos/{owner}/{repo}/tarball/{candidate_branch}",
            f"https://codeload.github.com/{owner}/{repo}/tar.gz/refs/heads/{candidate_branch}",
        ]

        for url in urls_to_try:
            headers = {
                "User-Agent": "ZeroTicket-Repo-Fetcher",
                "Accept": "application/vnd.github+json"
            }
            if token and "api.github.com" in url:
                headers["Authorization"] = f"Bearer {token}"

            try:
                resp = requests.get(url, headers=headers, timeout=30, allow_redirects=True)
            except requests.RequestException as e:
                last_error = f"network error fetching '{candidate_branch}': {e}"
                continue

            if resp.status_code == 404:
                last_error = f"branch '{candidate_branch}' not found (or repository is private/doesn't exist)"
                continue
            if resp.status_code in (401, 403):
                last_error = f"GitHub HTTP {resp.status_code}: Bad credentials or missing read access to private repo '{owner}/{repo}'"
                continue
            if resp.status_code != 200:
                last_error = f"HTTP {resp.status_code} fetching '{candidate_branch}'"
                continue

            try:
                with tarfile.open(fileobj=io.BytesIO(resp.content), mode="r:gz") as tar:
                    tar.extractall(dest_root, filter="data")
            except Exception as e:
                last_error = f"failed to unpack archive for '{candidate_branch}': {e}"
                continue

            extracted_dirs = [
                d for d in os.listdir(dest_root) if os.path.isdir(os.path.join(dest_root, d))
            ]
            if not extracted_dirs:
                last_error = f"tarball for '{candidate_branch}' was empty"
                continue

            return os.path.join(dest_root, extracted_dirs[0])

    raise ValueError(
        f"Could not fetch '{owner}/{repo}' from GitHub (tried branches: {', '.join(branches_to_try)}). "
        f"If this is a private repository, ensure a valid GitHub Personal Access Token (PAT) with read access is provided. "
        f"Last error: {last_error}"
    )
