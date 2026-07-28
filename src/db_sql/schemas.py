from typing import List, Optional
from pydantic import BaseModel, Field
# ===========================================================================
# 1. 笔记本
# ===========================================================================
class NotebookCreate(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    instructions: Optional[str] = ""
class NotebookUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    sort_order: Optional[int] = None
# ===========================================================================
# 2. 错题条目
# ===========================================================================
class EntryCreate(BaseModel):
    id: Optional[str] = None
    notebook_id: str
    title: str
    question: str
    correct_answer: Optional[str] = ""
    wrong_answer: Optional[str] = ""
    subject: Optional[str] = ""
    tags: List[str] = Field(default_factory=list)
class EntryUpdate(BaseModel):
    title: Optional[str] = None
    question: Optional[str] = None
    correct_answer: Optional[str] = None
    wrong_answer: Optional[str] = None
    subject: Optional[str] = None
    tags: Optional[List[str]] = None
    mastery_level: Optional[int] = None
    next_review_date: Optional[int] = None
# ===========================================================================
# 3. 复习日志
# ===========================================================================
class ReviewLogCreate(BaseModel):
    id: Optional[str] = None
    timestamp: Optional[int] = None
    quality: str
    is_correct: Optional[bool] = True
    elapsed_ms: Optional[int] = 0


# ===========================================================================
# 4. 用户认证
# ===========================================================================
class UserRegister(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: Optional[str] = Field(default=None, max_length=255)


class UserPublic(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    is_active: bool
    created_at: int


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
