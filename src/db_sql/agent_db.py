from collections.abc import Callable
from typing import TypeVar

from sqlalchemy.orm import Session

from src.db_sql.database import SessionLocal

T = TypeVar("T")


def run_with_db(callback: Callable[[Session], T]) -> T:
    db = SessionLocal()
    try:
        return callback(db)
    finally:
        db.close()
