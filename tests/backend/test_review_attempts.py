import json
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from src.db_sql.auth import get_current_user
from src.db_sql.database import Base, get_db
from src.db_sql.main import app
from src.db_sql.models import UserModel, NotebookModel, NoteEntryModel, ReviewLogModel, ReviewAttemptModel
from src.db_sql.review_importance import source_fingerprint
from src.db_sql.routers.review_insights import selected_candidate


class AttemptTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        self.db = Session(engine)
        self.addCleanup(engine.dispose)
        self.addCleanup(self.db.close)
        self.addCleanup(app.dependency_overrides.clear)
        self.addCleanup(patch.stopall)
        for owner in ('alice', 'bob'):
            self.db.add(UserModel(id=owner, email=owner+'@example.test', hashed_password='unused'))
            self.db.add(NotebookModel(id=owner, user_id=owner, name='数学'))
        self.db.flush()
        for ident, owner in (('entry', 'alice'), ('secret', 'bob')):
            self.db.add(NoteEntryModel(id=ident, user_id=owner, notebook_id=owner, title='方程',
                question='解方程 x+1=2', correct_answer='x=1', review_count=0, next_review_date=9999999999999))
        self.db.commit()
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id='alice')
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        patch('src.db_sql.routers.review_candidates.prediction_context', return_value=(None, None, 'model_missing')).start()
        self.attempt_id = str(uuid4())
        self.requests = []
        self.error = None
        self.mode = 'normal'
        self.mutate = lambda data: data
        self.during_model = lambda: None
        original = httpx.AsyncClient
        def transport(request):
            self.requests.append(request)
            if self.error:
                raise self.error
            payload = json.loads(request.content)
            result = self.grading(payload)
            self.during_model()
            return httpx.Response(200, json=self.mutate(result))
        patch('src.db_sql.review_grading.httpx.AsyncClient', side_effect=lambda **kwargs:
            original(transport=httpx.MockTransport(transport), **kwargs)).start()

    def grading(self, payload):
        item, _ = selected_candidate(self.db, 'alice', 'entry')
        answer, reason = payload['answer_text'], payload['explanation_text']
        ans = 'incorrect' if 'x=3' in answer else 'correct'
        expl = 'invalid' if '蒙' in reason else 'valid' if reason or '因为' in answer else 'missing'
        if self.mode == 'unknown':
            ans = expl = 'uncertain'
        def criterion(verdict, student):
            return {'verdict': verdict, 'student_evidence': [student] if student else [],
                    'reference_evidence': ['x=1'] if student else [], 'feedback': '点评关键知识点'}
        status = 'needs_review' if ans == 'uncertain' else 'awaiting_explanation' if expl == 'missing' else 'final'
        return {'entry_id': 'entry', 'source_fingerprint': source_fingerprint(item), 'status': status,
            'is_correct': (ans == 'correct' and expl == 'valid') if status == 'final' else None,
            'assessment': {'answer': criterion(ans, answer), 'explanation': criterion(expl, reason or answer if expl not in ('missing', 'uncertain') else '')},
            'comment': '完整点评' if status == 'final' else '请说明关键解题理由',
            'followup_question': '' if status == 'final' else '你是怎么得到答案的？',
            'grading_version': 'review-answer-reason-v1', 'source': 'ai_suggestion'}

    def submit(self, answer='x=1', entry='entry', **extra):
        return self.client.post(f'/api/entries/{entry}/review-attempts', json={
            'attempt_id': self.attempt_id, 'answer_text': answer, 'elapsed_ms': 1234, **extra},
            headers={'Authorization': 'Bearer token'})

    def explain(self, reason='等式两边减去1', revision=1):
        return self.client.post(f'/api/entries/entry/review-attempts/{self.attempt_id}/explanation',
            json={'explanation_text': reason, 'expected_revision': revision}, headers={'Authorization': 'Bearer token'})

    def test_answer_alone_waits_and_reason_finishes_once(self):
        first = self.submit()
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()['status'], 'awaiting_explanation')
        self.assertIsNone(first.json()['is_correct'])
        self.assertEqual(self.db.query(ReviewLogModel).count(), 0)
        self.assertEqual(self.db.get(NoteEntryModel, 'entry').review_count, 0)
        final = self.explain()
        self.assertEqual(final.status_code, 200, final.text)
        result = final.json()
        self.assertEqual(result['status'], 'final')
        self.assertTrue(result['is_correct'])
        self.assertEqual(result['entry_review']['review_count'], 1)
        self.assertEqual(result['entry_review']['wrong_count'], 0)
        log = self.db.get(ReviewLogModel, self.attempt_id)
        self.assertEqual(log.answer_text, 'x=1')
        self.assertEqual(log.elapsed_ms, 1234)
        self.assertEqual(json.loads(log.review_note)['explanation_text'], '等式两边减去1')
        self.assertIn('解题理由：', result['review_log']['review_note'])
        self.assertNotIn('"source"', result['review_log']['review_note'])
        self.assertEqual(self.db.get(NoteEntryModel, 'entry').next_review_date, 9999999999999)
        self.assertEqual(self.submit().json()['review_log']['id'], self.attempt_id)
        self.assertEqual(self.explain(revision=1).json()['review_log']['id'], self.attempt_id)
        self.assertEqual(len(self.requests), 2)
        self.assertEqual(self.db.query(ReviewLogModel).count(), 1)
        self.assertEqual(self.submit(answer='x=2').status_code, 409)
        self.assertEqual(self.requests[-1].headers['authorization'], 'Bearer token')
        self.assertEqual(json.loads(self.requests[-1].content)['answer_text'], 'x=1')

    def test_clear_reason_in_first_answer_passes_without_followup(self):
        result = self.submit('x=1，因为等式两边减去1')
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()['status'], 'final')
        self.assertTrue(result.json()['is_correct'])
        self.assertFalse(result.json()['followup_question'])
        self.assertEqual(len(self.requests), 1)

    def test_correct_answer_with_invalid_reason_is_incorrect(self):
        self.submit()
        result = self.explain('我蒙的')
        self.assertEqual(result.status_code, 200, result.text)
        self.assertFalse(result.json()['is_correct'])
        self.assertEqual(result.json()['answer_verdict'], 'correct')
        self.assertEqual(result.json()['explanation_verdict'], 'invalid')
        self.assertEqual(result.json()['entry_review']['wrong_count'], 1)

    def test_wrong_initial_answer_cannot_be_replaced_by_later_correct_answer(self):
        self.submit('x=3')
        final = self.explain('后来发现正确答案是x=1，需要两边减去1')
        self.assertFalse(final.json()['is_correct'])
        self.assertEqual(final.json()['review_log']['answer_text'], 'x=3')

    def test_uncertainty_timeout_and_retry_do_not_create_incorrect_records(self):
        self.mode = 'unknown'
        result = self.submit('x=1，因为等式两边减去1')
        self.assertEqual(result.json()['status'], 'needs_review')
        self.assertEqual(self.db.query(ReviewLogModel).count(), 0)
        self.mode = 'normal'
        self.error = httpx.ReadTimeout('offline')
        self.assertEqual(self.submit('x=1，因为等式两边减去1').status_code, 504)
        self.assertEqual(self.db.query(ReviewLogModel).count(), 0)
        self.assertEqual(self.db.get(ReviewAttemptModel, self.attempt_id).status, 'retryable')
        self.error = None
        self.assertTrue(self.submit('x=1，因为等式两边减去1').json()['is_correct'])
        self.assertEqual(self.db.query(ReviewLogModel).count(), 1)

    def test_malformed_result_cannot_write_boolean_counts(self):
        for mutation in (lambda data: {**data, 'is_correct': True},
                         lambda data: {**data, 'status': 'final'},
                         lambda data: {**data, 'assessment': {**data['assessment'], 'answer': {
                             **data['assessment']['answer'], 'student_evidence': ['别人的作答']}}}):
            self.mutate = mutation
            self.assertEqual(self.submit().status_code, 502)
            self.assertEqual(self.db.query(ReviewLogModel).count(), 0)

    def test_question_modified_during_grading_is_not_counted(self):
        def modifying():
            self.db.get(NoteEntryModel, 'entry').question = '改过的题目'
            self.db.commit()
        self.during_model = modifying
        self.assertEqual(self.submit('x=1，因为等式两边减去1').status_code, 409)
        self.assertEqual(self.db.query(ReviewLogModel).count(), 0)

    def test_ownership_and_whitelist(self):
        self.assertEqual(self.submit(entry='secret').status_code, 404)
        for extra in ({'is_correct': True}, {'user_id': 'bob'}, {'answer_text': '   '}, {'elapsed_ms': -1}):
            self.assertEqual(self.submit(**extra).status_code, 422)
        self.assertFalse(self.requests)
        self.submit()
        self.assertEqual(self.explain(revision=999).status_code, 409)
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id='bob')
        self.assertEqual(self.submit(entry='secret').status_code, 404)
        app.dependency_overrides.pop(get_current_user)
        self.assertEqual(self.submit().status_code, 401)

    def test_busy_and_expired_lease(self):
        self.submit()
        attempt = self.db.get(ReviewAttemptModel, self.attempt_id)
        attempt.status = 'grading'
        attempt.lease_until = int(time.time()*1000)+90000
        self.db.commit()
        self.assertEqual(self.submit().status_code, 409)
        attempt.lease_until = 0
        self.db.commit()
        self.assertEqual(self.submit().json()['status'], 'awaiting_explanation')

    def test_revision_changed_during_model_cannot_finalize_an_old_result(self):
        def advancing():
            attempt = self.db.get(ReviewAttemptModel, self.attempt_id)
            attempt.revision += 1
            self.db.commit()
        self.during_model = advancing
        self.assertEqual(self.submit('x=1，因为等式两边减去1').status_code, 409)
        self.assertEqual(self.db.query(ReviewLogModel).count(), 0)

    def test_failed_explanation_can_retry_same_content_with_original_revision(self):
        self.submit()
        self.error = httpx.ConnectError('offline')
        self.assertEqual(self.explain().status_code, 503)
        self.assertEqual(self.db.query(ReviewLogModel).count(), 0)
        self.error = None
        result = self.explain(revision=1)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertTrue(result.json()['is_correct'])
        self.assertEqual(self.db.query(ReviewLogModel).count(), 1)

    def test_failed_final_commit_rolls_back_both_log_and_counter(self):
        original = self.db.commit
        calls = []
        def committing():
            calls.append(1)
            if len(calls) == 3:  # 创建尝试、领取任务已提交；最终日志/计数事务故障。
                self.db.flush()
                raise RuntimeError('simulated commit failure')
            original()
        with patch.object(self.db, 'commit', side_effect=committing):
            with self.assertRaises(RuntimeError):
                self.submit('x=1，因为等式两边减去1')
        self.db.rollback()
        self.assertEqual(self.db.query(ReviewLogModel).count(), 0)
        self.assertEqual(self.db.get(NoteEntryModel, 'entry').review_count, 0)
