#!/usr/bin/env python3
"""Refuse Brain releases outside the clean, pushed main source checkout."""
import pathlib
import subprocess


def git(*args):
    """Read repository state, failing on command errors."""
    return subprocess.check_output(["git", *args], text=True).strip()


def main():
    root = pathlib.Path(__file__).resolve().parents[1]
    if pathlib.Path.cwd().resolve() != root:
        raise SystemExit("Run the release guard from the main source directory")
    if git("rev-parse", "--git-dir") != ".git":
        raise SystemExit("Release builds may not use a linked worktree")
    if git("branch", "--show-current") != "main":
        raise SystemExit("Release builds require main")
    if git("status", "--porcelain", "--untracked-files=all"):
        raise SystemExit("Commit and push all source changes before release")
    subprocess.run(["git", "fetch", "origin", "main"], check=True)
    commit = git("rev-parse", "HEAD")
    if commit != git("rev-parse", "origin/main"):
        raise SystemExit("Local main and origin/main differ")
    print(commit)


if __name__ == "__main__":
    main()
