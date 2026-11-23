// Exercise the actual page and DOM events without a browser rendering engine.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

for (const role of ['editor', 'viewer', 'none']) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (error) => errors.push(error.message));
  const dom = new JSDOM(html, {
    url: 'https://example.test/', runScripts: 'dangerously', virtualConsole: vc,
    beforeParse(window) { window.UserDeleteCore = require('./user-delete-core.js'); },
  });
  try {
    const d = dom.window.document;
    const get = (id) => d.getElementById(id);
    const input = (id, value) => {
      get(id).value = value;
      get(id).dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    const select = get('kb-former-owner-role');
    const transfer = (account, selectedRole) => {
      get('btn-transfer-kb-owner').click();
      assert.equal(select.value, 'none');
      assert.equal(get('btn-confirm-kb-owner').disabled, true);
      if (selectedRole !== undefined) {
        select.value = selectedRole;
        select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      }
      input('kb-owner-search', account);
      const candidate = d.querySelector('[data-owner-recipient]');
      assert(candidate, 'eligible recipient is searchable');
      candidate.click();
      get('btn-confirm-kb-owner').click();
      assert(!get('modal-kb-owner-transfer').classList.contains('show'));
    };
    const ownerRows = () => [...get('kb-member-tbody').rows].filter((row) => row.querySelector('.owner-badge'));
    const memberRole = (account) => d.querySelector('select[data-kind="user"][data-id="' + account + '"]');
    d.querySelector('[data-page="kb-perm"]').click();
    assert(get('page-kb-perm').classList.contains('active'));
    get('btn-transfer-kb-owner').click();
    assert.deepEqual([...select.options].map((o) => [o.value, o.textContent]), [['editor', '编辑者'], ['viewer', '使用者'], ['none', '无']]);
    assert.equal(select.labels[0].textContent, '原所有者角色');
    select.value = 'editor';
    get('modal-kb-owner-transfer').querySelector('[data-close]').click();
    assert.equal(get('kb-owner-name').textContent, '张伟');

    // Upgrade an already authorized recipient; do not duplicate their member row.
    get('btn-add-kb-auth').click();
    input('kb-auth-search', 'lina');
    d.querySelector('[data-auth-user="lina"]').click();
    get('kb-auth-role').value = 'viewer';
    get('btn-confirm-kb-auth').click();
    assert.equal(memberRole('lina').value, 'viewer');
    transfer('lina', role === 'none' ? undefined : role);
    assert.equal(get('kb-owner-name').textContent, '李娜');
    assert.equal(ownerRows().length, 1);
    assert(ownerRows()[0].textContent.includes('lina'));
    assert.equal([...get('kb-member-tbody').rows].filter((row) => row.textContent.includes('lina')).length, 1);
    if (role === 'none') assert(![...get('kb-member-tbody').rows].some((row) => row.textContent.includes('zhangwei')));
    else assert.equal(memberRole('zhangwei').value, role);
    assert.equal(memberRole('zhaomin').value, 'editor');
    assert.equal(d.querySelector('select[data-kind="org"][data-id="d2"]').value, 'viewer');

    transfer('zhangwei', 'viewer');
    assert.equal(get('kb-owner-name').textContent, '张伟');
    assert.equal(ownerRows().length, 1);
    assert.equal(memberRole('lina').value, 'viewer', 'repeat transfer applies to the current owner');
    assert.deepEqual(errors, []);
    console.log('ok - real DOM transfer, cancel, existing recipient and repeat transfer: ' + role);
  } finally { dom.window.close(); }
}
