const fs = require('fs');
const path = require('path');

const root = __dirname;
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const coreSource = fs.readFileSync(path.join(root, 'user-delete-core.js'), 'utf8');
const core = require('./user-delete-core.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// —— 页面结构约束 ——
assert(index.includes('id="page-user-detail"'), 'user detail page is missing');
assert(index.includes('data-action="open-delete-flow"'), 'delete entry is missing');
assert(index.includes('id="delete-wizard"'), 'delete wizard is missing');
assert(index.includes('影响检查') && index.includes('资源与审批处理') && index.includes('最终确认'), 'three-step wizard copy is missing');
assert(index.includes('该用户已注销'), 'system rejection reason is missing');
assert(index.includes('id="batch-assignee"'), 'batch transfer recipient select is missing');
assert(index.includes('data-action="apply-batch-assignee"'), 'batch transfer action is missing');
assert(index.includes('批量转让给'), 'batch transfer copy is missing');
assert(index.includes('已使用单独配置'), 'single override hint is missing');
assert(index.includes('已删除用户'), 'deleted user placeholder is missing');
assert(index.includes('查看处理记录'), 'processing record entry is missing');
assert(index.includes('工艺文件包'), 'file resource fixture is missing');
assert(coreSource.includes('待办节点') && coreSource.includes('审批中节点') && coreSource.includes('会签人') && coreSource.includes('加签人') && coreSource.includes('代理人'), 'approval reference coverage is missing');

// —— 接收人资格 ——
const users = [
  { id: 'u1', name: '张伟', status: 'active', roleIds: ['r-admin'] },
  { id: 'u2', name: '李娜', status: 'active', roleIds: ['r-sub'] },
  { id: 'u3', name: '王强', status: 'active', roleIds: ['r-user'] },
  { id: 'u4', name: '赵敏', status: 'active', roleIds: ['r-ops', 'r-user'] },
  { id: 'u5', name: '郑爽', status: 'deleted', roleIds: ['r-sub'] },
  { id: 'u6', name: '钱七', status: 'active', roleIds: ['r-admin'], deleted: true },
];
const candidates = core.getTransferCandidates(users, 'u1');
assert(candidates.length === 1, 'only active sub-admin should remain eligible');
assert(candidates[0].id === 'u2', 'eligible candidate should be the active sub-admin');
assert(!core.isEligibleRecipient(users[2], 'u1'), 'normal user must not receive ownership');
assert(!core.isEligibleRecipient(users[0], 'u1'), 'target user must not receive ownership');
assert(!core.isEligibleRecipient(users[4], 'u1'), 'deleted user must not receive ownership');

// —— 仅所有者资源需要转让 ——
const resources = [
  { id: 'r1', name: '客服知识库', type: '知识库', ownerId: 'u1', relation: 'owner' },
  { id: 'r2', name: '售前 Agent', type: 'Agent', ownerId: 'u1', relation: 'owner' },
  { id: 'r3', name: '共享知识库', type: '知识库', ownerId: 'u2', relation: 'editor' },
];
const owned = core.getOwnedResources(resources, 'u1');
assert(owned.length === 2, 'editor relation must be excluded from transfer');
assert(owned.every((resource) => resource.relation === 'owner'), 'only owner resources are transferable');

// —— 逐项转让校验 ——
const assignments = core.createAssignments(owned);
const emptyCheck = core.validateAssignments(owned, assignments, users, 'u1');
assert(emptyCheck.valid === false, 'unassigned resources must block transfer');
assert(emptyCheck.errors.r1 && emptyCheck.errors.r2, 'every unassigned resource should report an error');

assignments.r1 = 'u2';
assignments.r2 = 'u2';
assert(core.validateAssignments(owned, assignments, users, 'u1').valid === true, 'eligible recipient should pass validation');

assignments.r2 = 'u3';
assert(core.validateAssignments(owned, assignments, users, 'u1').valid === false, 'normal user assignment must fail');

assignments.r1 = 'u1';
assignments.r2 = 'u2';
assert(core.validateAssignments(owned, assignments, users, 'u1').valid === false, 'assigning back to the deleted user must fail');

// —— 逐项转让，不合并 ——
assignments.r1 = 'u2';
assignments.r2 = 'u2';
const summary = core.summarizeAssignments(owned, assignments, users);
assert(summary.length === 1 && summary[0].userId === 'u2' && summary[0].count === 2, 'summary should group by recipient');
assignments.r2 = 'u2';

// —— 执行结果 ——
const approvals = core.createApprovals();
assert(approvals.length === 8, 'approval fixture should cover every user reference type');
const referenceTypes = approvals.map((approval) => approval.referenceType);
['待办节点', '审批中节点', '发起人', '抄送人', '会签人', '加签人', '代理人', '最终发布人'].forEach((type) => {
  assert(referenceTypes.indexOf(type) !== -1, 'approval reference type missing: ' + type);
});
const approvalSummary = core.summarizeApprovals(approvals);
assert(approvalSummary.length === 8, 'approval summary should group by reference type');

function runDeletion(mode, extra) {
  return core.executeDeletion(Object.assign({ resources: owned, assignments, approvals, users, targetUserId: 'u1', mode }, extra || {}));
}

const success = runDeletion('success');
assert(success.status === 'success', 'success mode should finish');
assert(success.userStatus === 'deleted', 'successful deletion should mark user deleted');
assert(success.steps.length === 5, 'deletion task should have five steps');
assert(success.steps.every((step) => step.status === 'done'), 'successful task should complete every step');
assert(success.rejectionReason === '该用户已注销', 'approval rejection reason is fixed');
assert(success.transfers.length === 2 && success.transfers.every((item) => item.assigneeId === 'u2'), 'successful task should record per-resource transfers');

const transferFailure = runDeletion('transfer-failure');
assert(transferFailure.status === 'failed', 'transfer failure should fail the task');
assert(transferFailure.userStatus === 'active', 'transfer failure must keep the user alive');
assert(transferFailure.steps.find((step) => step.key === 'transfer').status === 'failed', 'failed step should be transfer');
assert(transferFailure.steps.find((step) => step.key === 'delete').status === 'pending', 'later steps must stay pending');

const approvalFailure = runDeletion('approval-failure');
assert(approvalFailure.userStatus === 'active', 'approval failure must keep the user alive');
assert(approvalFailure.steps.find((step) => step.key === 'approval').status === 'failed', 'failed step should be approval');

const deleteFailure = runDeletion('delete-failure');
assert(deleteFailure.userStatus === 'active', 'account deletion failure must keep the user alive');
assert(deleteFailure.steps.find((step) => step.key === 'delete').status === 'failed', 'failed step should be delete');
assert(deleteFailure.failedStep === 'delete', 'failed step key should be returned for retry');

const retried = runDeletion('retry', { retry: true, resumeFrom: deleteFailure.failedStep });
assert(retried.status === 'success', 'retry should complete the remaining steps');
assert(retried.userStatus === 'deleted', 'successful retry should delete the user');
assert(retried.retried === true, 'retry result should be flagged');
assert(retried.steps.every((step) => step.status === 'done'), 'retry should finish all steps');
assert(typeof retried.completedAt === 'string' && retried.completedAt.length > 0, 'task should record completion time');

const invalidRetry = runDeletion('retry', { retry: true, resumeFrom: 'unknown-step' });
assert(invalidRetry.status === 'success', 'unknown resume step should fall back to a normal successful run');

// —— 查询兜底与权限边界 ——
const fallback = core.resolveUserDisplay({ users, userId: 'u1', deletedUserIds: ['u1'] });
assert(fallback.userId === -1 && fallback.name === '已删除用户', 'deleted owner should fall back to the placeholder identity');
assert(fallback.permissionSubject === null, 'placeholder identity must not become a permission subject');
const liveUser = core.resolveUserDisplay({ users, userId: 'u2', deletedUserIds: ['u1'] });
assert(liveUser.name === '李娜' && liveUser.permissionSubject === 'u2', 'live user should stay the permission subject');
const missingUser = core.resolveUserDisplay({ users, userId: 'missing', deletedUserIds: [] });
assert(missingUser.userId === -1, 'unknown owner should also use the placeholder identity');
const missingResource = core.resolveResourceOwner(resources, 'missing-resource', ['u1']);
assert(missingResource.error === 'resource-not-found', 'missing resource must stay not-found');

console.log('user delete flow core test passed');
