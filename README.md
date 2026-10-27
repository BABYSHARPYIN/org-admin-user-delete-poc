# 用户删除流程 POC

独立的组织与用户管理原型，重点演示用户删除前的影响检查、资源所有权转让、未结束审批处理、账号二次确认、失败重试和删除后的资源查询兜底。

本项目独立于 `org-admin-poc`，不会修改原仓库或原有 GitHub Pages 页面。

## 在线页面

发布后访问：<https://babysharpyin.github.io/org-admin-user-delete-poc/>

## 本地运行

直接打开 `index.html`，或启动静态服务器：

```bash
python3 -m http.server 4180 --directory "/Users/rio/Desktop/零散文件/org-admin-user-delete-poc"
```

访问 <http://localhost:4180/>。

## POC 流程

删除入口位于用户列表和用户详情页，向导包含三步：

1. **影响检查**：展示用户作为所有者的资源，以及用户参与的未结束审批。
2. **资源与审批处理**：资源支持逐项配置，也支持勾选多项后批量转让给同一位接收人；单项修改可以覆盖批量配置。审批不转交，由系统统一驳回，原因固定为“该用户已注销”。
3. **最终确认**：展示资源和审批摘要，要求输入待删除用户账号后才能执行。

接收人必须同时满足：账号状态正常、拥有“管理员”或“子管理员”角色、不是待删除用户。编辑权和使用权不进入转让列表。

审批示例覆盖待办节点、审批中节点、发起人、抄送人、会签人、加签人、代理人和最终发布人等用户引用。删除后资源仍可查询，缺失用户信息使用“已删除用户”（`user_id = -1`）展示，占位身份不参与实时权限判断。

POC 还提供资源转让失败、审批处理失败、用户注销失败、成功重试和处理记录查看等演示分支。

## 文件说明

- `index.html`：离线页面、样式和交互逻辑。
- `user-delete-core.js`：可在浏览器和 Node.js 中复用的删除流程核心校验。
- `test-user-delete-flow.js`：删除流程核心及页面结构测试。
- `test-org-permission-poc.js`：组织与知识库权限示例的冒烟测试。

## 运行检查

```bash
node --check user-delete-core.js
node test-user-delete-flow.js
node test-org-permission-poc.js
python3 - <<'PY'
import re
html = open('index.html', encoding='utf-8').read()
script = re.findall(r'<script>(.*?)</script>', html, re.S)[-1]
open('/tmp/org-admin-user-delete-poc-inline.js', 'w', encoding='utf-8').write(script)
PY
node --check /tmp/org-admin-user-delete-poc-inline.js
git diff --check
```

本项目只演示页面状态和业务校验，不接入真实用户、资源、审批或删除接口。真实接入时需要由服务端保证任务幂等、事务或补偿处理，以及删除后的权限边界。
