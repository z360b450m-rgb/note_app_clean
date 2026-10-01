from sqlalchemy import or_
from sqlalchemy.orm import Session

from src.db_sql.agent_db import run_with_db
from src.db_sql.models import NoteEntryModel


def search_tool(keyword: str) -> str:
    """Search related mistake entries by keyword."""

    def query_entries(db: Session) -> str:
        entries = (
            db.query(NoteEntryModel)
            .filter(
                or_(
                    NoteEntryModel.title.ilike(f"%{keyword}%"),
                    NoteEntryModel.question.ilike(f"%{keyword}%"),
                )
            )
            .order_by(NoteEntryModel.updated_at.desc())
            .limit(5)
            .all()
        )

        if not entries:
            return f"No mistake entries found for keyword: {keyword}"

        lines = [f"Found {len(entries)} mistake entries related to {keyword}:"]
        for index, entry in enumerate(entries, 1):
            title = entry.title or "Untitled"
            question = (entry.question or "").replace("\n", " ")[:120]
            lines.append(f"{index}. {title} | {question}")

        return "\n".join(lines)

    return run_with_db(query_entries)
