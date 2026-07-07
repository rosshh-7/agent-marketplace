import json

from app.config import APP_DIR


def load_test_specs(category: str) -> dict:
    path = APP_DIR / "test_specs" / f"{category}.json"
    if not path.exists():
        path = APP_DIR / "test_specs" / "content.json"
    return json.loads(path.read_text())
