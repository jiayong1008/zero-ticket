import io
import os
import re
import shutil
import tarfile

import requests

_GITHUB_URL_RE = re.compile(r'^(?:https?://)?(?:www\.)?github\.com/([^/\s]+)/([^/\s]+)')
_SHORTHAND_RE = re.compile(r'^[\w.-]+/[\w.-]+$')


def resolve_repo_path(repo_ref: str, branch: str, repository_id: str) -> str:
    """
    Resolve a repo_name value (stored verbatim from onboarding) into a local
    directory CodeParser can walk. Local filesystem paths pass through
    unchanged (only valid when the backend itself runs on localhost). GitHub
    URLs / "owner/repo" shorthand are fetched as a tarball -- no git binary
    required, since the Vercel Python runtime doesn't guarantee one exists.
    """
    repo_ref = (repo_ref or "").strip()
    owner_repo = _extract_owner_repo(repo_ref)
    if owner_repo is None:
        if not os.path.exists(repo_ref):
            raise ValueError(f"Repository directory does not exist: '{repo_ref}'")
        return repo_ref

    owner, repo = owner_repo
    return _download_github_tarball(owner, repo, branch, repository_id)


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


def _download_github_tarball(owner: str, repo: str, branch: str, repository_id: str) -> str:
    dest_root = f"/tmp/zeroticket_repos/{repository_id}"
    if os.path.exists(dest_root):
        shutil.rmtree(dest_root, ignore_errors=True)
    os.makedirs(dest_root, exist_ok=True)

    branches_to_try = [b for b in [(branch or "").strip(), "main", "master"] if b]
    # de-dupe while preserving order
    seen = set()
    branches_to_try = [b for b in branches_to_try if not (b in seen or seen.add(b))]

    last_error = "unknown error"
    for candidate_branch in branches_to_try:
        url = f"https://codeload.github.com/{owner}/{repo}/tar.gz/refs/heads/{candidate_branch}"
        try:
            resp = requests.get(url, timeout=30)
        except requests.RequestException as e:
            last_error = f"network error fetching '{candidate_branch}': {e}"
            continue

        if resp.status_code == 404:
            last_error = f"branch '{candidate_branch}' not found (or repository is private/doesn't exist)"
            continue
        if resp.status_code != 200:
            last_error = f"HTTP {resp.status_code} fetching '{candidate_branch}'"
            continue

        with tarfile.open(fileobj=io.BytesIO(resp.content), mode="r:gz") as tar:
            tar.extractall(dest_root, filter="data")

        extracted_dirs = [
            d for d in os.listdir(dest_root) if os.path.isdir(os.path.join(dest_root, d))
        ]
        if not extracted_dirs:
            last_error = f"tarball for '{candidate_branch}' was empty"
            continue

        return os.path.join(dest_root, extracted_dirs[0])

    raise ValueError(
        f"Could not fetch '{owner}/{repo}' from GitHub (tried branches: {', '.join(branches_to_try)}). "
        f"Make sure the repository is public and the branch exists. Last error: {last_error}"
    )
