# 测试后端联调

Vitest 验证传输层 Cookie/CSRF、变更字段 PATCH、分页遍历、备份请求、平台字段和现有模板/导入解析。
旧 Dexie 事务测试已移除，因为事务与权限现在由 Java/PostgreSQL 集成测试负责。删除的是代码，未操作用户浏览器数据库。

Playwright 保留原桌面功能测试，登录和数据重置改用真实 API；新增双浏览器共享、跨页导入/导出、网络失败和会话失效测试。
测试前每次恢复空的虚构备份，因此严格要求一次性测试库，禁止对正式后端运行。

本机准备步骤：

1. 独立 PostgreSQL 库名以 `_test` 结尾，例如 `appeal_backend_test`，监听 `127.0.0.1:55439`。
2. 在本仓库 `backend/` 目录设置 `TEST_DB_URL=jdbc:postgresql://127.0.0.1:55439/appeal_backend_test`、`TEST_DB_USERNAME`、`TEST_DB_PASSWORD` 后运行 `mvnw.cmd test`。它会初始化虚构 `test-admin` 和 `test-reader`，密码 `test-only-password`。
3. 将后端 `DB_URL/DB_USERNAME/DB_PASSWORD` 指向该测试库，初始化用户名/哈希与测试库中的两个用户一致，`SECURE_COOKIE=false`，启动后端到 `127.0.0.1:18080`。
4. Windows Java 如遇 UnixDomainSockets 路径问题，测试加 `-DargLine=-Djdk.net.unixdomain.tmpdir=D:/mark/backend/target`；运行加相应 JVM 参数。
5. 在本仓库 `frontend/` 目录运行：

```powershell
$env:E2E_ISOLATED='1'
$env:BACKEND_URL='http://127.0.0.1:18080'
npm run test:e2e
```

Playwright 自动启动前端 4173。不要复用一个指向正式后端的 4173 开发服务器。测试夹具还要求能用虚构测试账号登录，以降低误接正式库的风险。
测试使用独立 Cookie 会话和虚构数据；用户导出的 JSON 不参与测试。

## 2026-10-12 接入验证记录

本轮范围为计划 U7 前端 API 切换，以及必要的后端查询补充和 U8 部署配置。不是正式部署，也不代表 U8 的容器与数据库运维恢复演练已经完成。

- 前端 lint、typecheck、format:check、生产 build、敏感配置跟踪检查通过。
- Vitest：19 个文件、121 项通过。
- Playwright：43 项通过，连接独立 Spring Boot 18080 和 PostgreSQL 55439；没有使用真实账号或用户备份。
- Java：24 项通过（20 项 PostgreSQL 集成测试、4 项 IP 规则测试）。
- 增加故障回归：迟到的 IP 更新响应不能覆盖筛选后的其他行；HTML 不可伪装为 JSON/下载结果；恢复响应丢失后通过回执确认，不能自动重复恢复；移除 IP 前确认其标记和账密一起删除。
- 双浏览器共享、只读后端拒绝写入、旧 IndexedDB 保留、字段级 PATCH、跨页导入与导出、证据图片、模板和桌面布局均有回归覆盖。

Code review: skipped (ce-code-review unavailable)

项目要求子代理工作在主线程顺序执行，独立审查及合并流程无法产出完整回执，本次专用审查以不可用结束。已补充主线程人工差异核查，覆盖数据源切换、平台路径、会话/CSRF、分页、竞态、备份恢复与配置；不将此记录称为独立审查。简化检查移除了弃用的本地保存路径与冗余包装。

当时尚未验证：Docker 守护进程未启动，未执行本机容器全栈烟测；当时的跨仓库 GitHub integration 尚需配置后端仓库及读取权限；正式数据库、真实备份导入和上线均未操作。当时用户原 8080/5176 服务未停止，独立测试服务在验证后关闭。

## 单仓库迁移

当前 GitHub `integration.yml` 使用本仓库的 `backend/` 和 `frontend/`，已取消跨仓库检出。原验证记录描述的是 2026-10-12 的运行结果，不能当作迁移后的新验证；最新范围见 [合并说明](MONOREPO.md)。
