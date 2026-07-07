"""Seller auth realm: POST /api/seller/auth/signup, /login, GET /api/seller/auth/me."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import get_current_seller, get_db
from app.models import Seller
from app.schemas import SellerLoginRequest, SellerOut, SellerSignupRequest, SellerTokenResponse
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/seller/auth", tags=["seller-auth"])


@router.post("/signup", response_model=SellerTokenResponse)
def signup(body: SellerSignupRequest, db: Session = Depends(get_db)) -> SellerTokenResponse:
    existing = db.query(Seller).filter(Seller.email == body.email).first()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already registered")

    seller = Seller(
        email=body.email,
        password_hash=hash_password(body.password),
        company_name=body.company_name,
    )
    db.add(seller)
    db.commit()
    db.refresh(seller)

    token = create_access_token(seller.id, realm="seller")
    return SellerTokenResponse(token=token, seller=SellerOut.model_validate(seller))


@router.post("/login", response_model=SellerTokenResponse)
def login(body: SellerLoginRequest, db: Session = Depends(get_db)) -> SellerTokenResponse:
    seller = db.query(Seller).filter(Seller.email == body.email).first()
    if not seller or not verify_password(body.password, seller.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    token = create_access_token(seller.id, realm="seller")
    return SellerTokenResponse(token=token, seller=SellerOut.model_validate(seller))


@router.get("/me", response_model=SellerOut)
def me(current_seller: Seller = Depends(get_current_seller)) -> SellerOut:
    return SellerOut.model_validate(current_seller)
