# 复习窗口：先核对答案，再核对解题依据

“提交作答”进入专用判卷接口；首次作答既包含答案又有清楚的理由时直接完成判定，
不要求重复解释。只有缺少关键理由时才留在当前题，追问并等待补充。
这次作答的原文始终保留，补充理由不会覆盖首次答案。

最终合并规则：

| 答案判断 A | 理由判断 R | 状态 | 最终 is_correct |
| --- | --- | --- | --- |
| 正确 | 成立 | 完成 | true |
| 错误 | 成立或明确错误 | 完成 | false |
| 正确 | 明确错误（包含蒙、抄或错误概念） | 完成 | false |
| 已判断对错 | 缺少理由 | 等待解释 | null |
| 任一无法可靠判定 | 任意 | 待核对 | null |

也就是可可靠判定时 `Y = (A == correct) AND (R == valid)`。
缺理由或证据不足是未完成状态，不能转换为 false。
自然语言、公式、演算均可说明理由，无须固定出现“因为/所以”。
非未知判断必须附本题学生作答与题干/参考答案/材料的逐字引文，两侧服务都会校验。
题目或参考答案不全、正文截断、依赖未读取图形时保留待核对。
引用校验能约束模型猜测，但不能数学证明语义判断正确；界面明确标注 AI 建议。

## 接口

均带 `Authorization: Bearer ...`，只允许当前账号自己的题目。

`POST /api/entries/{entry_id}/review-attempts`

```json
{"attempt_id":"客户端生成的 UUID","answer_text":"x=1，因为等式两边减去1","elapsed_ms":30000}
```

客户端不能提交 is_correct、评分结果或 user_id。原始答题用时在首次提交时固定，
等待模型的时间不计入原始答题用时。同一 attempt_id 的作答不得被修改；重复请求返回原结果。

`POST /api/entries/{entry_id}/review-attempts/{attempt_id}/explanation`

```json
{"explanation_text":"等式两边同时减去1，等式仍成立。","expected_revision":1}
```

使用上次响应的 revision。重复最终提交不再次记账；失败后允许相同内容与原 revision 重试。
并发状态变化返回 409，前端会读取最新状态后保留理由供再次提交。

`GET /api/entries/{entry_id}/review-attempts/{attempt_id}` 可读回持久化状态和最终结果。

响应包含 attempt_id、entry_id、revision、status、answer_verdict、explanation_verdict、
is_correct、comment、followup_question、answer_text、explanation_text、review_log、entry_review。
status 可为 ready、grading、retryable、awaiting_explanation、needs_review、final。
最终前 review_log/entry_review/is_correct 为空。完成后返回已保存日志及最新计数，
前端仅更新本地缓存，不再次上传日志或计数。

查询服务提供只读 `POST /review/grade`。业务后端只转发题目 ID、首次作答和补充理由；
查询服务重新验证身份与题目归属，读取最新原题，使用结构化输出分别判定答案与理由。
模型超时 25 秒且不自动重试，模型失败转为待核对；网络失败不会生成错误记录。

## 记录与并发

`review_attempts` 保存作答、理由、题目指纹、revision、状态和模型依据。
模型调用期间释放 MySQL 事务连接。90 秒任务租约避免重复同时判卷；过期后可以重试。
结果必须仍对应当前 revision 和题目正文；题目被修改返回 409，需要重新作答。
最终复习日志与 review_count/last_review_date 在同一事务写入，attempt UUID 也是日志主键。
只有最终 false 增加答错次数；已提交但等待理由、待核对及服务失败均不计入完成次数。
本接口保留已有复习排期和掌握等级，不把单次判卷结果自动变成 SRS 评级。

判定版本为 `review-answer-reason-v1`，日志 quality 为 agent_correct/agent_incorrect。
数据库 review_note 保存结构化依据，返回页面时转换为可读的理由和点评。
这里的“答错”指答案/理由双检后的本次复习任务不通过，包含答案碰巧正确但理由错误。
该标签与旧记录只按选项判断的标签存在口径差异，未来训练/评估应按判定版本审计，
不能直接声称混合旧新标签的模型已验证这一新判卷标准。

## 部署与验证

新增迁移 a7c1e3f90642（从 f6b0d2e89531 升级）建立 review_attempts。
本机已应用此迁移；其他环境先执行 `alembic upgrade head`。
不需要改变查询服务 MODEL 配置；当前实现按文字材料判卷，不提供图形识别。

离线测试覆盖清楚理由直接判定、裸答案追问、答案正确理由错误、错误初答保留、
不可靠依据/网络失败不计数、题目变更、权限、重复提交、过期租约、版本竞争和事务回滚。
Playwright 使用真实 ReviewPanel/useReview 与模拟判卷接口，覆盖首次作答、补充理由、
最终反馈、断线同 ID 重试、本地缓存和不可靠判断留在当前题。上述自动测试使用模拟模型。

本次相关回归：查询服务 78 项、业务后端 62 项，共 140 项通过，类型检查和浏览器流程通过。
另用已配置模型执行 4 组合成方程题：裸答案返回等待解释，首次清楚解释直接通过，
补充有效解释通过，正确答案加“我蒙的”理由判为错误，四组结果符合规则。
这些小样本验证了接口和规则运行，不代表对所有学科、主观题或图形题的准确率评估。
