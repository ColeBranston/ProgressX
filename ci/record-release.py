#!/usr/bin/env python3
"""
Records a release after a deploy: the pull request merged as <commit> becomes a row in Supabase's
public.releases (its title and description are what users see in the app's "New update" popup).
Run again for the same commit, it updates that row instead of adding another.

  record-release.py <commit sha> <supabase url file> <supabase service role key file>

Needs GITHUB_REPOSITORY and GITHUB_TOKEN (pull requests: read). A commit pushed straight to main, with
no pull request, is not recorded. Standard library only.
"""
import json
import os
import sys
import urllib.error
import urllib.request

TITLE_MAX = 300
BODY_MAX = 20_000  # match the checks on public.releases


def fail(message):
    sys.exit(f"record-release: {message}")


def call(url, headers, body=None, method=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 method=method or ("POST" if body is not None else "GET"), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            text = res.read().decode()
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        fail(f"{method or 'GET'} {url.split('?')[0]} failed ({e.code})")  # the body isn't shown: it could echo the key
    except urllib.error.URLError as e:
        fail(f"can't reach {url.split('?')[0]} ({e.reason})")


def merged_pull_request(repo, sha, token):
    pulls = call(f"https://api.github.com/repos/{repo}/commits/{sha}/pulls", {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
    }) or []
    # the pull request this commit merged, not one that merely contains it
    merged = [p for p in pulls if p.get("merged_at") and p.get("merge_commit_sha") == sha]
    return merged[0] if merged else None


def main():
    if len(sys.argv) != 4:
        fail("usage: record-release.py <commit sha> <supabase url file> <supabase service role key file>")
    sha, url_file, key_file = sys.argv[1:]
    repo, token = os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_TOKEN")
    if not repo or not token:
        fail("GITHUB_REPOSITORY and GITHUB_TOKEN must be set")

    pr = merged_pull_request(repo, sha, token)
    if not pr:
        print(f"::notice::{sha[:7]} wasn't merged from a pull request, so no release notes were recorded")
        return

    with open(url_file) as f:
        supabase_url = f.read().strip().rstrip("/")
    with open(key_file) as f:
        key = f.read().strip()
    row = {
        "commit_sha": sha,
        "pr_number": pr["number"],
        "title": (pr.get("title") or f"Update #{pr['number']}").strip()[:TITLE_MAX],
        "body": (pr.get("body") or "")[:BODY_MAX],
    }
    call(f"{supabase_url}/rest/v1/releases?on_conflict=commit_sha", {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }, body=row)
    print(f"recorded release notes for #{pr['number']}: {row['title']}")


if __name__ == "__main__":
    main()
