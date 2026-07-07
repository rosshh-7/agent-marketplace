import os


def write_file(path: str, content: str) -> str:
    """Write content to a file in /workspace/. Returns the path."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    return path


def read_file(path: str) -> str:
    """Read a file from /workspace/."""
    with open(path) as f:
        return f.read()
