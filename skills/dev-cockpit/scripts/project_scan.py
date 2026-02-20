#!/usr/bin/env python3
"""
Auto-discover git repos under ~/dev and build a project registry.

Usage:
    python3 project_scan.py --root ~/dev --output ~/.openclaw/cockpit/projects.json
    python3 project_scan.py --root ~/dev --format json --pretty
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any


# Language detection: file → language
LANGUAGE_MARKERS: dict[str, str] = {
    "tsconfig.json": "typescript",
    "package.json": "javascript",  # overridden by tsconfig if both present
    "pyproject.toml": "python",
    "setup.py": "python",
    "requirements.txt": "python",
    "go.mod": "go",
    "Cargo.toml": "rust",
    "Gemfile": "ruby",
    "build.gradle": "java",
    "pom.xml": "java",
    "mix.exs": "elixir",
    "pubspec.yaml": "dart",
}

# Framework detection
FRAMEWORK_MARKERS: dict[str, str] = {
    "next.config.js": "nextjs",
    "next.config.ts": "nextjs",
    "nuxt.config.ts": "nuxt",
    "angular.json": "angular",
    "Dockerfile": "docker",
    "docker-compose.yml": "docker-compose",
    "docker-compose.yaml": "docker-compose",
    "terraform.tf": "terraform",
    ".terraform": "terraform",
}

# Directories to skip
SKIP_DIRS: set[str] = {
    "node_modules",
    ".git",
    "__pycache__",
    ".venv",
    "venv",
    ".tox",
    "dist",
    "build",
    ".next",
    ".cache",
    "target",
    ".terraform",
    ".openclaw",
}


def detect_language(repo_path: Path) -> str:
    """Detect primary language from marker files."""
    detected = ""
    for marker, lang in LANGUAGE_MARKERS.items():
        if (repo_path / marker).exists():
            detected = lang
    # tsconfig overrides package.json
    if (repo_path / "tsconfig.json").exists():
        detected = "typescript"
    # Check for .tf files
    if not detected:
        tf_files = list(repo_path.glob("*.tf"))
        if tf_files:
            detected = "terraform"
    return detected or "unknown"


def detect_tags(repo_path: Path) -> list[str]:
    """Auto-detect framework/tool tags."""
    tags: list[str] = []
    for marker, tag in FRAMEWORK_MARKERS.items():
        if (repo_path / marker).exists():
            tags.append(tag)
    # Check for common patterns
    if (repo_path / ".github").is_dir():
        tags.append("github-actions")
    if (repo_path / "SKILL.md").exists():
        tags.append("openclaw-skill")
    return sorted(set(tags))


def get_repo_description(repo_path: Path) -> str:
    """Try to extract description from package.json or pyproject.toml."""
    pkg_json = repo_path / "package.json"
    if pkg_json.exists():
        try:
            with open(pkg_json) as f:
                data = json.load(f)
            return data.get("description", "")
        except (json.JSONDecodeError, OSError):
            pass
    pyproject = repo_path / "pyproject.toml"
    if pyproject.exists():
        try:
            import tomllib

            with open(pyproject, "rb") as f:
                data = tomllib.load(f)
            return data.get("project", {}).get("description", "")
        except Exception:
            pass
    return ""


def find_git_repos(root: Path, max_depth: int = 3) -> list[Path]:
    """Find git repositories under root, up to max_depth levels."""
    repos: list[Path] = []
    root = root.resolve()

    def _walk(current: Path, depth: int) -> None:
        if depth > max_depth:
            return
        if not current.is_dir():
            return
        if current.name in SKIP_DIRS:
            return
        if (current / ".git").exists():
            repos.append(current)
            return  # don't recurse into nested git repos
        try:
            for child in sorted(current.iterdir()):
                if child.is_dir() and child.name not in SKIP_DIRS:
                    _walk(child, depth + 1)
        except PermissionError:
            pass

    _walk(root, 0)
    return repos


def get_last_commit_date(repo_path: Path) -> str | None:
    """Get the date of the most recent commit."""
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%aI"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()[:10]
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


def scan_projects(
    roots: list[Path],
    existing: dict[str, Any] | None = None,
    max_depth: int = 3,
) -> dict[str, Any]:
    """Scan roots for git repos, merge with existing registry."""
    existing_projects = (existing or {}).get("projects", {})
    projects: dict[str, Any] = {}

    for root in roots:
        repos = find_git_repos(root, max_depth)
        for repo_path in repos:
            name = repo_path.name
            path_str = str(repo_path)

            # Preserve existing user settings if project was already tracked
            if name in existing_projects and existing_projects[name].get("path") == path_str:
                prev = existing_projects[name]
                projects[name] = {
                    "path": path_str,
                    "enabled": prev.get("enabled", True),
                    "tags": prev.get("tags", detect_tags(repo_path)),
                    "language": detect_language(repo_path),
                    "discovered": prev.get("discovered", date.today().isoformat()),
                    "description": prev.get("description") or get_repo_description(repo_path),
                    "lastCommit": get_last_commit_date(repo_path),
                }
            else:
                projects[name] = {
                    "path": path_str,
                    "enabled": True,
                    "tags": detect_tags(repo_path),
                    "language": detect_language(repo_path),
                    "discovered": date.today().isoformat(),
                    "description": get_repo_description(repo_path),
                    "lastCommit": get_last_commit_date(repo_path),
                }

    return {
        "version": 1,
        "scannedAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "scanRoots": [str(r) for r in roots],
        "projects": dict(sorted(projects.items())),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan for git repos and build project registry.")
    parser.add_argument(
        "--root",
        action="append",
        default=[],
        help="Root directory to scan (can specify multiple). Default: ~/dev",
    )
    parser.add_argument(
        "--output",
        help="Output file path. Default: ~/.openclaw/cockpit/projects.json",
    )
    parser.add_argument("--max-depth", type=int, default=3, help="Max directory depth (default: 3)")
    parser.add_argument("--format", choices=["text", "json"], default="text")
    parser.add_argument("--pretty", action="store_true")

    args = parser.parse_args()

    roots = [Path(r).expanduser() for r in args.root] if args.root else [Path.home() / "dev"]
    output_path = Path(args.output).expanduser() if args.output else Path.home() / ".openclaw" / "cockpit" / "projects.json"

    # Load existing registry to preserve user settings
    existing: dict[str, Any] | None = None
    if output_path.exists():
        try:
            with open(output_path) as f:
                existing = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    registry = scan_projects(roots, existing, args.max_depth)

    if args.format == "json" or args.output:
        indent = 2 if args.pretty or args.output else None
        output = json.dumps(registry, indent=indent)
        if args.output:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, "w") as f:
                f.write(output + "\n")
            print(f"Wrote {len(registry['projects'])} projects to {output_path}")
        else:
            print(output)
    else:
        print(f"Scanned: {', '.join(str(r) for r in roots)}")
        print(f"Found: {len(registry['projects'])} projects\n")
        for name, proj in registry["projects"].items():
            status = "enabled" if proj["enabled"] else "disabled"
            lang = proj["language"]
            tags = ", ".join(proj["tags"]) if proj["tags"] else ""
            last = proj.get("lastCommit", "")
            line = f"  {name:<30} {lang:<12} [{status}]"
            if tags:
                line += f"  tags: {tags}"
            if last:
                line += f"  last: {last}"
            print(line)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
