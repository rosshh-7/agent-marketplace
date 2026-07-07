import shutil
import tempfile
from pathlib import Path


def ensure_tarball(source: str) -> tuple[str, bool]:
    """If `source` is a directory, tar it up. Returns (tarball_path, is_temp)."""
    path = Path(source)
    if path.is_dir():
        tmp_tar = tempfile.mktemp(suffix=".tar.gz")
        base_name = tmp_tar[: -len(".tar.gz")]
        shutil.make_archive(base_name, "gztar", root_dir=path)
        return tmp_tar, True
    return str(path), False
