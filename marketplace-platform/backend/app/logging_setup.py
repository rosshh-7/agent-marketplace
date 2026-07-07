"""
Structured logging to stdout: one logger for HTTP request/response lines (via middleware in
main.py) and a shared `get_logger()` for services to log outbound calls (req-agent,
review-agent, docker) and their outcomes — this is the main debugging surface once
everything is containerized and you can't just attach a debugger.

Uses stdlib logging with a single-line key=value formatter (easy to grep, easy to pipe into
a log aggregator later without depending on a JSON logging library for a POC).
"""
import logging
import sys


class KVFormatter(logging.Formatter):
    def format(self, record: logging.Formatter) -> str:  # type: ignore[override]
        base = f'time="{self.formatTime(record)}" level={record.levelname} logger={record.name} msg="{record.getMessage()}"'
        extra = getattr(record, "kv", None)
        if extra:
            base += " " + " ".join(f'{k}="{v}"' for k, v in extra.items())
        return base


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    root.setLevel(level)
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(KVFormatter())
    root.addHandler(handler)

    # Quiet down noisy third-party loggers a bit; keep our own at the configured level.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def log_kv(logger: logging.Logger, level: int, msg: str, **kv) -> None:
    logger.log(level, msg, extra={"kv": kv})
