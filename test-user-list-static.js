const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const userTable = html.match(/<table class="data user-table">[\s\S]*?<tbody id="user-tbody">/);
check(userTable, 'user list table markup should be present');
if (userTable) {
  check(userTable[0].includes('<th>组织信息</th>'), 'user table should have an 组织信息 column');
  check(
    /<th>姓名<\/th>[\s\S]*<th>账号<\/th>[\s\S]*<th>邮箱<\/th>[\s\S]*<th>手机号<\/th>[\s\S]*<th>组织信息<\/th>[\s\S]*<th>账号类型<\/th>[\s\S]*<th class="action-col">操作<\/th>/.test(userTable[0]),
    'user table columns should be 姓名 / 账号 / 邮箱 / 手机号 / 组织信息 / 账号类型 / 操作'
  );
}

check(!html.includes('功能角色'), 'the POC should not show the invented term 功能角色');
check(!html.includes('用户详情'), 'an existing user drawer should be titled 用户信息, not 用户详情');
check(html.includes('placeholder="请输入邮箱地址"'), '邮箱 placeholder should match production');
check(html.includes('placeholder="请输入手机号"'), '手机号 placeholder should match production');
check(html.includes('>账号类型<') || html.includes('>账号类型<span'), 'user drawer should label the account type 账号类型');
check(/<select[^>]*id="uf-account-type"/.test(html), '账号类型 should be a single-select control');
check(/isEdit \? "用户信息" : "新增用户"/.test(html), 'edit drawer title should be 用户信息 and create should stay 新增用户');
check(!html.includes('（预置）'), 'account-type options should use role names without suffix');
check(html.includes('const KB_ROLE_LABEL = { owner: "所有者", editor: "编辑者", viewer: "使用者" }'), 'knowledge-base labels should stay intact');
check(!html.includes('当前组织'), 'user list should not show the 当前组织 breadcrumb');
check(!html.includes('清除选择'), 'user list should not show 清除选择');
check(!html.includes('全部用户'), 'org tree should not include a synthetic 全部用户 node');
check(!html.includes('tree-badge'), 'org tree should not render member counts');
check(!html.includes('id="filter-hint"'), 'org filter chip markup should be removed');
check(!html.includes('id="clear-filter"'), 'clear-selection control should be removed');

const searchFn = html.match(/function currentUserResults\(\) \{[\s\S]*?return list;\s*\}/);
check(!!(searchFn && searchFn[0].includes('customerInfo')), 'user search should match serialized customerInfo');
check(html.includes('>用户管理</span>') || /用户管理\s*<\/button>/.test(html), 'sidebar should show 用户管理');
check(html.includes('>用户列表</h1>'), 'page heading should be 用户列表');

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>\s*<\/body>/g)];
if (!scripts.length) failures.push('page script should be extractable');
else {
  try {
    new vm.Script(scripts[scripts.length - 1][1], { filename: 'index.html' });
  } catch (error) {
    failures.push('page script should parse: ' + error.message);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => '- ' + failure).join('\n'));
  process.exit(1);
}
console.log('static user list regression test passed');
