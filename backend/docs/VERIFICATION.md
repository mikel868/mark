# 本地验证记录

## 当前状态与记录适用范围

业务运行默认连接远端 `postgres.default.svc.local.k8s.ipipd.top:5678/mark`。下文的 `127.0.0.1:55439/appeal_backend_test` 只用于隔离验证，不是业务库。登录身份从业务数据库的 `app_users` 读取；本机已保留连接及初始化私密配置，真实凭据不在 Git 中。

后端已有独立远端 Git 仓库并完成初次推送，前端 API 接入和隔离库联调已完成。Docker 全栈、远端数据库备份恢复和 Gitea CI 执行情况不能据此视为已验证。本文保留带日期的历史记录；其中“未接入前端”“尚无 HEAD”“未配置账号”等描述只适用于 2026-10-10 的当时状态。

## 2026-10-12 推送前复验

- 在隔离 PostgreSQL `127.0.0.1:55439/appeal_backend_test` 上执行 Maven `verify`，24 项测试通过（20 项集成测试、4 项 IP 规则测试），Spotless 和打包通过。
- 前端 API 接入已完成；同日的前端回归为 121 项单元测试、43 项浏览器测试通过。联调使用虚构账号和隔离数据库，不涉及真实备份恢复。
- 公共 `application.yml` 的数据库密码改为必须从 `DB_PASSWORD` 读取；本机值保留在已忽略的 `config/application-local.yml`，不上传 Git、不进入容器构建。
- 本轮仅按功能提交和推送后端仓库，前端工作区不提交；Docker 全栈与正式数据库运维恢复演练仍未完成。

以下为首次创建时的历史验证记录，未接入前端等描述仅代表当时状态。

## 2026-10-10 首次创建

日期：2026-10-10。范围仅为新建的 `D:\mark-backend`，不是整份前后端上线计划的验收。

### 当时已执行

- Java 21.0.9、Maven Wrapper 3.9.11；Spring Boot 4.1.1、MyBatis-Plus 3.5.17 和 Jackson 3 实际编译并启动。
- 使用任务专用 PostgreSQL 18.1：`127.0.0.1:55439/appeal_backend_test`。没有使用原有 5432 数据库，没有恢复真实业务备份。
- 完整 Maven `verify` 成功：23 项测试，0 失败、0 错误、0 跳过。其中 4 项 IP 领域测试、19 项真实数据库和 HTTP 集成测试。
- Spotless 格式检查通过，生成 `target/appeal-backend-0.1.0.jar`。
- `docker compose --env-file .env.example config --quiet` 通过配置语法检查；这不代表容器已经运行。
- `.env`、`backups/`、`target/` 被 Git 忽略。没有创建真实账号凭据配置，没有提交或推送代码。

本次命令：

```powershell
$env:JAVA_HOME='D:\Java\jdk21'
$env:TEST_DB_URL='jdbc:postgresql://127.0.0.1:55439/appeal_backend_test'
.\mvnw.cmd -q spotless:apply verify "-DargLine=-Djdk.net.unixdomain.tmpdir=D:/mark-backend/target" "-Dlogging.level.root=ERROR" "-Dspring.main.banner-mode=off"
```

本机 JDK 默认 Unix-domain 临时目录导致 Tomcat 的回环连接失败；改用项目 `target` 路径后真实 HTTP 测试通过。该参数是本机环境绕行，不影响业务协议。

### 当时已覆盖行为

- 四次 Flyway 迁移、恰好两个角色用户、联合索引存在。
- 真实 Cookie 登录、Session ID 轮换、HttpOnly/SameSite 属性、8 小时配置、数据库中过期但未清理的 Session 无法认证、登录后旧 CSRF 失效、只退出当前会话。
- 只读角色的全部业务写路由和恢复接口拒绝访问；可导出备份并通过另一会话读取图片原字节。匿名和错误平台图片请求失败。
- 账号重复和缺项导入、账号物理删除保留记录；字段级 PATCH 不覆盖其他字段，显式 null 可解除关联。
- 批量状态缺目标完整回滚、相同状态算成功、后写覆盖、IP 勾选保留；跨平台和错误步骤关联被拒绝。
- 模块/步骤引用保护、归档和步骤排序交换；快速网段分组与跨记录账密覆盖。
- 并发图片上传最多十张、多文件中途读取 IOException 完整回滚、删除记录级联图片。
- v1 非 UUID ID 和空账号字段、旧 archived 元数据往返；v2 图片字节往返、无 sha256 字段的旧备份可恢复；恢复回执防重复。
- 损坏 JSON 和恢复中途 SQL 失败不清空旧数据；恢复维护锁阻止新写入。
- 分页与 OpenAPI、缺失布尔参数报错、未知路由/已删除单条返回 404、普通 JSON 超过 2 MiB 拒绝且不写入。

### 当时的检查及覆盖边界

使用 ce-work 推进实现；ce-simplify-code 的复用、质量和效率检查按用户要求在主线程顺序执行，没有启动子代理。保留业务 Service 分包，统一格式，并将申诉列表的逐记录 IP 查询改为一次批量查询；修改后全套测试通过。

Code review: skipped (ce-code-review unavailable)

已尝试 ce-code-review，但新仓库尚无 HEAD、基准提交或远程引用，源文件全部为新建未跟踪文件；该技能的差异范围规则要求在无法解析基准时停止。因此没有完整专用审查回执、独立审查或跨模型审查结论。另行逐文件检查了路由权限、参数白名单、事务和外键、备份恢复边界、配置及测试，并修复布尔参数误默认、单条删除错误码、账密空项、上传受检异常回滚等问题。

### 当时尚未验证或执行

- Docker 引擎未运行：未构建镜像、未运行 Compose / Testcontainers PostgreSQL 17.6，未验证容器重建保留数据。18.1 本机通过不能代替部署基线 17 的验收。
- 尚无前端 API 接入、双浏览器 UI 联调、Nginx/TLS 全栈测试；现有 Vue、IndexedDB 和登录配置未改动。
- 未读取或导出真实浏览器数据，未恢复真实 JSON。切换前需保留当前含图片的 v2 备份，并验证真实文件兼容性。
- 未进行接近 100 MiB 备份的内存/耗时压测、全部图片格式的兼容性矩阵、数据库中断及响应丢失的完整故障演练。
- 未演练 pg_dump 到另一空库的恢复，未配置异机备份、域名或正式账号；启动时需按 README 配置连接及两组初始化哈希。
- API 的错误字段定位、OpenAPI 中动态 Map 的细化模型和生产日志关联仍可在前端联调时完善；当前不宣称完整生产验收通过。

2026-10-10 的测试服务在当次验证后停止，测试数据目录保留于被忽略的 `target/test-pg`；“后端未作为常驻服务启动”仅描述当次交付，不表示当前机器没有运行后端。
