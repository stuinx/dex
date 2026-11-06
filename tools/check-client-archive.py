#!/usr/bin/env python3
import sys
from pathlib import Path
from zipfile import BadZipFile, ZipFile

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "resource/client"
sources = {
    path.relative_to(root).as_posix(): path
    for directory in ("ui-script", "ui-web")
    for path in (root / directory).rglob("*")
    if path.is_file() and path.name != ".DS_Store"
}

try:
    with ZipFile(root / "Archive.zip") as archive:
        entries = [entry.filename for entry in archive.infolist() if not entry.is_dir()]
        if not sources or len(entries) != len(set(entries)) or set(entries) != set(sources):
            missing = sorted(set(sources) - set(entries))
            extra = sorted(set(entries) - set(sources))
            sys.exit(f"client archive file list mismatch: missing={missing}, extra={extra}, duplicates={len(entries) - len(set(entries))}")
        for name, path in sources.items():
            if archive.read(name) != path.read_bytes():
                sys.exit(f"client archive content mismatch: {name}")
except (BadZipFile, OSError) as error:
    sys.exit(f"client archive check failed: {error}")

print(f"client archive check passed: {len(sources)} files match source")
