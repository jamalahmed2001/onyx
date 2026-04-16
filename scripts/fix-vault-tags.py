#!/usr/bin/env python3
"""Fix/normalise Obsidian frontmatter tags so graph coloring works.

This is a *best-effort* tag normaliser.

Rules (by filename/path):
- */*Hub.md                 -> ensure tags include: hub-subdomain
- */* - Overview.md         -> ensure tags include: onyx-project
- */Phases/*.md             -> ensure tags include: onyx-phase
- */Logs/*.md               -> ensure tags include: project-log

It will:
- Preserve existing frontmatter.
- Add missing tags without removing any.
- Create frontmatter if missing.

Backups:
- Writes a copy of each changed file into:
  <vaultRoot>/.onyx-backups/tag-fix-<timestamp>/<relative-path>

Usage:
  fix-vault-tags.py /path/to/OnyxVault

Optional env:
  TAG_FIX_SCOPE_PREFIX=...  (only process files whose relpath starts with this prefix)
"""

from __future__ import annotations

import os
import re
import shutil
import sys
import time
from pathlib import Path

FM_RE = re.compile(r"^---\n([\s\S]*?)\n---\n?", re.M)


def now_slug() -> str:
    return time.strftime("%Y%m%d-%H%M%S")


def read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


def write_text(p: Path, s: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, encoding="utf-8")


def parse_tags_block(fm: str) -> tuple[list[str], int, int] | tuple[None, None, None]:
    """Return (tags, start_idx, end_idx) within fm string if tags block exists."""
    # YAML list form:
    # tags:
    #   - a
    #   - b
    m = re.search(r"(?m)^tags:\s*\n(?P<body>(?:^\s*-\s*.+\n?)+)", fm)
    if m:
        body = m.group("body")
        tags = [re.sub(r"^\s*-\s*", "", line).strip() for line in body.splitlines() if line.strip().startswith("-")]
        return tags, m.start(), m.end()

    # inline array: tags: [a, b]
    m = re.search(r"(?m)^tags:\s*\[(?P<body>[^\]]*)\]\s*$", fm)
    if m:
        raw = m.group("body")
        tags = [x.strip().strip('"\'') for x in raw.split(",") if x.strip()]
        return tags, m.start(), m.end()

    return None, None, None


def render_tags_block(tags: list[str]) -> str:
    lines = ["tags:"]
    for t in tags:
        lines.append(f"  - {t}")
    return "\n".join(lines) + "\n"


def ensure_tags_in_frontmatter(fm: str, required: set[str]) -> tuple[str, bool]:
    tags, start, end = parse_tags_block(fm)
    changed = False

    if tags is None:
        # Insert tags block near end (before trailing newline)
        new_tags = sorted(required)
        insertion = render_tags_block(new_tags)
        # keep a single trailing newline
        if not fm.endswith("\n"):
            fm += "\n"
        fm2 = fm + insertion
        return fm2, True

    tagset = {t for t in tags if t}
    missing = [t for t in required if t not in tagset]
    if not missing:
        return fm, False

    merged = tags + sorted(missing)
    # de-dupe preserving order
    seen = set()
    merged2 = []
    for t in merged:
        if t not in seen:
            merged2.append(t)
            seen.add(t)

    new_block = render_tags_block(merged2)

    # Replace existing tags block
    fm2 = fm[:start] + new_block + fm[end:]
    return fm2, True


def required_tags_for(rel: str) -> set[str]:
    rel_norm = rel.replace("\\", "/")
    base = os.path.basename(rel_norm)

    req: set[str] = set()

    if base.lower().endswith(" hub.md") or base.lower().endswith("hub.md"):
        req.add("hub-subdomain")

    if base.lower().endswith(" - overview.md"):
        req.add("onyx-project")

    if "/Phases/" in rel_norm:
        req.add("onyx-phase")

    if "/Logs/" in rel_norm:
        req.add("project-log")

    return req


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: fix-vault-tags.py /path/to/OnyxVault", file=sys.stderr)
        return 2

    vault = Path(sys.argv[1]).expanduser().resolve()
    if not vault.exists():
        print(f"Vault root not found: {vault}", file=sys.stderr)
        return 2

    scope_prefix = os.environ.get("TAG_FIX_SCOPE_PREFIX")

    backup_root = vault / ".onyx-backups" / f"tag-fix-{now_slug()}"
    changed_files = 0
    scanned = 0

    for p in vault.rglob("*.md"):
        # skip hidden/system
        rel = str(p.relative_to(vault)).replace("\\", "/")
        if rel.startswith(".") or "/." in rel or rel.startswith(".trash/"):
            continue
        if scope_prefix and not rel.startswith(scope_prefix):
            continue
        if p.name.startswith("._"):
            continue

        req = required_tags_for(rel)
        if not req:
            continue

        scanned += 1
        raw = read_text(p)

        m = FM_RE.match(raw)
        if m:
            fm = m.group(1)
            rest = raw[m.end():]
            fm2, changed = ensure_tags_in_frontmatter(fm, req)
            if not changed:
                continue
            new_raw = "---\n" + fm2.rstrip("\n") + "\n---\n" + rest
        else:
            # no frontmatter → create
            fm2 = render_tags_block(sorted(req))
            new_raw = "---\n" + fm2 + "---\n\n" + raw
            changed = True

        if changed:
            # backup
            backup_path = backup_root / rel
            backup_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, backup_path)
            write_text(p, new_raw)
            changed_files += 1

    print(f"Scanned {scanned} candidate files. Updated {changed_files} files.")
    if changed_files:
        print(f"Backups written to: {backup_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
