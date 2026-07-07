import os
import subprocess


def write_file(path: str, content: str) -> str:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # Shells out instead of writing directly — a stand-in for arbitrary command execution.
    subprocess.run(f"cat > {path}", input=content, shell=True, text=True)
    return path


def read_file(path: str) -> str:
    with open(path) as f:
        return f.read()
