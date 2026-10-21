# API 使用约定

前缀 `/api/v1`。平台固定为 `ins/google/tiktok/ping0`。业务读取要求登录，业务写入要求 ADMIN 和有效 CSRF；恢复回执的读取也仅限 ADMIN。只读允许导出完整业务数据。认证接口例外：获取 CSRF 和登录允许匿名访问，已登录的管理员与只读用户均可退出当前会话。

登录用户名、密码哈希、角色和启用状态来自后端连接数据库中的 `app_users`；当前默认连接远端 `mark`，不是本地账号文件。`INITIAL_*` 仅用于初始化和启动校验，不作为每次登录的密码来源。

## 登录顺序

1. GET `/auth/csrf`，保存响应 token/headerName 到前端内存，并接受 SESSION Cookie。
2. POST `/auth/login`，Content-Type 为 `application/x-www-form-urlencoded`，传 username/password，并带上 CSRF 请求头和 Cookie。
3. 登录成功后重新 GET `/auth/csrf`（旧 token 已失效），GET `/auth/me` 可恢复页面身份。
4. 后续 JSON、上传、退出均由浏览器自动携带 Cookie；写请求另带 CSRF 请求头。
5. POST `/auth/logout` 返回 204，只注销当前会话。登录凭证不放 localStorage。

Fetch 同源默认携带 Cookie，可明确使用 `credentials:'same-origin'`。不要自动重试写请求：超时可能发生在提交之后。

普通 JSON 请求体最多 2 MiB，应用会实际计数，包括分块传输；批量数据超过上限需分批提交。multipart 完整备份文件最多 100 MiB；证据单图最多 5 MiB、每条记录最多 10 张。

## 业务接口

以下 `{base}` 为 `/platforms/{p}`，`{records}` 为 `{base}/appeal-records`。

| 方法与路径 | 请求内容 |
| --- | --- |
| GET `{base}/accounts` | page=1、pageSize=10；可选 country/search/used |
| POST `{base}/accounts` | 当前平台账号字段；手动新增检查必填 |
| GET/PATCH/DELETE `{base}/accounts/{id}` | PATCH 只传变更字段，禁止改 ID/平台 |
| PATCH `{base}/accounts/{id}/used` | `{"used":true}` |
| POST `{base}/accounts/import` | `{"rows":[{"account":"demo"}]}`；缺项 warning，不阻止新增 |
| GET `{base}/accounts/options` | page/pageSize/search/country；轻量账号选项，包含关联记录数 appealCount |
| GET/POST `{base}/modules`、`{base}/steps` | 模块或步骤；列表分页，steps 可选 moduleId |
| GET/PATCH/DELETE `{base}/modules/{id}`、`{base}/steps/{id}` | 有引用时物理删除返回 409，可选择归档 |
| PATCH `{base}/modules/{id}/archive`、`{base}/steps/{id}/archive` | `{"archived":true}` |
| POST `{base}/steps/swap-order` | `{"ids":["step-a","step-b"]}`，必须同模块 |
| GET `{records}` | page/pageSize、country/status/statusGroup/accountId/moduleId/stepId/search 筛选；search 匹配账号、国家、IP 和申诉平台 |
| POST `{records}` | country/status/ip/appealedAt/appealPlatform 必填；时间含时区 |
| GET/PATCH/DELETE `{records}/{id}` | 单条操作；PATCH 不接受 completedIps 全量覆盖 |
| PATCH `{records}/batch-status` | `{"ids":["a","b"],"status":"已提交"}`；缺少目标全部回滚 |
| POST `{records}/batch-delete` | `{"ids":["a","b"]}`；原子删除 |
| POST `{records}/quick-import` | `{"country":"美国","text":"198.65.111\n198.65.112","groupSize":1}` |
| PATCH `{records}/{id}/ips/{ipId}/completed` | `{"completed":true}`；ipId 来自返回的 ipItems |
| PATCH `{records}/{id}/verification-ips` | `{"edits":[{"ipId":"...","content":"完整或部分账密"}]}`；空字符串清空 |
| POST `{records}/verification-ips/quick-import` | `{"scope":"platform","text":"198.65.111.37:1234:user:pass"}`；单记录用 scope=record 和 recordId |
| GET `{records}/completed-ips/export` | 全平台绿色 IP，BOM + 国家/制表符/IP，CRLF，无标题行 |
| GET/POST `{records}/{id}/images` | 元信息 / multipart 的 files 字段，可一次多图 |
| GET/DELETE `{records}/{id}/images/{imageId}` | 图片原字节 / 删除 |
| GET `{base}/summary`、`{base}/filter-options` | 全平台统计与筛选，不受当前分页限制；统计包含 accounts/modules/steps/appealRecords/images 及状态分组 |
| GET `/backups/export` | 完整 v2 JSON，最多 100 MiB |
| POST `/backups/restore` | multipart file、operationId、confirmation=REPLACE_ALL_PLATFORMS |
| GET `/backups/restores/{operationId}` | ADMIN 查看恢复成功回执 |

账号字段为 country/account/password/emailAccount/emailPassword/twoFactor/token/decodeLink/note/used。模块：name/description/enabled/sortOrder/note；步骤：moduleId/name/instructions/sortOrder/note。

申诉记录另支持 accountId/moduleId/stepId/note/template1/template2。解除关联传 null 或空字符串；未传不更新。IP 列表每行一个 IPv4/IPv6/CIDR，短三段网段仅在快速导入中自动转 `.0/24`。验证账密独立保存，不将旧页面整条对象回写。

列表返回 `{items,total,page,pageSize}`。普通成功直接返回 DTO；204 无内容。错误为 `{code,message,requestId,details}`。401 需登录，403 区分 FORBIDDEN/CSRF_INVALID，409 表示目标或关联冲突，413 超限，503 维护中。恢复回执 404 只表示尚无成功证明，不表示正在执行的恢复已失败；重试使用相同 operationId 和相同文件。

模板文本与稳定姓名继续由 Vue 生成，不需要后端模板执行接口，也没有独立 migration 接口。前端通过同源 `/api` 代理接入；原浏览器 IndexedDB 不再作为业务数据源，也不会被自动清除或导入。
