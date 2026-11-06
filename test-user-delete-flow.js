const fs = require('fs');
const path = require('path');

const root = __dirname;
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const core = require('./user-delete-core.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function test(name, run) {
  try {
    run();
    console.log('ok - ' + name);
  } catch (error) {
    console.error('not ok - ' + name + ': ' + error.message);
    process.exitCode = 1;
  }
}

const users = [
  { id: 'u1', name: '张伟', account: 'zhangwei', status: 'active', roleIds: ['r-admin'] },
  { id: 'u2', name: '李娜', account: 'lina', status: 'active', roleIds: ['r-sub'] },
  { id: 'u3', name: '王强', account: 'wangqiang', status: 'active', roleIds: ['r-user'] },
  { id: 'u4', name: '赵敏', account: 'zhaomin', status: 'active', roleIds: ['r-admin', 'r-user'] },
  { id: 'u5', name: '郑爽', account: 'zhengshuang', status: 'deleted', roleIds: ['r-sub'] },
];
const resources = [
  { id: 'r1', name: '客服知识库', type: '知识库', ownerId: 'u1', relation: 'owner' },
  { id: 'r2', name: '售前 Agent', type: 'Agent', ownerId: 'u1', relation: 'owner' },
  { id: 'r3', name: '共享知识库', type: '知识库', ownerId: 'u2', relation: 'editor' },
];
const owned = core.getOwnedResources(resources, 'u1');
const assignments = core.createAssignments(owned);
assignments.r1 = 'u2';
assignments.r2 = 'u4';
const approvals = core.createApprovals();
const approvalAssignments = core.createAssignments(approvals);
approvalAssignments[approvals[0].id] = 'u2';
approvalAssignments[approvals[1].id] = 'u4';
const approvalHistory = [
  { id: 'ap-history-pending', name: '历史节点待审核', referenceType: '历史审核节点', node: '已离开当前节点', currentNode: false, ended: false, referencedUserIds: ['u1'], fallbackAction: '回退待审核' },
  { id: 'ap-history-rejected', name: '历史节点自动驳回', referenceType: '历史审核节点', node: '已审核', currentNode: false, ended: false, referencedUserIds: ['u1'], fallbackAction: '自动驳回' },
  { id: 'ap-history-ended', name: '历史节点已结束', referenceType: '历史审核节点', node: '已结束', currentNode: false, ended: true, referencedUserIds: ['u1'], fallbackAction: '自动驳回' },
];

function runDeletion(mode, extra) {
  return core.executeDeletion(Object.assign({
    resources: owned,
    assignments,
    approvals,
    approvalAssignments,
    users,
    targetUserId: 'u1',
    accountInput: 'zhangwei',
    account: 'zhangwei',
    mode,
  }, extra || {}));
}

test('page keeps the existing user list and drawer shell', () => {
  assert(index.includes('<title>AI应用平台 · 管理后台</title>'), 'source page title is missing');
  assert(index.includes('>用户列表</h1>'), 'user list heading is missing');
  assert(index.includes('用户管理') && index.includes('id="org-tree"') && index.includes('id="user-tbody"'), 'user list shell is missing');
  assert(index.includes('id="modal-user"') && index.includes('id="btn-delete-user"'), 'user drawer delete entry is missing');
  assert(!index.includes('本地演示数据'), 'tutorial demo banner must not remain');
});

test('delete flow is one page with no progress or navigation controls', () => {
  assert(index.includes('id="delete-wizard"'), 'delete processing shell is missing');
  assert(index.includes('data-flow-page="delete"'), 'single delete processing page is missing');
  assert(!index.includes('delete-progress'), 'multi-step progress must be removed');
  assert(!index.includes('data-flow-step='), 'step panels must be removed');
  assert(!index.includes('btn-delete-next') && !index.includes('btn-delete-back'), 'next/back controls must be removed');
  assert(index.includes('id="btn-delete-account-confirm"'), 'single final confirm button is missing');
});

test('resource and approval handoffs are configured item by item', () => {
  assert(index.includes('id="delete-resource-list"') && index.includes('data-assign-resource'), 'per-resource recipient controls are missing');
  assert(index.includes('id="delete-approval-list"') && index.includes('data-assign-approval'), 'per-approval recipient controls are missing');
  assert(!index.includes('batch-assignee') && !index.includes('apply-batch-assignee') && !index.includes('data-transfer-check'), 'batch transfer controls must be removed');
  assert(!index.includes('系统统一驳回') && !index.includes('不会转交'), 'approval rejection-only copy must be removed');
  assert((index.match(/data-assign-resource/g) || []).length >= 1, 'resource assignment mount is missing');
});

test('demo data is small and scenarios are only success or failure', () => {
  assert(core.createApprovals().length >= 1 && core.createApprovals().length <= 2, 'approval demo must contain one or two items');
  assert(!index.includes('value="transfer-failure"') && !index.includes('value="approval-failure"') && !index.includes('value="delete-failure"'), 'detailed failure modes must be removed');
  const scenario = index.match(/id="delete-scenario"[\s\S]*?<\/select>/);
  assert(scenario && scenario[0].includes('value="success"') && scenario[0].includes('value="failure"'), 'only success/failure scenarios should be exposed');
  assert(!/批量|分步|步骤|向导进度/.test(index + fs.readFileSync(path.join(root, 'user-delete-core.js'), 'utf8')), 'batch and step wording must be absent');
});

test('knowledge base owner transfer entry and modal are present', () => {
  assert(index.includes('id="btn-transfer-kb-owner"'), 'knowledge-base owner transfer entry is missing');
  assert(index.includes('id="modal-kb-owner-transfer"'), 'knowledge-base owner transfer modal is missing');
  assert(index.includes('id="kb-owner-recipient"'), 'knowledge-base owner recipient picker is missing');
  assert(index.includes('转移所有者'), 'knowledge-base owner transfer copy is missing');
});

test('only active admin or sub-admin recipients are eligible', () => {
  assert(core.getTransferCandidates(users, 'u1').map((user) => user.id).join(',') === 'u2,u4', 'candidate list should be u2,u4');
  assert(!core.isEligibleRecipient(users[2], 'u1') && !core.isEligibleRecipient(users[0], 'u1'), 'normal user and target must be rejected');
  assert(!core.isEligibleRecipient(users[4], 'u1'), 'deleted recipient must be rejected');
});

test('only owner resources enter transfer and every approval has a recipient', () => {
  assert(owned.length === 2 && owned.every((resource) => resource.relation === 'owner'), 'only owner resources should be transferable');
  assert(approvals.length >= 1 && approvals.length <= 2, 'approval fixture should be small');
  assert(approvals.every((approval) => approval.option === '审核转让'), 'approvals should use handoff semantics');
});

test('only current unfinished approvals referencing the target enter the handoff list', () => {
  const mixed = approvals.concat(approvalHistory, [
    { id: 'ap-other-user', name: '他人审批', currentNode: true, ended: false, referencedUserIds: ['u2'], assigneeId: 'u1' },
    { id: 'ap-ended-current', name: '已结束审批', currentNode: true, ended: true, referencedUserIds: ['u1'], assigneeId: 'u1' },
  ]);
  const current = core.getCurrentNodeApprovals(mixed, 'u1');
  assert(current.map((approval) => approval.id).join(',') === approvals.map((approval) => approval.id).join(','), 'historical, ended, and unrelated approvals must be excluded');
});

test('handoff validation covers resources and approvals', () => {
  const valid = core.validateHandoffs(owned, assignments, approvals, approvalAssignments, users, 'u1');
  assert(valid.valid === true, 'eligible resource and approval recipients should pass');
  const missing = core.validateHandoffs(owned, assignments, approvals, {}, users, 'u1');
  assert(missing.valid === false && Object.keys(missing.errors).length === approvals.length, 'each missing approval recipient should fail');
  const bad = Object.assign({}, assignments, { r2: 'u3' });
  assert(core.validateHandoffs(owned, bad, approvals, approvalAssignments, users, 'u1').valid === false, 'normal user assignment must fail');
  assert(typeof core.applyBatchAssignment === 'undefined', 'batch assignment helper must be removed');
});

test('successful deletion transfers resources and approvals then deletes the user', () => {
  const result = runDeletion('success', { approvals: approvals.concat(approvalHistory) });
  assert(result.status === 'success' && result.userStatus === 'deleted', 'success mode should delete user');
  assert(result.resourcesTransferred === 2 && result.approvalsTransferred === approvals.length, 'handoffs should be recorded');
  assert(result.transfers.every((item) => item.assigneeId !== 'u1'), 'resource transfers must not go to target');
  assert(result.approvalTransfers.every((item) => item.assigneeId !== 'u1'), 'approval transfers must not go to target');
  assert(result.approvalFallbacks.map((item) => item.action).join(',') === '回退待审核,自动驳回,未知用户', 'historical nodes should use fallback handling');
  assert(result.records.some((record) => record.label === '审核节点兜底'), 'result should summarize approval-node fallback');
});

test('failure keeps user active and retry returns to the same processing page', () => {
  const failed = runDeletion('failure');
  assert(failed.status === 'failed' && failed.userStatus === 'active', 'failure must keep user active');
  assert(failed.failedStep === 'processing', 'failure should expose one processing failure');
  const retried = runDeletion('failure', { retry: true });
  assert(retried.status === 'success' && retried.userStatus === 'deleted' && retried.retried === true, 'retry should complete deletion');
});

test('exact account confirmation is required and Enter is suppressed', () => {
  assert(index.includes('id="delete-account-input"') && index.includes('id="delete-confirm-error"'), 'account confirmation field is missing');
  assert(index.includes('账号输入完全一致'), 'exact account requirement copy is missing');
  assert(/event\.key\s*===\s*["']Enter["']/.test(index) && /preventDefault\(\)/.test(index), 'Enter must be suppressed');
});

test('deleted and missing owners use the placeholder identity', () => {
  const fallback = core.resolveUserDisplay({ users, userId: 'u1', deletedUserIds: ['u1'] });
  assert(fallback.userId === -1 && fallback.name === '已删除用户' && fallback.permissionSubject === null, 'deleted owner should use placeholder');
  assert(core.resolveResourceOwner(resources, 'missing', [], users).error === 'resource-not-found', 'missing resource should stay not-found');
});

test('inactive recipients cannot receive resources or approvals', () => {
  ['disabled', 'inactive', 'suspended', undefined].forEach((status) => {
    assert(!core.isEligibleRecipient({ id: 'u7', status, roleIds: ['r-admin'] }, 'u1'), 'non-active status must not receive ownership: ' + status);
  });
});

test('delete gate requires exact nonempty account and all handoffs', () => {
  const request = { resources: owned, assignments, approvals, approvalAssignments, users, targetUserId: 'u1', accountInput: 'zhangwei' };
  assert(core.canDelete(request), 'complete configuration and exact account should enable deletion');
  ['', ' zhangwei', 'zhangwei ', 'Zhangwei', '张伟'].forEach((accountInput) => {
    assert(!core.canDelete(Object.assign({}, request, { accountInput })), 'account must match exactly: ' + accountInput);
  });
  assert(!core.canDelete(Object.assign({}, request, { approvalAssignments: {} })), 'missing approval receiver must disable deletion');
  assert(!core.canDelete(Object.assign({}, request, { assignments: {} })), 'missing resource receiver must disable deletion');
  assert(!core.canDelete({}), 'missing target cannot pass confirmation');
  assert(!core.canDelete(Object.assign({}, request, { account: 'spoofed', accountInput: 'spoofed' })), 'gate must derive the account from target');
  const deletedUsers = users.map((user) => user.id === 'u1' ? Object.assign({}, user, { status: 'deleted', deleted: true }) : user);
  assert(!core.canDelete(Object.assign({}, request, { users: deletedUsers })), 'deleted target must not be deleted again');
  assert(!core.canDelete(Object.assign({}, request, { users: users.map((user) => user.id === 'u1' ? Object.assign({}, user, { status: 'disabled' }) : user) })), 'inactive target must not be deleted');
});

test('execution revalidates account, recipients and target even on retry', () => {
  const invalidAccount = runDeletion('success', { accountInput: 'wrong' });
  assert(invalidAccount.status === 'failed' && invalidAccount.transfers.length === 0 && invalidAccount.approvalTransfers.length === 0, 'invalid account must not publish completed transfers');
  assert(invalidAccount.error.includes('账号输入') || invalidAccount.error.includes('账号'), 'invalid account should explain the account mismatch');
  const deletedTarget = runDeletion('success', { users: users.map((user) => user.id === 'u1' ? Object.assign({}, user, { status: 'deleted', deleted: true }) : user) });
  assert(deletedTarget.status === 'failed' && deletedTarget.userStatus === 'active', 'deleted target must fail closed');
  const invalidRetry = runDeletion('failure', { retry: true, approvalAssignments: {} });
  assert(invalidRetry.status === 'failed' && invalidRetry.userStatus === 'active', 'retry must revalidate handoffs');
  assert(runDeletion('unsupported-mode').status === 'failed', 'unsupported scenario must fail closed');
});

if (process.exitCode) process.exit(process.exitCode);
console.log('user delete flow tests passed');
