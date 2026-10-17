"""真实 ReviewPanel + useReview：理由追问、直接判定、重试与最终一次记账。需运行 Vite。"""
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

HARNESS = r'''<html><head><meta charset="UTF-8"></head><body>
<div id="app" style="height:100vh"></div><script type="module">
import Panel from '/src/components/ReviewPanel.vue';
import {useReview} from '/src/composables/useReview.ts';
import '/src/style.css';import '/src/ui-theme.css';
const source=await(await fetch('/src/components/ReviewPanel.vue')).text();
const vueUrl=source.match(/from "([^"]*\/vue\.js[^"]*)"/)[1];
const {createApp,h,ref}=await import(vueUrl);
createApp({setup(){
 const entries=ref([{id:'entry',notebookId:'book',title:'方程题',question:'解方程 x+1=2',
 correctAnswer:'x=1',wrongAnswer:'',subject:'数学',source:'',tags:['方程'],createdAt:1,updatedAt:1,reviewCount:0}]);
 const r=useReview(entries,()=> 'book');window.review=r;window.entries=entries;
 r.startReview({scope:'all',random:false});
 window.restart=()=>{r.exitReview();r.startReview({scope:'all',random:false})};window.ready=true;
 return()=>h(Panel,{entry:r.currentCard.value,answered:r.answered.value,submitting:r.savingReview.value,
 gradingAttempt:r.gradingAttempt.value,gradingError:r.gradingError.value,gradingLocked:r.gradingLocked.value,
 elapsedMs:r.elapsedMs.value,progress:r.progress.value,progressPercent:r.progressPercent.value,
 dueCount:r.dueCount.value,reviewedToday:r.reviewedToday.value,isReviewing:r.isReviewing.value,
 sessionDone:r.sessionDone.value,sessionRecords:r.sessionRecords.value,totalSessionMs:r.totalSessionMs.value,
 reviewQueue:r.reviewQueue.value,entries:entries.value,
 onRate:(rating,note,outcome)=>r.rateCard(rating,note,outcome),onOutcomeChange:r.setReviewOutcome,
 onExplain:r.explainReview,onRetryGrading:r.retryGrading,onNextReview:r.nextGradedCard,
 onExitReview:r.exitReview,onDismissSummary:r.dismissSummary});
}}).mount('#app');
</script></body></html>'''


def run():
    state = {'failure': False, 'uncertain': False, 'count': 0, 'wrong': 0}
    attempts, requests = {}, []

    def api(route):
        request = route.request
        headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
                   'Access-Control-Allow-Methods': '*'}
        if request.method == 'OPTIONS':
            route.fulfill(status=200, headers=headers)
            return
        assert request.headers.get('authorization') == 'Bearer test-token'
        path, body = urlparse(request.url).path, request.post_data_json
        requests.append((path, body))
        assert request.method == 'POST' and '/review-attempts' in path, (path, request.method)
        if state['failure']:
            route.fulfill(status=503, content_type='application/json', headers=headers,
                          body=json.dumps({'detail': '判卷服务未启动，作答已保留'}))
            return
        if path.endswith('/explanation'):
            ident = path.split('/')[-2]
            result = attempts[ident]
            result['explanation_text'] = body['explanation_text']
            result['revision'] += 1
        else:
            ident = body['attempt_id']
            result = attempts.setdefault(ident, {'attempt_id': ident, 'entry_id': path.split('/')[3], 'revision': 1,
                'answer_text': body['answer_text'], 'explanation_text': '', 'review_log': None, 'entry_review': None})
        answer, reason = result['answer_text'], result['explanation_text']
        if not result.get('review_log'):
            wrong = 'x=3' in answer or '蒙' in reason
            missing = not reason and '因为' not in answer
            status = 'needs_review' if state['uncertain'] else 'awaiting_explanation' if missing else 'final'
            correct = not wrong if status == 'final' else None
            result.update(status=status, is_correct=correct, answer_verdict='incorrect' if 'x=3' in answer else 'correct',
                explanation_verdict='uncertain' if state['uncertain'] else 'missing' if missing else 'invalid' if '蒙' in reason else 'valid',
                comment='暂时无法可靠判定' if state['uncertain'] else '请说明解题理由，尚未计入结果' if missing else '本次判为答错。关键依据不成立。' if wrong else '本次判为答对。等式变形依据成立。',
                followup_question='请说明关键方法和条件' if missing else '', grading_version='review-answer-reason-v1')
            if status == 'final':
                state['count'] += 1
                state['wrong'] += int(wrong)
                result.update(review_log={'id': ident, 'entry_id': result['entry_id'], 'timestamp': 1791806400000,
                    'quality': 'agent_incorrect' if wrong else 'agent_correct', 'is_correct': correct,
                    'elapsed_ms': 1000, 'answer_text': answer, 'review_note': result['comment']},
                    entry_review={'review_count': state['count'], 'wrong_count': state['wrong'],
                                  'last_review_date': 1791806400000, 'updated_at': 1791806400000})
        route.fulfill(content_type='application/json', headers=headers, body=json.dumps(result))

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel=os.getenv('PLAYWRIGHT_CHANNEL', 'msedge'))
        try:
            context = browser.new_context(viewport={'width': 1200, 'height': 1100}, service_workers='block')
            context.route('http://localhost:8000/**', api)
            context.route('**/review-grading-harness', lambda route: route.fulfill(content_type='text/html', body=HARNESS))
            context.route('https://fonts.googleapis.com/**', lambda route: route.abort())
            context.route('https://fonts.gstatic.com/**', lambda route: route.abort())
            context.add_init_script("localStorage.setItem('notes_app_access_token','test-token')")
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto('http://127.0.0.1:5173/review-grading-harness')
            page.wait_for_function('window.ready')
            answer = page.get_by_test_id('review-answer-input')
            answer.fill('x=1')
            page.get_by_test_id('submit-review-answer').click()
            expect(page.get_by_test_id('review-explanation-input')).to_be_visible()
            expect(answer).to_be_disabled()
            assert state['count'] == 0
            assert page.evaluate('window.review.sessionRecords.value.length') == 0
            page.get_by_test_id('review-explanation-input').fill('等式两边减去1')
            page.get_by_test_id('submit-review-explanation').click()
            expect(page.get_by_test_id('review-grade-comment')).to_contain_text('答对')
            expect(page.get_by_test_id('next-graded-review')).to_be_enabled()
            expect(page.get_by_test_id('next-graded-review')).to_have_text('结束复习')
            assert not page.evaluate('window.review.sessionDone.value')
            assert state['count'] == 1
            page.evaluate('window.review.retryGrading()')
            assert state['count'] == 1
            assert page.evaluate('window.review.sessionRecords.value.length') == 1
            output = Path('.dev-services/review-grading-complete.png')
            page.screenshot(path=str(output))
            page.get_by_test_id('next-graded-review').click()
            expect(page.get_by_text('复习完成', exact=False).first).to_be_visible()
            assert not page.evaluate('window.review.isReviewing.value')
            assert page.evaluate('window.review.progressPercent.value') == 100
            assert page.evaluate('window.review.progress.value') == '剩余 0 题'
            assert page.evaluate('window.review.sessionRecords.value.length') == 1
            page.get_by_role('button', name='返回编辑', exact=True).click()
            assert page.evaluate('window.review.mode.value') == 'edit'
            assert page.evaluate('window.review.gradingAttempt.value') is None

            page.evaluate('window.restart()')
            before = len(requests)
            answer.fill('x=1，因为两边都减去1')
            page.get_by_test_id('submit-review-answer').click()
            expect(page.get_by_test_id('next-graded-review')).to_be_enabled()
            expect(page.get_by_test_id('review-explanation-input')).to_have_count(0)
            assert len(requests) == before+1 and state['count'] == 2

            page.evaluate('window.restart()')
            answer.fill('x=1')
            page.get_by_test_id('submit-review-answer').click()
            page.get_by_test_id('review-explanation-input').fill('我蒙的')
            page.get_by_test_id('submit-review-explanation').click()
            expect(page.get_by_test_id('review-grade-comment')).to_contain_text('答错')
            assert state['wrong'] == 1 and state['count'] == 3

            page.evaluate('window.restart()')
            state['failure'] = True
            answer.fill('x=1')
            page.get_by_test_id('submit-review-answer').click()
            expect(page.get_by_role('alert')).to_contain_text('作答已保留')
            frozen_id = requests[-1][1]['attempt_id']
            assert state['count'] == 3
            state['failure'] = False
            page.get_by_test_id('submit-review-answer').click()
            expect(page.get_by_test_id('review-explanation-input')).to_be_visible()
            assert requests[-1][1]['attempt_id'] == frozen_id
            state['uncertain'] = True
            page.get_by_test_id('review-explanation-input').fill('等式两边减去1')
            page.get_by_test_id('submit-review-explanation').click()
            expect(page.get_by_test_id('review-grade-comment')).to_contain_text('无法可靠判定')
            expect(page.get_by_test_id('next-graded-review')).to_have_count(0)
            assert state['count'] == 3 and state['wrong'] == 1

            # Intermediate cards advance; only the last finalized card ends the session.
            state['uncertain'] = False
            page.evaluate("window.entries.value.push({...window.entries.value[0],id:'entry-2'});window.restart()")
            answer.fill('x=1，因为两边都减去1')
            page.get_by_test_id('submit-review-answer').click()
            expect(page.get_by_test_id('next-graded-review')).to_have_text('下一题')
            page.get_by_test_id('next-graded-review').click()
            expect(answer).to_have_value('')
            assert page.evaluate('window.review.isReviewing.value')
            assert not page.evaluate('window.review.sessionDone.value')
            answer.fill('x=1，因为两边都减去1')
            page.get_by_test_id('submit-review-answer').click()
            expect(page.get_by_test_id('next-graded-review')).to_have_text('结束复习')
            page.get_by_test_id('next-graded-review').click()
            expect(page.get_by_text('复习完成', exact=True)).to_be_visible()
            assert page.evaluate('window.review.sessionRecords.value.length') == 2
            assert page.evaluate('window.review.reviewIndex.value') == 2
            assert not page.evaluate('window.review.isReviewing.value')
            assert page.evaluate('window.review.progressPercent.value') == 100
            assert state['count'] == 5
            assert all('is_correct' not in body for _, body in requests)
            assert not errors, errors
            print('review grading browser checks passed; screenshot:', output)
        finally:
            browser.close()


if __name__ == '__main__':
    run()
