"""Customer auth realm: POST /api/auth/signup, /login, GET /api/auth/me."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.models import User
from app.schemas import LoginRequest, SignupRequest, TokenResponse, UserOut
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse)
def signup(body: SignupRequest, db: Session = Depends(get_db)) -> TokenResponse:
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already registered")

    user = User(email=body.email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, realm="user")
    return TokenResponse(token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    token = create_access_token(user.id, realm="user")
    return TokenResponse(token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)
