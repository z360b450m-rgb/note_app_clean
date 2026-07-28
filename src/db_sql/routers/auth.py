from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from src.db_sql.auth import authenticate_user, create_access_token, create_user, get_current_user
from src.db_sql.database import get_db
from src.db_sql.models import UserModel
from src.db_sql.schemas import Token, UserPublic, UserRegister


router = APIRouter(prefix="/api", tags=["认证"])


def serialize_user(user: UserModel) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "created_at": user.created_at,
    }


@router.post("/users/signup", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def signup(payload: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(UserModel).filter(UserModel.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="该邮箱已经注册")
    return serialize_user(create_user(db, payload.email, payload.password, payload.full_name))


@router.post("/login/access-token", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=400, detail="邮箱或密码不正确")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="当前账号已被禁用")
    return {"access_token": create_access_token(user.id), "token_type": "bearer"}


@router.get("/users/me", response_model=UserPublic)
def read_current_user(current_user: UserModel = Depends(get_current_user)):
    return serialize_user(current_user)
