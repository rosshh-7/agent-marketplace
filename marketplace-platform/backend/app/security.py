"""
Password hashing (passlib/bcrypt) and JWT issuing/verification for the two separate auth
realms (customer users, sellers). A single JWT_SECRET is used for both, but every token
carries a `realm` claim ("user" or "seller") so a token minted for one realm is rejected
by the other realm's dependency — see app/deps.py.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from passlib.context import CryptContext

from app.config import settings

# bcrypt 4.1+ removed the `__about__` module passlib 1.7.4 probes for its version check,
# which makes passlib log (harmless but noisy) warnings. Pin bcrypt==4.0.1 in
# requirements.txt to sidestep that; CryptContext usage itself is unaffected.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

Realm = Literal["user", "seller"]


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(subject: uuid.UUID, realm: Realm) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject),
        "realm": realm,
        "iat": now,
        "exp": now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


class TokenError(Exception):
    pass


def decode_token(token: str, expected_realm: Realm) -> uuid.UUID:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc

    if payload.get("realm") != expected_realm:
        raise TokenError(f"token is not valid for realm={expected_realm}")

    try:
        return uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise TokenError("malformed subject claim") from exc
