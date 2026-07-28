import time

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Table,
    Text,
)
from sqlalchemy.orm import relationship

from src.db_sql.database import Base


entry_tags = Table(
    "entry_tags",
    Base.metadata,
    Column("entry_id", String(64), ForeignKey("note_entries.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", String(64), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class NotebookModel(Base):
    __tablename__ = "notebooks"

    id = Column(String(64), primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    instructions = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(BigInteger, default=lambda: int(time.time() * 1000))
    updated_at = Column(
        BigInteger,
        default=lambda: int(time.time() * 1000),
        onupdate=lambda: int(time.time() * 1000),
    )

    entries = relationship("NoteEntryModel", back_populates="notebook", cascade="all, delete-orphan")


class UserModel(Base):
    __tablename__ = "users"

    id = Column(String(64), primary_key=True, index=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    full_name = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(BigInteger, default=lambda: int(time.time() * 1000))


class NoteEntryModel(Base):
    __tablename__ = "note_entries"

    id = Column(String(64), primary_key=True, index=True)
    notebook_id = Column(String(64), ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False, default="")
    question = Column(Text, nullable=True)
    wrong_answer = Column(Text, nullable=True)
    correct_answer = Column(Text, nullable=True)
    subject = Column(String(100), default="", index=True)
    source = Column(String(255), default="")
    drawings = Column(JSON, nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(BigInteger, default=lambda: int(time.time() * 1000))
    updated_at = Column(
        BigInteger,
        default=lambda: int(time.time() * 1000),
        onupdate=lambda: int(time.time() * 1000),
    )

    review_count = Column(Integer, default=0)
    consecutive_passes = Column(Integer, default=0)
    mastery_level = Column(Integer, default=0)
    ease_factor = Column(Float, default=2.5)
    interval = Column(Integer, default=0)
    last_review_date = Column(BigInteger, nullable=True)
    next_review_date = Column(BigInteger, nullable=True, index=True)

    notebook = relationship("NotebookModel", back_populates="entries")
    tags = relationship("TagModel", secondary=entry_tags, back_populates="entries")
    review_logs = relationship("ReviewLogModel", back_populates="entry", cascade="all, delete-orphan")


class TagModel(Base):
    __tablename__ = "tags"

    id = Column(String(64), primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    created_at = Column(BigInteger, default=lambda: int(time.time() * 1000))
    updated_at = Column(
        BigInteger,
        default=lambda: int(time.time() * 1000),
        onupdate=lambda: int(time.time() * 1000),
    )

    entries = relationship("NoteEntryModel", secondary=entry_tags, back_populates="tags")


class ReviewLogModel(Base):
    __tablename__ = "review_logs"

    id = Column(String(64), primary_key=True, index=True)
    entry_id = Column(String(64), ForeignKey("note_entries.id", ondelete="CASCADE"), nullable=False, index=True)
    timestamp = Column(BigInteger, nullable=False, index=True)
    quality = Column(String(50), nullable=False)
    selected_choice = Column(Text, nullable=True)
    correct_choice = Column(Text, nullable=True)
    is_correct = Column(Boolean, nullable=True)
    session_id = Column(String(64), nullable=True)
    elapsed_ms = Column(BigInteger, nullable=True)
    review_note = Column(Text, nullable=True)

    entry = relationship("NoteEntryModel", back_populates="review_logs")
