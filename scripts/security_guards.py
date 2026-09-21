#!/usr/bin/env python3
"""Supply-chain guards for the surfaces a fork of this repo executes.

    python3 scripts/security_guards.py

Adapted from MadsLorentzen/ai-job-search (MIT) — the allowlists below are
OpenClaw's, the three checks are theirs.

This repo ships pre-approved Claude Code permissions and agent config that
anyone forking it executes. These guards make the dangerous changes LOUD, not
impossible: a PR that genuinely needs one must update the allowlist in this
file in the same diff, so the widening shows up in review instead of landing
quietly.

1. .claude/settings.json — every permissions.allow entry must be in the exact
   allowlist below, every deny entry must still be present (removing a deny is
   a widening too), and `hooks` must stay in its allowlist. A hook fires on its
   event with no prompt, so it is strictly more dangerous than a pre-approved
   permission.
2. .gitignore — the credential and memory rules must all still be present, and
   no un-allowlisted negation (!pattern) may re-include them.
3. Every package.json — no npm/pnpm lifecycle scripts (preinstall, install,
   postinstall, prepare, prepack) and no trustedDependencies. Catches code
   execution smuggled into `pnpm install`.

Stdlib only. Exit 0 on success, 1 with a failure list.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
errors: list[str] = []

ALLOWED_PERMISSIONS = {
    'Bash(pnpm install)',
    'Bash(pnpm build)',
    'Bash(pnpm test*)',
    'Bash(pnpm check*)',
    'Bash(pnpm lint*)',
    'Bash(pnpm format*)',
    'Bash(pnpm openclaw*)',
    'Bash(pnpm ui:*)',
    'Bash(pnpm dev*)',
    'Bash(pnpm tsgo*)',
    'Bash(pnpm canvas:*)',
    'Bash(pnpm protocol:*)',
    'Bash(pnpm release:check*)',
    'Bash(pnpm plugins:sync*)',
    'Bash(vitest*)',
    'Bash(git log*)',
    'Bash(git diff*)',
    'Bash(git status*)',
    'Bash(git describe*)',
    'Bash(git branch*)',
    'Bash(git rev-parse*)',
    'Bash(git ls-files*)',
    'Bash(git show*)',
    'Bash(git fetch*)',
    'Bash(scripts/committer*)',
    'Bash(gcloud projects list*)',
    'Bash(gcloud services list*)',
    'Bash(gcloud config get*)',
    'Bash(gcloud auth list*)',
    'Bash(gcloud run services list*)',
    'Bash(gh pr *)',
    'Bash(gh issue *)',
    'Bash(gh repo view*)',
    'Bash(gh api*)',
    'Bash(docker compose up*)',
    'Bash(docker compose down*)',
    'Bash(docker compose logs*)',
    'Bash(docker compose ps*)',
    'Bash(docker build*)',
    'Bash(pre-commit run*)',
    'Bash(chmod*)',
    'Bash(mkdir*)',
    'Bash(wc*)',
    'Bash(which*)',
    'Bash(ls*)',
    'WebSearch',
    'WebFetch(domain:github.com)',
    'WebFetch(domain:docs.openclaw.ai)',
    'WebFetch(domain:deepwiki.com)',
}

REQUIRED_DENIES = {
    'Bash(git push --force*)',
    'Bash(git reset --hard*)',
    'Bash(git checkout . *)',
    'Bash(git clean -f*)',
    'Bash(rm -rf*)',
    'Bash(npm publish*)',
    'Bash(gcloud iam*)',
    'Bash(gcloud projects delete*)',
    'Bash(gcloud services disable*)',
    'Bash(gh secret*)',
    'Bash(gh auth*)',
    'Bash(docker compose rm*)',
}

# No hooks are shipped today. Adding one is a deliberate act; list it here.
ALLOWED_HOOK_EVENTS: set[str] = set()

REQUIRED_IGNORE_RULES = [
    ".env",
    "/memory/",
    ".agent/*.json",
    "/local/",
    ".claude/settings.local.json",
    ".agents/",
]

# The only negation that may re-include anything under the rules above.
ALLOWED_IGNORE_NEGATIONS = {"!.agent/workflows/"}

FORBIDDEN_SCRIPTS = {"preinstall", "install", "postinstall", "prepare", "prepack"}

# Lifecycle scripts that ship today, pinned to their exact command. The command
# is part of the key on purpose: renaming is not the risk, changing what runs is.
ALLOWED_LIFECYCLE = {
    ("package.json", "prepare"):
        "command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree "
        ">/dev/null 2>&1 && git config core.hooksPath git-hooks || exit 0",
    ("package.json", "prepack"): "pnpm build && pnpm ui:build",
    ("vendor/a2ui/renderers/lit/package.json", "prepack"): "npm run build",
}


def check_permissions() -> None:
    path = ROOT / ".claude" / "settings.json"
    if not path.exists():
        errors.append("missing .claude/settings.json")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    perms = data.get("permissions") or {}

    for entry in perms.get("allow") or []:
        if entry not in ALLOWED_PERMISSIONS:
            errors.append(
                "permissions.allow has an un-allowlisted entry: %r — add it to "
                "ALLOWED_PERMISSIONS in this file in the same diff" % entry
            )

    missing_denies = REQUIRED_DENIES - set(perms.get("deny") or [])
    for entry in sorted(missing_denies):
        errors.append("permissions.deny no longer contains %r — removing a deny widens access" % entry)

    hooks = data.get("hooks") or {}
    for event in hooks:
        if event not in ALLOWED_HOOK_EVENTS:
            errors.append(
                "hooks.%s is not allowlisted — a hook runs automatically with no "
                "prompt, so it needs an explicit entry here" % event
            )


def check_gitignore() -> None:
    path = ROOT / ".gitignore"
    if not path.exists():
        errors.append("missing .gitignore")
        return
    lines = [ln.strip() for ln in path.read_text(encoding="utf-8").splitlines()]
    present = set(lines)

    for rule in REQUIRED_IGNORE_RULES:
        if rule not in present:
            errors.append("gitignore no longer ignores %r" % rule)

    for ln in lines:
        if ln.startswith("!") and ln not in ALLOWED_IGNORE_NEGATIONS:
            errors.append(
                "gitignore has an un-allowlisted negation %r — this can re-include "
                "credentials or memory that the rules above exclude" % ln
            )


def check_package_manifests() -> None:
    for path in ROOT.rglob("package.json"):
        if "node_modules" in path.parts:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append("%s is not valid JSON: %s" % (path.relative_to(ROOT), exc))
            continue
        rel = path.relative_to(ROOT)
        scripts = data.get("scripts") or {}
        for name in sorted(FORBIDDEN_SCRIPTS & set(scripts)):
            key = (rel.as_posix(), name)
            if ALLOWED_LIFECYCLE.get(key) == scripts[name]:
                continue
            if key in ALLOWED_LIFECYCLE:
                errors.append(
                    "%s %r lifecycle script CHANGED from the allowlisted command — "
                    "review what now runs on install" % (rel, name)
                )
            else:
                errors.append("%s defines a %r lifecycle script — runs on install" % (rel, name))
        if data.get("trustedDependencies"):
            errors.append("%s declares trustedDependencies — allows install scripts" % rel)


def main() -> int:
    check_permissions()
    check_gitignore()
    check_package_manifests()
    if errors:
        print("security_guards: %d problem(s)\n" % len(errors))
        for e in errors:
            print("  - %s" % e)
        return 1
    print("security_guards: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
