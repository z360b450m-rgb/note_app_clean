import time
import uuid
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy.orm import Session

from src.db_sql.models import NotebookModel, NoteEntryModel, ReviewLogModel, TagModel


def normalize_tags(tags: Optional[Iterable[str]]) -> List[str]:
    normalized: List[str] = []
    seen = set()

    for raw_tag in tags or []:
        if raw_tag is None:
            continue

        tag = str(raw_tag).strip()
        if not tag:
            continue

        key = tag.casefold()
        if key in seen:
            continue

        seen.add(key)
        normalized.append(tag)

    return normalized


def get_or_create_tags(db: Session, tags: Optional[Iterable[str]]) -> List[TagModel]:
    tag_names = normalize_tags(tags)
    if not tag_names:
        return []

    existing_tags = db.query(TagModel).filter(TagModel.name.in_(tag_names)).all()
    tag_by_name = {tag.name: tag for tag in existing_tags}
    linked_tags = list(existing_tags)

    for tag_name in tag_names:
        if tag_name in tag_by_name:
            continue

        tag_model = TagModel(id=str(uuid.uuid4()), name=tag_name)
        db.add(tag_model)
        linked_tags.append(tag_model)
        tag_by_name[tag_name] = tag_model

    return [tag_by_name[tag_name] for tag_name in tag_names]


def serialize_notebook(notebook: NotebookModel) -> dict:
    return {
        "id": notebook.id,
        "name": notebook.name,
        "description": notebook.description or "",
        "instructions": notebook.instructions or "",
        "sort_order": notebook.sort_order,
        "created_at": notebook.created_at,
        "updated_at": notebook.updated_at,
    }


def serialize_entry(entry: NoteEntryModel) -> dict:
    return {
        "id": entry.id,
        "notebook_id": entry.notebook_id,
        "title": entry.title,
        "question": entry.question or "",
        "wrong_answer": entry.wrong_answer or "",
        "correct_answer": entry.correct_answer or "",
        "subject": entry.subject or "",
        "source": entry.source or "",
        "tags": [tag.name for tag in entry.tags],
        "drawings": entry.drawings or {},
        "sort_order": entry.sort_order,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
        "review_count": entry.review_count,
        "consecutive_passes": entry.consecutive_passes,
        "mastery_level": entry.mastery_level,
        "ease_factor": entry.ease_factor,
        "interval": entry.interval,
        "last_review_date": entry.last_review_date,
        "next_review_date": entry.next_review_date,
    }


def serialize_review_log(log: ReviewLogModel) -> Dict[str, Any]:
    return {
        "id": log.id,
        "entry_id": log.entry_id,
        "timestamp": log.timestamp,
        "quality": log.quality,
        "selected_choice": log.selected_choice or "",
        "correct_choice": log.correct_choice or "",
        "is_correct": log.is_correct,
        "session_id": log.session_id or "",
        "elapsed_ms": log.elapsed_ms or 0,
        "review_note": log.review_note or "",
    }


def create_notebook(
    db: Session,
    name: str,
    description: str = "",
    instructions: str = "",
    notebook_id: Optional[str] = None,
) -> dict:
    if notebook_id:
        existing = db.query(NotebookModel).filter(NotebookModel.id == notebook_id).first()
        if existing:
            existing.name = name
            existing.description = description
            existing.instructions = instructions
            existing.updated_at = int(time.time() * 1000)
            db.commit()
            db.refresh(existing)
            return serialize_notebook(existing)

    notebook = NotebookModel(
        id=notebook_id or str(uuid.uuid4()),
        name=name,
        description=description,
        instructions=instructions,
    )
    db.add(notebook)
    db.commit()
    db.refresh(notebook)
    return serialize_notebook(notebook)


def get_all_notebooks(db: Session) -> dict:
    notebooks = db.query(NotebookModel).order_by(NotebookModel.sort_order.asc()).all()
    return {"items": [serialize_notebook(item) for item in notebooks]}


def get_notebook_by_id(db: Session, notebook_id: str) -> Optional[dict]:
    notebook = db.query(NotebookModel).filter(NotebookModel.id == notebook_id).first()
    return serialize_notebook(notebook) if notebook else None


def update_notebook(db: Session, notebook_id: str, update_fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    notebook = db.query(NotebookModel).filter(NotebookModel.id == notebook_id).first()
    if not notebook:
        return None

    for key, value in update_fields.items():
        if hasattr(notebook, key):
            setattr(notebook, key, value)

    notebook.updated_at = int(time.time() * 1000)
    db.commit()
    db.refresh(notebook)
    return serialize_notebook(notebook)


def delete_notebook(db: Session, notebook_id: str) -> bool:
    notebook = db.query(NotebookModel).filter(NotebookModel.id == notebook_id).first()
    if notebook:
        db.delete(notebook)
        db.commit()
        return True
    return False


def create_entry(
    db: Session,
    notebook_id: str,
    title: str,
    question: str,
    correct_answer: str = "",
    wrong_answer: str = "",
    subject: str = "",
    tags: Optional[List[str]] = None,
    entry_id: Optional[str] = None,
) -> dict:
    linked_tags = get_or_create_tags(db, tags)

    if entry_id:
        existing = db.query(NoteEntryModel).filter(NoteEntryModel.id == entry_id).first()
        if existing:
            existing.notebook_id = notebook_id
            existing.title = title
            existing.question = question
            existing.correct_answer = correct_answer
            existing.wrong_answer = wrong_answer
            existing.subject = subject
            existing.tags = linked_tags
            existing.updated_at = int(time.time() * 1000)
            db.commit()
            db.refresh(existing)
            return serialize_entry(existing)

    entry = NoteEntryModel(
        id=entry_id or f"cuoti_{int(time.time())}_{uuid.uuid4().hex[:6]}",
        notebook_id=notebook_id,
        title=title,
        question=question,
        correct_answer=correct_answer,
        wrong_answer=wrong_answer,
        subject=subject,
        tags=linked_tags,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return serialize_entry(entry)


def update_entry(db: Session, entry_id: str, update_fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    entry = db.query(NoteEntryModel).filter(NoteEntryModel.id == entry_id).first()
    if not entry:
        return None

    if "tags" in update_fields:
        entry.tags = get_or_create_tags(db, update_fields.pop("tags"))

    for key, value in update_fields.items():
        if hasattr(entry, key):
            setattr(entry, key, value)

    entry.updated_at = int(time.time() * 1000)
    db.commit()
    db.refresh(entry)
    return serialize_entry(entry)


def delete_entry(db: Session, entry_id: str) -> bool:
    entry = db.query(NoteEntryModel).filter(NoteEntryModel.id == entry_id).first()
    if entry:
        db.delete(entry)
        db.commit()
        return True
    return False


def search_and_filter_entries(
    db: Session,
    notebook_id: str,
    subject: Optional[str] = None,
    tag: Optional[str] = None,
    search_query: Optional[str] = None,
    sort_key: str = "created_at",
    sort_dir: str = "desc",
) -> Dict[str, Any]:
    query = db.query(NoteEntryModel).filter(NoteEntryModel.notebook_id == notebook_id)

    if subject and subject != "__all__":
        query = query.filter(NoteEntryModel.subject == subject)

    if tag:
        normalized_tag = str(tag).strip()
        if normalized_tag:
            query = query.join(NoteEntryModel.tags).filter(TagModel.name == normalized_tag)

    if search_query:
        query = query.filter(
            NoteEntryModel.title.contains(search_query) | NoteEntryModel.question.contains(search_query)
        )

    sort_column = getattr(NoteEntryModel, sort_key, NoteEntryModel.created_at)
    if sort_dir.lower() == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())

    entries = query.distinct().all()
    return {"items": [serialize_entry(item) for item in entries]}


def add_review_log(
    db: Session,
    entry_id: str,
    quality: str,
    is_correct: bool = True,
    elapsed_ms: int = 0,
    log_id: Optional[str] = None,
    timestamp: Optional[int] = None,
) -> Dict[str, Any]:
    if log_id:
        existing = db.query(ReviewLogModel).filter(ReviewLogModel.id == log_id).first()
        if existing:
            return serialize_review_log(existing)

    log = ReviewLogModel(
        id=log_id or str(uuid.uuid4()),
        entry_id=entry_id,
        timestamp=timestamp or int(time.time() * 1000),
        quality=quality,
        is_correct=is_correct,
        elapsed_ms=elapsed_ms,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return serialize_review_log(log)
