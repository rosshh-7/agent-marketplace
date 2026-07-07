"""
SQLAlchemy engine/session wiring. Uses a plain `create_all()` at startup rather than
Alembic — the contract calls Alembic "preferred if time allows" but allows a startup
create_all for POC speed; given the scope of this build we took the latter to keep the
dependency graph and the "how do I run this" story small (see README §Migrations for the
tradeoff and how to switch to Alembic later without touching model code).
"""
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Import models so they're registered on Base.metadata before create_all runs.
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
