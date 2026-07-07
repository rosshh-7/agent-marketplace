from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import DATABASE_PATH, DATA_DIR

DATA_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(f"sqlite:///{DATABASE_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def init_db() -> None:
    from app import models  # noqa: F401 — register models on Base before create_all
    Base.metadata.create_all(bind=engine)


def get_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
