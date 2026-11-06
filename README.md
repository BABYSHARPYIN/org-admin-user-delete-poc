# 用户删除流程 POC

在 `org-admin-poc` 的用户列表与用户信息抽屉基础上，演示用户删除处理页：资源与审核转让接收人配置、输入账号确认。

## 在线页面

发布后访问：<https://babysharpyin.github.io/org-admin-user-delete-poc/>

## 本地运行

直接打开 `index.html`，或启动静态服务器：

```bash
python3 -m http.server 4180 --directory "/Users/rio/Desktop/零散文件/org-admin-user-delete-poc"
```

访问 <http://localhost:4180/>。

页面结构、导航、列表和抽屉基于 `org-admin-poc` 的 `gh-pages`；删除处理页和对应样式在此基础上新增。

## 删除流程

用户列表「查看」打开用户信息抽屉 → 点击「删除」进入单页处理：

1. **影响检查**：展示用户作为所有者的资源，以及引用待删用户的当前节点审核。
2. **资源与审核转让接收人**：资源和当前节点审核逐项指定接收人；历史节点不进入转让列表，由审核节点兜底。
3. **输入账号确认**：输入完整账号后才能点击「确认删除」，按 Enter 不会提交。

接收人必须状态正常、拥有管理员或子管理员角色，且不能是待删除用户。资源转移只处理所有者资源；编辑权等共享关系不进入转让列表。审核转让只处理当前节点、未结束且引用待删用户的审核单。

处理页可切换成功或失败演示路径。失败时用户保持正常状态，可重试。删除成功后，缺失用户的资源统一显示为「已删除用户」，`user_id = -1`，占位身份不参与实时权限判断。

## 文件说明

- `index.html`：离线页面、样式和交互逻辑。
- `user-delete-core.js`：可在浏览器和 Node.js 中复用的删除流程核心校验。
- `test-user-delete-flow.js`：删除流程核心与页面结构测试。
- `test-user-delete-page.js`：在 Node DOM 边界中回归删除处理页和知识库所有者转移事件。
- `test-user-list-static.js`：不依赖浏览器的用户列表与抽屉静态回归测试。
- `test-user-list.js`：从 `org-admin-poc` 带入的用户列表测试；其浏览器验收部分不用于本次验收。
- `test-org-permission-poc.js`：从 `org-admin-poc` 带入的知识库权限测试；该源文件在 `gh-pages` 上已与页面实现不一致。

## 运行检查

```bash
node --check user-delete-core.js
node --check test-user-delete-flow.js
node --check test-user-list-static.js
node test-user-delete-flow.js
node test-user-delete-page.js
node test-org-permission-poc.js
node test-user-list-static.js
node --check test-user-delete-page.js
python3 - <<'PY'
import re
from pathlib import Path
html = Path('index.html').read_text()
script = re.findall(r'<script>\s*(.*?)</script>\s*</body>', html, re.S)[-1]
Path('/tmp/org-admin-user-delete-poc-inline.js').write_text(script)
PY
node --check /tmp/org-admin-user-delete-poc-inline.js
git diff --check
```

本项目只演示页面状态和业务校验，不接入真实用户、资源、审批或删除接口。真实接入时需要由服务端保证任务幂等、事务或补偿处理，以及删除后的权限边界。
