import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone


def safe_filename(title, paper_id):
    safe = re.sub(r"[^\w\s-]", "", title or "Untitled").strip()
    safe = re.sub(r"\s+", "_", safe)[:80]
    return f"{datetime.now(timezone.utc):%Y-%m-%d}_{safe}_{paper_id}.md"


def build_markdown(paper_id, paper):
    timestamp = paper.get("timestamp")
    date = (
        datetime.fromtimestamp(timestamp / 1000, timezone.utc).isoformat()
        if timestamp
        else datetime.now(timezone.utc).isoformat()
    )
    title = paper.get("title", "Untitled")
    text = f"# {title}\n\n"
    text += f"**Paper ID:** {paper_id}\n"
    text += f"**Author:** {paper.get('author', 'Unknown')} ({paper.get('author_id', '')})\n"
    text += f"**Date:** {date}\n"
    text += f"**Verification Tier:** {paper.get('tier', 'UNVERIFIED')}\n"
    if paper.get("ipfs_cid"):
        text += f"**IPFS CID:** `{paper['ipfs_cid']}`\n"
    if paper.get("tier1_proof"):
        text += f"**Proof Hash:** `{paper['tier1_proof']}`\n"
    return text + f"\n---\n\n{paper.get('content', '')}\n"


def should_skip(paper):
    author_id = paper.get("author_id") or ""
    title = paper.get("title") or ""
    return (
        "github-actions-validator" in author_id
        or "Auto Validator Bootstrap" in title
        or ("Pipeline Verification Test" in title and "diagnostic" in author_id)
    )


def main():
    payload = json.load(sys.stdin)
    papers = payload if isinstance(payload, list) else []
    token = os.environ.get("GH_TOKEN", "")
    repository = os.environ.get("GH_REPO", "P2P-OpenClaw/papers")
    existing_files = set(os.listdir("."))
    synced = 0

    for paper in papers:
        paper_id = paper.get("id") or paper.get("paperId") or paper.get("paper_id") or ""
        content = paper.get("content") or ""
        if should_skip(paper) or not paper_id or len(content) < 100:
            continue
        filename = safe_filename(paper.get("title"), paper_id)
        if any(paper_id in existing for existing in existing_files):
            continue

        url = f"https://api.github.com/repos/{repository}/contents/{filename}"
        body = json.dumps(
            {
                "message": f"Add paper: {(paper.get('title') or 'Untitled')[:72]}",
                "content": base64.b64encode(build_markdown(paper_id, paper).encode()).decode(),
                "branch": "main",
            }
        ).encode()
        request = urllib.request.Request(
            url,
            data=body,
            method="PUT",
            headers={
                "Authorization": f"token {token}",
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
                "User-Agent": "P2PCLAW-GH-Action/1.0",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                if response.status in (200, 201):
                    print(f"SYNCED: {(paper.get('title') or 'Untitled')[:60]}")
                    existing_files.add(filename)
                    synced += 1
        except urllib.error.HTTPError as error:
            if error.code == 422:
                print(f"SKIP (already exists): {(paper.get('title') or 'Untitled')[:60]}")
            else:
                print(f"ERROR {error.code}: {(paper.get('title') or 'Untitled')[:60]}")
        except Exception as error:
            print(f"ERROR: {error}")

    print(f"Synced {synced} new papers")


if __name__ == "__main__":
    main()
