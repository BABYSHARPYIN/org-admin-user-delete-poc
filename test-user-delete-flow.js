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

function runDeletion(mode, extra) {
  return core.executeDeletion(Object.assign({
    resources: owned,
    assignments,
    approvals,
    users,
    targetUserId: 'u1',
    mode,
  }, extra || {}));
}

const users = [
  { id: 'u1', name: '张伟', account: 'zhangwei', status: 'active', roleIds: ['r-admin'] },
  { id: 'u2', name: '李娜', account: 'lina', status: 'active', roleIds: ['r-sub'] },
  { id: 'u3', name: '王强', account: 'wangqiang', status: 'active', roleIds: ['r-user'] },
  { id: 'u4', name: '赵敏', account: 'zhaomin', status: 'active', roleIds: ['r-admin', 'r-user'] },
  { id: 'u5', name: '郑爽', account: 'zhengshuang', status: 'deleted', roleIds: ['r-sub'] },
  { id: 'u6', name: '钱七', account: 'qianqi', status: 'active', deleted: true, roleIds: ['r-admin'] },
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

test('page is based on the org-admin-poc user list shell', () => {
  assert(index.includes('<title>AI应用平台 · 管理后台</title>'), 'source page title is missing');
  assert(index.includes('>用户列表</h1>'), 'user list heading is missing');
  assert(index.includes('用户管理'), 'live sidebar label is missing');
  assert(index.includes('id="org-tree"'), 'source organization tree is missing');
  assert(index.includes('id="user-tbody"'), 'source user table is missing');
  assert(index.includes('placeholder="请输入搜索内容"'), 'source user search is missing');
  assert(index.includes('>账号类型</th>'), 'source account-type column is missing');
  assert(index.includes('>组织信息</th>'), 'source organization column is missing');
  assert(index.includes('id="org-tree"'), 'source org tree is missing');
  assert(index.includes('>账号类型</span>') || index.includes('>账号类型</label>'), 'source account-type drawer field is missing');
  assert(!index.includes('本地演示数据'), 'tutorial demo banner must not remain');
});

test('drawer stays basic-info-only and entry opens the delete wizard', () => {
  assert(index.includes('id="modal-user"'), 'existing user drawer is missing');
  assert(index.includes('id="btn-delete-user"'), 'delete entry in drawer is missing');
  assert(index.includes('id="delete-wizard"'), 'delete wizard is missing');
  assert(index.includes('data-delete-open'), 'drawer delete button should open the wizard');
  assert(index.includes('id="btn-edit-user"'), 'drawer edit action is missing');
  assert(index.includes('id="user-footer-view"'), 'drawer read-only mode is missing');
  assert(index.includes('data-flow-step="impact"'), 'impact-check step is missing');
  assert(index.includes('data-flow-step="transfer"'), 'transfer step is missing');
  assert(index.includes('data-flow-step="confirm"'), 'final-confirm step is missing');
  assert(!index.includes('data-page="user-detail"'), 'obsolete detail page should not return');
  assert(index.includes('影响检查'), 'impact-check copy is missing');
});

test('wizard shows both owned resources and unfinished approvals read-only first', () => {
  assert(index.includes('资源影响'), 'resource impact section is missing');
  assert(index.includes('未结束审批'), 'approval impact section is missing');
  assert(index.includes('id="delete-resource-list"'), 'resource list mount is missing');
  assert(index.includes('id="delete-approval-list"'), 'approval list mount is missing');
  assert(index.includes('知识库') && index.includes('Agent') && index.includes('图纸'), 'resource fixtures are incomplete');
});

test('transfer UI has per-item and batch assignment controls', () => {
  assert(index.includes('id="batch-assignee"'), 'batch recipient select is missing');
  assert(index.includes('data-action="apply-batch-assignee"'), 'batch transfer action is missing');
  assert(index.includes('批量转让给'), 'batch transfer label is missing');
  assert(index.includes('data-assign-resource'), 'per-item transfer select is missing');
  assert(index.includes('已使用单独配置'), 'single override hint is missing');
});

test('approval handoff is rejected, never transferred', () => {
  assert(index.includes('该用户已注销'), 'fixed rejection reason is missing');
  assert(index.includes('系统驳回'), 'system rejection copy is missing');
  assert(index.includes('不会转交'), 'no-handoff copy is missing');
  assert(index.includes('id="delete-approval-list"'), 'approval list is missing');
});

test('final confirmation requires exact account and ignores Enter', () => {
  assert(index.includes('id="delete-account-input"'), 'account confirmation input is missing');
  assert(index.includes('id="btn-delete-account-confirm"'), 'account confirmation button is missing');
  assert(index.includes('id="delete-confirm-error"'), 'account confirmation error mount is missing');
  assert(/event\.key\s*===\s*["']Enter["']/.test(index) && /preventDefault\(\)/.test(index), 'Enter must be suppressed in the confirm step');
  assert(index.includes('账号输入完全一致'), 'exact account requirement copy is missing');
});

test('success, failure, retry, and deleted-user fallback paths are present', () => {
  assert(index.includes('转让失败'), 'transfer-failure demo path is missing');
  assert(index.includes('审批失败'), 'approval-failure demo path is missing');
  assert(index.includes('删除失败'), 'delete-failure demo path is missing');
  assert(index.includes('重试'), 'retry action is missing');
  assert(index.includes('查看处理记录'), 'processing record entry is missing');
  assert(index.includes('已删除用户'), 'deleted-user placeholder is missing');
  assert(index.includes('user_id = -1'), 'fallback user_id is missing');
  assert(index.includes('工艺文件包'), 'file resource fixture is missing');
});

test('only active admin or sub-admin recipients are eligible', () => {
  const candidates = core.getTransferCandidates(users, 'u1');
  assert(candidates.map((user) => user.id).join(',') === 'u2,u4', 'candidate list should be u2,u4');
  assert(!core.isEligibleRecipient(users[2], 'u1'), 'normal user must not receive ownership');
  assert(!core.isEligibleRecipient(users[0], 'u1'), 'target user must not receive ownership');
  assert(!core.isEligibleRecipient(users[4], 'u1'), 'deleted user must not receive ownership');
  assert(!core.isEligibleRecipient(users[5], 'u1'), 'explicitly deleted user must not receive ownership');
});

test('only owner resources enter transfer, not shared editor relations', () => {
  assert(owned.length === 2, 'editor relation must be excluded from transfer');
  assert(owned.every((resource) => resource.relation === 'owner'), 'only owner resources are transferable');
});

test('per-item assignments validate and can mix recipients', () => {
  assert(core.validateAssignments(owned, assignments, users, 'u1').valid === true, 'eligible recipients should pass');
  const summary = core.summarizeAssignments(owned, assignments, users);
  assert(summary.length === 2, 'two recipients should be summarized');
  assert(summary.map((item) => item.count).sort().join(',') === '1,1', 'each recipient should own one resource');
  const bad = Object.assign({}, assignments, { r2: 'u3' });
  assert(core.validateAssignments(owned, bad, users, 'u1').valid === false, 'normal user assignment must fail');
});

test('batch assignment fills selected resources and single overrides remain', () => {
  const next = core.applyBatchAssignment(owned, assignments, ['r1'], 'u4');
  assert(next.r1 === 'u4', 'batch assignment should update selected resource');
  assert(next.r2 === 'u4', 'unselected assignment should stay unchanged');
  const override = core.applyBatchAssignment(owned, assignments, ['r1'], 'u2');
  assert(override.r1 === 'u2' && override.r2 === 'u4', 'single assignment should override only its resource');
});

test('approvals are counted and all get the fixed rejection reason', () => {
  assert(approvals.length === 8, 'approval fixture should cover every user reference type');
  const types = approvals.map((approval) => approval.referenceType);
  ['待办节点', '审批中节点', '发起人', '抄送人', '会签人', '加签人', '代理人', '最终发布人'].forEach((type) => {
    assert(types.includes(type), 'missing approval reference type: ' + type);
  });
  assert(core.summarizeApprovals(approvals).length === 8, 'approval summary should group by type');
  assert(approvals.every((approval) => approval.rejectionReason === '该用户已注销'), 'all approvals use fixed rejection reason');
});

test('successful deletion completes the task and records transfers', () => {
  const result = runDeletion('success');
  assert(result.status === 'success', 'success mode should finish');
  assert(result.userStatus === 'deleted', 'successful deletion should mark user deleted');
  assert(result.steps.length === 5, 'task should have five backend steps');
  assert(result.steps.every((step) => step.status === 'done'), 'all backend steps should complete');
  assert(result.rejectionReason === '该用户已注销', 'task should record fixed rejection reason');
  assert(result.transfers.length === 2, 'task should record both transfers');
  assert(result.transfers.every((item) => item.assigneeId !== 'u1'), 'transfers must not go to target');
});

test('failures leave the user active and expose failed step for retry', () => {
  const modes = {
    'transfer-failure': 'transfer',
    'approval-failure': 'approval',
    'delete-failure': 'delete',
  };
  Object.keys(modes).forEach((mode) => {
    const result = runDeletion(mode);
    assert(result.status === 'failed', mode + ' should fail');
    assert(result.userStatus === 'active', mode + ' must leave user active');
    assert(result.failedStep === modes[mode], mode + ' should report the failed step');
    const failed = result.steps.find((step) => step.key === modes[mode]);
    assert(failed && failed.status === 'failed', mode + ' should mark its step failed');
  });
  const failedDelete = runDeletion('delete-failure');
  const retried = runDeletion('retry', { retry: true, resumeFrom: failedDelete.failedStep });
  assert(retried.status === 'success', 'retry should complete');
  assert(retried.userStatus === 'deleted', 'successful retry deletes the user');
  assert(retried.retried === true, 'retry should be flagged');
});

test('deleted and missing owners fall back to placeholder identity', () => {
  const fallback = core.resolveUserDisplay({ users, userId: 'u1', deletedUserIds: ['u1'] });
  assert(fallback.userId === -1 && fallback.name === '已删除用户', 'deleted owner should use placeholder');
  assert(fallback.permissionSubject === null, 'placeholder must not become a permission subject');
  const live = core.resolveUserDisplay({ users, userId: 'u2', deletedUserIds: ['u1'] });
  assert(live.name === '李娜' && live.permissionSubject === 'u2', 'live user should remain permission subject');
  const missing = core.resolveUserDisplay({ users, userId: 'missing', deletedUserIds: [] });
  assert(missing.userId === -1, 'unknown owner should use placeholder');
  const resource = core.resolveResourceOwner(resources, 'r1', ['u1'], users);
  assert(resource.user.name === '已删除用户' && resource.permissionSubject === null, 'deleted owner resource must use fallback');
  assert(core.resolveResourceOwner(resources, 'missing', ['u1'], users).error === 'resource-not-found', 'missing resource should stay not-found');
});

if (process.exitCode) process.exit(process.exitCode);
console.log('user delete flow tests passed');
