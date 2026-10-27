/* 用户删除流程核心逻辑：与页面解耦，可在浏览器和 Node 中直接运行 */
(function (root) {
  'use strict';

  const REJECTION_REASON = '该用户已注销';
  const TRANSFER_ROLES = ['r-admin', 'r-sub'];
  const DELETED_USER_FALLBACK = Object.freeze({
    userId: -1,
    name: '已删除用户',
    account: '-1',
    status: 'deleted',
    avatar: '删',
  });

  const STEP_DEFINITIONS = [
    { key: 'validate', label: '校验资源接收人' },
    { key: 'transfer', label: '转让资源所有权' },
    { key: 'approval', label: '驳回未结束审批' },
    { key: 'delete', label: '注销用户账号' },
    { key: 'log', label: '生成处理记录' },
  ];

  const FAILURE_STEP = {
    'transfer-failure': 'transfer',
    'approval-failure': 'approval',
    'delete-failure': 'delete',
  };

  const FAILURE_MESSAGE = {
    validate: '资源接收人校验未通过，用户暂未删除',
    transfer: '资源转让失败，用户暂未删除',
    approval: '未结束审批未全部处理，用户暂未删除',
    delete: '用户注销失败，用户保持正常状态',
    log: '处理记录生成失败，用户暂未删除',
  };

  function isDeletedUser(user) {
    return !user || user.deleted === true || user.status === 'deleted';
  }

  function isEligibleRecipient(user, targetUserId) {
    if (!user || isDeletedUser(user)) return false;
    if (targetUserId && user.id === targetUserId) return false;
    const roles = Array.isArray(user.roleIds) ? user.roleIds : [];
    return roles.some((roleId) => TRANSFER_ROLES.indexOf(roleId) !== -1);
  }

  function getTransferCandidates(users, targetUserId) {
    return (users || []).filter((user) => isEligibleRecipient(user, targetUserId)).map((user) => Object.assign({}, user));
  }

  function getOwnedResources(resources, userId) {
    return (resources || []).filter((resource) => resource.ownerId === userId && resource.relation === 'owner');
  }

  function createAssignments(resources) {
    const assignments = {};
    (resources || []).forEach((resource) => { assignments[resource.id] = ''; });
    return assignments;
  }

  function validateAssignments(resources, assignments, users, targetUserId) {
    const errors = {};
    const map = assignments || {};
    (resources || []).forEach((resource) => {
      const assigneeId = map[resource.id];
      if (!assigneeId) {
        errors[resource.id] = '请选择新的所有者';
        return;
      }
      const assignee = (users || []).find((user) => user.id === assigneeId);
      if (!assignee) errors[resource.id] = '接收人不存在';
      else if (!isEligibleRecipient(assignee, targetUserId)) errors[resource.id] = '接收人必须是正常状态的管理员或子管理员';
    });
    return { valid: Object.keys(errors).length === 0, errors };
  }

  function summarizeAssignments(resources, assignments, users) {
    const grouped = new Map();
    (resources || []).forEach((resource) => {
      const assigneeId = (assignments || {})[resource.id];
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
      { id: 'ap-drawing', name: '图纸发布审批', reference: '当前待办人', referenceType: '待办节点', node: '待处理' },
      { id: 'ap-kb', name: '知识库创建审批', reference: '当前审批人', referenceType: '审批中节点', node: '审批中' },
      { id: 'ap-agent', name: 'Agent 上线审批', reference: '发起人', referenceType: '发起人', node: '审批中' },
      { id: 'ap-file', name: '文件发布审批', reference: '抄送人', referenceType: '抄送人', node: '已抄送' },
      { id: 'ap-drawing-sign', name: '图纸会签审批', reference: '会签人', referenceType: '会签人', node: '会签中' },
      { id: 'ap-agent-add', name: 'Agent 变更审批', reference: '加签人', referenceType: '加签人', node: '加签中' },
      { id: 'ap-kb-delegate', name: '知识库授权审批', reference: '代理人', referenceType: '代理人', node: '代理处理中' },
      { id: 'ap-drawing-final', name: '图纸终审发布', reference: '最终发布人', referenceType: '最终发布人', node: '待发布' },
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
    return order.map((type) => ({ type: type, count: counts[type] }));
  }

  function executeDeletion(options) {
    const config = options || {};
    const resources = config.resources || [];
    const assignments = config.assignments || {};
    const approvals = config.approvals || [];
    const users = config.users || [];
    const targetUserId = config.targetUserId;
    const mode = config.mode || 'success';
    const resumeFrom = STEP_DEFINITIONS.some((step) => step.key === config.resumeFrom) ? config.resumeFrom : '';
    const isRetry = config.retry === true && !!resumeFrom;

    const validation = validateAssignments(resources, assignments, users, targetUserId);
    const failureKey = isRetry ? '' : validation.valid ? FAILURE_STEP[mode] : 'validate';
    const failedIndex = failureKey ? STEP_DEFINITIONS.findIndex((step) => step.key === failureKey) : -1;

    const steps = STEP_DEFINITIONS.map((step, index) => {
      const status = failedIndex === -1 || index < failedIndex ? 'done' : index === failedIndex ? 'failed' : 'pending';
      return {
        key: step.key,
        label: step.label,
        status,
        error: status === 'failed' ? FAILURE_MESSAGE[step.key] : '',
      };
    });

    const success = failedIndex === -1;
    return {
      taskId: 'UD-' + Date.now().toString(36).toUpperCase(),
      status: success ? 'success' : 'failed',
      steps,
      userStatus: success ? 'deleted' : 'active',
      rejectionReason: REJECTION_REASON,
      resourceCount: resources.length,
      approvalCount: approvals.length,
      failedStep: success ? '' : failureKey,
      retried: isRetry,
      completedAt: new Date().toISOString(),
      transfers: resources.map((resource) => ({
        resourceId: resource.id,
        name: resource.name || '',
        type: resource.type || '',
        assigneeId: assignments[resource.id] || '',
      })),
      mode,
    };
  }

  function resolveUserDisplay(options) {
    const config = options || {};
    const userId = config.userId;
    const deletedUserIds = config.deletedUserIds || [];
    const user = (config.users || []).find((item) => item.id === userId);
    const deleted = deletedUserIds.indexOf(userId) !== -1 || isDeletedUser(user);
    if (!user || deleted) {
      return Object.assign({}, DELETED_USER_FALLBACK, { permissionSubject: null });
    }
    return Object.assign({}, user, { permissionSubject: user.id });
  }

  function resolveResourceOwner(resources, resourceId, deletedUserIds, users) {
    const resource = (resources || []).find((item) => item.id === resourceId);
    if (!resource) {
      return { resource: null, user: null, permissionSubject: null, error: 'resource-not-found' };
    }
    const owner = resolveUserDisplay({ users: users || [], userId: resource.ownerId, deletedUserIds: deletedUserIds || [] });
    return {
      resource: Object.assign({}, resource),
      user: owner,
      permissionSubject: owner.permissionSubject,
      error: null,
    };
  }

  const api = {
    REJECTION_REASON,
    DELETED_USER_FALLBACK,
    STEP_DEFINITIONS: STEP_DEFINITIONS.map((step) => Object.assign({}, step)),
    isDeletedUser,
    isEligibleRecipient,
    getTransferCandidates,
    getOwnedResources,
    createAssignments,
    validateAssignments,
    summarizeAssignments,
    createApprovals,
    summarizeApprovals,
    executeDeletion,
    resolveUserDisplay,
    resolveResourceOwner,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.UserDeleteCore = api;
})(typeof window !== 'undefined' ? window : null);
