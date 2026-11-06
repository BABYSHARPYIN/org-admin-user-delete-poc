/* 用户删除流程核心逻辑：与页面解耦，可在浏览器和 Node.js 中直接运行 */
(function (root) {
  'use strict';

  const TRANSFER_ROLES = ['r-admin', 'r-sub'];
  const DELETED_USER_FALLBACK = Object.freeze({
    userId: -1,
    name: '已删除用户',
    account: '-1',
    status: 'deleted',
    avatar: '删',
  });

  function isDeletedUser(user) {
    return !user || user.deleted === true || user.status === 'deleted';
  }

  function isEligibleRecipient(user, targetUserId) {
    if (!user || isDeletedUser(user) || user.status !== 'active' || (targetUserId && user.id === targetUserId)) return false;
    const roles = Array.isArray(user.roleIds) ? user.roleIds : [];
    return roles.some((roleId) => TRANSFER_ROLES.indexOf(roleId) !== -1);
  }

  function getTransferCandidates(users, targetUserId) {
    return (users || []).filter((user) => isEligibleRecipient(user, targetUserId)).map((user) => Object.assign({}, user));
  }

  function getOwnedResources(resources, userId) {
    return (resources || []).filter((resource) => resource.ownerId === userId && resource.relation === 'owner');
  }

  function createAssignments(items) {
    const assignments = {};
    (items || []).forEach((item) => { assignments[item.id] = ''; });
    return assignments;
  }

  function validateAssignments(items, assignments, users, targetUserId, label) {
    const errors = {};
    const map = assignments || {};
    (items || []).forEach((item) => {
      const assigneeId = map[item.id];
      if (!assigneeId) {
        errors[item.id] = label || '请选择接收人';
        return;
      }
      const assignee = (users || []).find((user) => user.id === assigneeId);
      if (!assignee) errors[item.id] = '接收人不存在';
      else if (!isEligibleRecipient(assignee, targetUserId)) errors[item.id] = '接收人必须是正常状态的管理员或子管理员';
    });
    return errors;
  }

  function validateHandoffs(resources, assignments, approvals, approvalAssignments, users, targetUserId) {
    const errors = Object.assign(
      {},
      validateAssignments(resources, assignments, users, targetUserId, '请选择资源接收人'),
      validateAssignments(approvals, approvalAssignments, users, targetUserId, '请选择审批接收人')
    );
    return { valid: Object.keys(errors).length === 0, errors };
  }

  function summarizeAssignments(items, assignments, users) {
    const grouped = new Map();
    (items || []).forEach((item) => {
      const assigneeId = (assignments || {})[item.id];
      if (!assigneeId) return;
      const assignee = (users || []).find((user) => user.id === assigneeId);
      const entry = grouped.get(assigneeId) || { userId: assigneeId, name: assignee ? assignee.name : '未知接收人', count: 0 };
      entry.count += 1;
      grouped.set(assigneeId, entry);
    });
    return Array.from(grouped.values());
  }

  function createApprovals() {
    return [
      { id: 'ap-drawing', name: '图纸发布审批', referenceType: '待办节点', node: '待处理', option: '转交' },
      { id: 'ap-kb', name: '知识库创建审批', referenceType: '审批中节点', node: '审批中', option: '转交' },
    ];
  }

  function summarizeApprovals(approvals) {
    const counts = {};
    const order = [];
    (approvals || []).forEach((approval) => {
      const type = approval.referenceType || '其他引用';
      if (!Object.prototype.hasOwnProperty.call(counts, type)) order.push(type);
      counts[type] = (counts[type] || 0) + 1;
    });
    return order.map((type) => ({ type, count: counts[type] }));
  }

  function canDelete(options) {
    const config = options || {};
    const validation = validateHandoffs(config.resources || [], config.assignments || {}, config.approvals || [], config.approvalAssignments || {}, config.users || [], config.targetUserId);
    const target = (config.users || []).find((user) => user.id === config.targetUserId);
    return !!target && validation.valid && config.accountInput === target.account;
  }

  function transferOwnership(options) {
    const config = options || {};
    const resource = config.resource;
    const recipient = (config.users || []).find((user) => user.id === config.recipientId);
    if (!resource || !isEligibleRecipient(recipient, resource.ownerId)) {
      return { success: false, error: '请选择状态正常的管理员或子管理员，且不能是当前所有者' };
    }
    if (config.mode !== 'success') return { success: false, error: config.mode === 'failure' ? '所有者转移失败，请重试' : '不支持的演示路径' };
    return { success: true, resource: Object.assign({}, resource, { ownerId: recipient.id }) };
  }

  function executeDeletion(options) {
    const config = options || {};
    const resources = config.resources || [];
    const assignments = config.assignments || {};
    const approvals = config.approvals || [];
    const approvalAssignments = config.approvalAssignments || {};
    const users = config.users || [];
    const targetUserId = config.targetUserId;
    const retry = config.retry === true;
    const validation = validateHandoffs(resources, assignments, approvals, approvalAssignments, users, targetUserId);
    const target = users.find((user) => user.id === targetUserId);
    const valid = validation.valid && !!target && config.accountInput === target.account;
    const recognizedMode = config.mode === 'success' || config.mode === 'failure' || config.mode === 'retry';
    const failed = !retry && (!recognizedMode || config.mode === 'failure');
    const success = valid && !failed || retry && valid;
    const error = !valid ? '所有资源和审批都需要指定合规接收人，用户暂未删除' : '处理失败，用户保持正常状态，可重试';
    return {
      taskId: 'UD-' + Date.now().toString(36).toUpperCase(),
      status: success ? 'success' : 'failed',
      userStatus: success ? 'deleted' : 'active',
      resourceCount: resources.length,
      approvalCount: approvals.length,
      resourcesTransferred: success ? resources.length : 0,
      approvalsTransferred: success ? approvals.length : 0,
      failedStep: success ? '' : 'processing',
      errorTitle: success ? '' : '删除处理失败',
      error: success ? '' : error,
      retried: retry,
      completedAt: new Date().toISOString(),
      transfers: success ? resources.map((resource) => ({ resourceId: resource.id, name: resource.name || '', type: resource.type || '', assigneeId: assignments[resource.id] || '' })) : [],
      approvalTransfers: success ? approvals.map((approval) => ({ approvalId: approval.id, name: approval.name || '', assigneeId: approvalAssignments[approval.id] || '' })) : [],
      records: success ? [
        { key: 'transfer', label: '资源所有权', detail: resources.length + ' 项已转移' },
        { key: 'approval', label: '未结束审批', detail: approvals.length + ' 条已转交' },
        { key: 'delete', label: '账号注销', detail: '已完成' },
      ] : [],
      mode: config.mode || 'success',
      account: config.account || '',
    };
  }

  function resolveUserDisplay(options) {
    const config = options || {};
    const userId = config.userId;
    const deletedUserIds = config.deletedUserIds || [];
    const user = (config.users || []).find((item) => item.id === userId);
    if (!user || deletedUserIds.indexOf(userId) !== -1 || isDeletedUser(user)) {
      return Object.assign({}, DELETED_USER_FALLBACK, { permissionSubject: null });
    }
    return Object.assign({}, user, { permissionSubject: user.id });
  }

  function resolveResourceOwner(resources, resourceId, deletedUserIds, users) {
    const resource = (resources || []).find((item) => item.id === resourceId);
    if (!resource) return { resource: null, user: null, permissionSubject: null, error: 'resource-not-found' };
    const owner = resolveUserDisplay({ users: users || [], userId: resource.ownerId, deletedUserIds: deletedUserIds || [] });
    return { resource: Object.assign({}, resource), user: owner, permissionSubject: owner.permissionSubject, error: null };
  }

  const api = {
    DELETED_USER_FALLBACK,
    isDeletedUser,
    isEligibleRecipient,
    getTransferCandidates,
    getOwnedResources,
    createAssignments,
    validateAssignments,
    validateHandoffs,
    summarizeAssignments,
    createApprovals,
    summarizeApprovals,
    executeDeletion,
    canDelete,
    transferOwnership,
    resolveUserDisplay,
    resolveResourceOwner,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.UserDeleteCore = api;
})(typeof window !== 'undefined' ? window : null);
