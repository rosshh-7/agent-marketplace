"""
FastAPI dependencies: DB session passthrough + the two auth-realm guards.

`get_current_user` / `get_current_seller` require a standard `Authorization: Bearer <jwt>`
header — used by every mutating/list/detail route.

`get_current_user_flexible` additionally accepts the token as a `?token=` query parameter.
This is *not* in the contract's route shapes (paths/methods/bodies are unchanged) but is
needed in practice for the two GET routes the browser loads directly rather than via
`fetch()` — `<iframe src="/api/jobs/{id}/preview/index.html">` and a plain download link —
neither of which can attach a custom header. Both still require a valid user-realm JWT that
owns the job; only the token's *transport* is relaxed for these two endpoints.
"""
import uuid
from collections.abc import Generator

from fastapi import Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Seller, User
from app.security import TokenError, decode_token


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _extract_bearer(request: Request) -> str | None:
    auth = request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    return auth.split(" ", 1)[1].strip()


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = _extract_bearer(request)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    try:
        user_id: uuid.UUID = decode_token(token, expected_realm="user")
    except TokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}") from exc
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


def get_current_user_flexible(
    request: Request,
    token: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> User:
    raw = _extract_bearer(request) or token
    if not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    try:
        user_id: uuid.UUID = decode_token(raw, expected_realm="user")
    except TokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}") from exc
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


def get_current_seller(request: Request, db: Session = Depends(get_db)) -> Seller:
    token = _extract_bearer(request)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    try:
        seller_id: uuid.UUID = decode_token(token, expected_realm="seller")
    except TokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}") from exc
    seller = db.get(Seller, seller_id)
    if seller is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Seller not found")
    return seller
