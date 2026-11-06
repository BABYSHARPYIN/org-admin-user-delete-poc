// Execute the real page script in Node with a small DOM boundary; no browser is started.
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const core = require('./user-delete-core');
const html = fs.readFileSync(require('path').join(__dirname, 'index.html'), 'utf8');

function loadPage(approvalFixtures, coreOverrides = {}) {
  const all = [];
  class Element {
    constructor(tag = 'div', attributes = '') {
      this.tag = tag;
      this.attributes = {};
      this.dataset = {};
      this.children = [];
      this.listeners = {};
      this.style = {};
      this.value = '';
      this.textContent = '';
      this.disabled = /(?:^|\s)disabled(?:\s|$)/.test(attributes);
      this.hidden = /(?:^|\s)hidden(?:\s|$)/.test(attributes);
      const classes = new Set();
      this.classList = {
        add: (value) => classes.add(value),
        remove: (value) => classes.delete(value),
        contains: (value) => classes.has(value),
        toggle: (value, force) => {
          const active = force === undefined ? !classes.has(value) : force;
          if (active) classes.add(value); else classes.delete(value);
        },
      };
      Object.defineProperty(this, 'className', { set: (value) => { classes.clear(); value.split(/\s+/).forEach((name) => classes.add(name)); } });
      for (const match of attributes.matchAll(/([\w-]+)="([^"]*)"/g)) this.setAttribute(match[1], match[2]);
      all.push(this);
    }
    setAttribute(name, value) {
      this.attributes[name] = value;
      if (name === 'id') this.id = value;
      if (name === 'value') this.value = value;
      if (name === 'class') this.className = value;
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    }
    getAttribute(name) { return this.attributes[name]; }
    set innerHTML(value) {
      this.markup = value;
      const remove = (node) => { node.children.forEach(remove); const i = all.indexOf(node); if (i >= 0) all.splice(i, 1); };
      this.children.forEach(remove);
      this.children = [];
      for (const match of value.matchAll(/<(button|select|input|option)\b([^>]*)>/g)) this.appendChild(new Element(match[1], match[2]));
    }
    get innerHTML() { return this.markup || ''; }
    appendChild(child) { this.children.push(child); child.parent = this; return child; }
    replaceChildren() { this.innerHTML = ''; }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    dispatch(name, extras = {}) { const event = { target: this, preventDefault() { this.prevented = true; }, stopPropagation() {}, ...extras }; (this.listeners[name] || []).forEach((callback) => callback(event)); return event; }
    click() { if (!this.disabled) this.dispatch('click'); }
    focus() { this.focused = true; }
    scrollIntoView() {}
    remove() {}
    closest() { return { style: {} }; }
    querySelectorAll(selector) { const descendants = []; const collect = (node) => node.children.forEach((child) => { descendants.push(child); collect(child); }); collect(this); return select(selector, descendants); }
  }
  function select(selector, source = all) {
    return source.filter((element) => selector.split(',').some((part) => {
      const query = part.trim();
      if (query.startsWith('.')) return element.classList.contains(query.slice(1));
      if (query.startsWith('#')) return element.id === query.slice(1);
      const match = query.match(/^(\w+)?\[([\w-]+)(?:="([^"]*)")?\]$/);
      return match && (!match[1] || element.tag === match[1]) && element.attributes[match[2]] !== undefined && (match[3] === undefined || element.attributes[match[2]] === match[3]);
    }));
  }
  // Register actual static controls and their IDs; renderers populate their own children.
  for (const match of html.split('<script')[0].matchAll(/<([a-z][\w-]*)\b([^>]*)>/g)) {
    if (/\bid="|\bdata-|class="[^"]*(?:modal-mask|nav-item|delete-body)|name="kb-vis"/.test(match[2])) new Element(match[1], match[2]);
  }
  const document = {
    getElementById: (id) => { const element = all.find((item) => item.id === id); assert(element, 'page references missing id: ' + id); return element; },
    querySelectorAll: (selector) => select(selector),
    querySelector: (selector) => select(selector)[0],
    createElement: (tag) => new Element(tag),
    createDocumentFragment: () => new Element('fragment'),
  };
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/)[1];
  const pageCore = Object.assign({}, core, approvalFixtures ? { createApprovals: () => approvalFixtures.map((item) => ({ ...item })) } : {}, coreOverrides);
  vm.runInNewContext(script, { document, window: { UserDeleteCore: pageCore }, setTimeout: () => 0 }, { filename: 'index.html' });
  const get = document.getElementById;
  const change = (element, value) => { element.value = value; element.dispatch('change'); };
  const input = (value) => { get('delete-account-input').value = value; get('delete-account-input').dispatch('input'); };
  const openUser = (id) => { const button = select('[data-view]').find((item) => item.dataset.view === id); assert(button, 'user should be listed: ' + id); button.click(); get('btn-delete-user').click(); };
  const assign = () => select('[data-assign-resource], [data-assign-approval]').forEach((element) => change(element, 'u2'));
  return { get, change, input, openUser, assign, select };
}

{
  const page = loadPage(undefined, { createApprovalHistory: undefined });
  assert(page.select('[data-view]').length >= 10, 'cached core without the optional history factory must still render the user list');
  page.openUser('u1');
  assert.equal(page.select('[data-assign-approval]').length, 2);
  page.assign();
  page.input('zhangwei');
  page.get('btn-delete-account-confirm').click();
  assert(!page.get('delete-wizard').classList.contains('show'), 'successful deletion must close the dialog with the previous core interface');
}

{
  const page = loadPage();
  page.openUser('u1');
  assert(page.get('delete-wizard').classList.contains('show'));
  assert.equal(page.select('[data-assign-resource]').length, 2, 'demo should have two owned resources');
  assert.equal(page.select('[data-assign-approval]').length, 2, 'demo should have two approvals');
  assert(!page.get('delete-approval-list').innerHTML.includes('图纸归档审批'), 'historical nodes must not appear in the handoff list');
  page.input('zhangwei');
  assert(page.get('btn-delete-account-confirm').disabled, 'exact account alone cannot enable deletion');
  page.assign();
  assert.equal(page.get('btn-delete-account-confirm').disabled, false);
  page.input('zhangwei ');
  assert(page.get('btn-delete-account-confirm').disabled);
  page.input('zhangwei');
  assert(page.get('delete-account-input').dispatch('keydown', { key: 'Enter' }).prevented, 'Enter must be prevented');
  assert.equal(page.get('delete-result').classList.contains('show'), false);
  page.get('btn-delete-account-confirm').click();
  assert(!page.get('delete-wizard').classList.contains('show'), 'successful deletion must close the dialog');
  assert.equal(page.get('kb-owner-name').textContent, '李娜', 'success must update displayed owner');
  assert.equal(page.select('[data-view]').some((button) => button.dataset.view === 'u1'), false, 'deleted user must leave list');
  assert.match(page.get('delete-result-approval-fallback').textContent, /回退待审核/);
  assert.match(page.get('delete-result-approval-fallback').textContent, /自动驳回/);
  assert.match(page.get('delete-result-approval-fallback').textContent, /未知用户/);
  page.get('btn-delete-account-confirm').click();
  assert(!page.get('delete-wizard').classList.contains('show'), 'repeated confirmation must keep the dialog closed');
  page.openUser('u2');
  assert.equal(page.select('[data-assign-resource]').length, 2, 'recipient must now own transferred resources');
  assert.equal(page.select('[data-assign-approval]').length, 2, 'recipient must now receive transferred approvals');
  assert.equal(page.get('delete-account-input').value, '', 'new deletion must reset account');
  assert.equal(page.get('delete-account-input').disabled, false);
}
{
  const page = loadPage([
    { id: 'current', name: '当前审核', currentNode: true, ended: false, referencedUserIds: ['u1'], assigneeId: 'u2', node: '待审核' },
    { id: 'history', name: '历史审核', currentNode: false, ended: false, referencedUserIds: ['u1'], assigneeId: 'u2', fallbackAction: '回退待审核' },
    { id: 'ended', name: '已结束审核', currentNode: true, ended: true, referencedUserIds: ['u1'], assigneeId: 'u1' },
    { id: 'unrelated', name: '他人审核', currentNode: true, ended: false, referencedUserIds: ['u2'], assigneeId: 'u1' },
  ]);
  page.openUser('u1');
  assert.deepEqual(page.select('[data-assign-approval]').map((item) => item.dataset.assignApproval), ['current'], 'only the current unfinished node referencing the user can be assigned');
  page.select('[data-assign-resource]').forEach((element) => page.change(element, 'u2'));
  page.input('zhangwei');
  assert(page.get('btn-delete-account-confirm').disabled, 'current approval must have a recipient');
  page.change(page.select('[data-assign-approval]')[0], 'u2');
  page.get('btn-delete-account-confirm').click();
  assert(!page.get('delete-wizard').classList.contains('show'), 'resources plus current approval should complete deletion and close the dialog');
  assert.equal(page.get('delete-result-approvals').textContent, '1 条当前节点已转让');
  page.openUser('u2');
  assert.deepEqual(page.select('[data-assign-approval]').map((item) => item.dataset.assignApproval), ['current', 'unrelated'], 'each current unfinished node referencing the selected user must be available regardless of assignee');
}
{
  const page = loadPage();
  page.get('btn-transfer-kb-owner').click();
  assert(page.get('modal-kb-owner-transfer').classList.contains('show'));
  assert(page.get('kb-owner-search').tag === 'input', 'owner transfer must use a user search field');
  assert(!page.get('kb-owner-candidates').innerHTML.includes('data-owner-recipient="u1"'), 'owner must be excluded');
  assert(!page.get('kb-owner-candidates').innerHTML.includes('data-owner-recipient="u3"'), 'normal users must be excluded');
  page.get('kb-owner-search').value = 'lina';
  page.get('kb-owner-search').dispatch('input');
  page.select('[data-owner-recipient="u2"]')[0].click();
  page.get('btn-confirm-kb-owner').click();
  assert.equal(page.get('kb-owner-name').textContent, '李娜');
  assert.equal(page.get('modal-kb-owner-transfer').classList.contains('show'), false);
  page.openUser('u1');
  assert.equal(page.select('[data-assign-resource]').length, 1, 'independently transferred KB must leave old owner deletion');
}
console.log('Node page event regression tests passed');
