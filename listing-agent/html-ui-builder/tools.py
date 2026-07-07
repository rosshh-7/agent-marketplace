import os
import re
import zipfile


def write_file(path: str, content: str) -> str:
    """Write content to a file, creating parent directories as needed. Returns the path."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    return path


def read_file(path: str) -> str:
    with open(path) as f:
        return f.read()


def strip_code_fence(text: str) -> str:
    """Models sometimes wrap output in ```html ... ``` despite instructions not to. Strip it."""
    stripped = text.strip()
    match = re.match(r"^```[a-zA-Z]*\n(.*)\n```$", stripped, re.DOTALL)
    return match.group(1).strip() if match else stripped


def slugify(title: str, used: set) -> str:
    """Turn a page title into a unique, filesystem-safe .html filename."""
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "page"
    base = base[:40]
    slug = base
    n = 2
    while slug in used:
        slug = f"{base}-{n}"
        n += 1
    used.add(slug)
    return f"{slug}.html"


def zip_directory(src_dir: str, zip_path: str) -> str:
    """Zip every file directly inside src_dir into zip_path. Returns zip_path."""
    os.makedirs(os.path.dirname(zip_path), exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in sorted(os.listdir(src_dir)):
            zf.write(os.path.join(src_dir, name), arcname=name)
    return zip_path
