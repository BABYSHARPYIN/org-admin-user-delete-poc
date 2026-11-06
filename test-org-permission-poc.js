const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const core = require('./user-delete-core.js');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const users = [
  { id: 'u1', account: 'zhangwei', status: 'active', roleIds: ['r-admin'] },
  { id: 'u2', account: 'lina', status: 'active', roleIds: ['r-sub'] },
  { id: 'u3', account: 'wangqiang', status: 'active', roleIds: ['r-user'] },
  { id: 'u4', account: 'deleted', status: 'deleted', roleIds: ['r-admin'] },
  { id: 'u5', account: 'disabled', status: 'disabled', roleIds: ['r-admin'] },
];
const resource = { id: 'kb-001', ownerId: 'u1', name: '测试知识库', relation: 'owner' };
const request = { resource, users, recipientId: 'u2', mode: 'success' };
assert.deepEqual(core.getTransferCandidates(users, resource.ownerId).map((user) => user.id), ['u2']);
const success = core.transferOwnership(request);
assert.equal(success.success, true);
assert.equal(success.resource.ownerId, 'u2');
assert.equal(resource.ownerId, 'u1', 'core must not mutate caller state before commit');
assert.equal(success.resource.name, '测试知识库');
for (const recipientId of ['u1', 'u3', 'u4', 'u5', '', 'missing']) {
  assert.equal(core.transferOwnership({ ...request, recipientId }).success, false, 'invalid recipient must fail: ' + recipientId);
}
assert.equal(core.transferOwnership({ ...request, mode: 'failure' }).success, false);
assert.equal(resource.ownerId, 'u1', 'failure must preserve original owner');
assert.equal(core.transferOwnership({ ...request, mode: 'unknown' }).success, false);
assert(html.includes('id="btn-transfer-kb-owner"') && html.includes('id="modal-kb-owner-transfer"'));
assert(html.includes('id="kb-owner-name"'), 'current owner must be displayed');
assert(!html.includes('<option value="owner">'), 'normal authorization cannot directly assign owner');
assert(html.includes('member.role !== "owner"'), 'normal role editor must preserve owner');
assert(html.includes('item.account !== id || item.role === "owner"'), 'normal authorization removal must preserve owner');
assert(html.includes('const KB_ROLE_LABEL = { owner: "所有者", editor: "编辑者", viewer: "使用者" }'));
console.log('knowledge-base owner transfer tests passed');
