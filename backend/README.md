# 平台申诉管理后端

> GitHub 导入说明（2026-10-21）：当前仓库为 `mikel868/mark`，新工作副本为 `D:\mark-github`。本次没有复制真实数据库密码、初始化哈希或本地配置。下文关于原数据库、`D:\mark` 和 Gitea 的描述记录迁移前环境；新环境必须自行提供 `DB_URL`、`DB_USERNAME`、`DB_PASSWORD` 和 `INITIAL_*`，不要直接使用旧服务器地址。云服务器的自动部署尚未配置。

本仓库的 Java 后端模块，本机目录为 `D:\mark\backend`；前端位于 `D:\mark\frontend`，统一使用 `IP-Correction-Document` 仓库。技术栈为 Java 21、Spring Boot 4.1.1、MyBatis-Plus 3.5.17、PostgreSQL、Flyway、Spring Security / Spring Session JDBC。

## 当前运行方式

“本机启动”指 Java 进程在本机运行，**不是在本机创建业务数据库或本地登录账号**。

| 项目                       | 当前配置与数据来源                                                       |
| -------------------------- | ------------------------------------------------------------------------ |
| 前端开发地址               | `http://localhost:5176`，通过 `/api` 代理访问后端                        |
| Java 后端默认端口          | `8080`                                                                   |
| PostgreSQL 默认主机        | `postgres.default.svc.local.k8s.ipipd.top`                               |
| PostgreSQL 默认端口 / 库名 | `5678` / `mark`                                                          |
| 数据库连接用户名           | 默认 `postgres`，不是网页登录账号                                        |
| 网页登录身份               | 远端 `app_users` 表中的用户名、密码哈希、角色和启用状态                  |
| 业务数据 / 会话            | 同一连接数据库中的业务表及 `spring_session`、`spring_session_attributes` |

以上数据库地址来自 `src/main/resources/application.yml`。`DB_URL` 可以覆盖整个 JDBC 地址；未设置它时，`DB_HOST`、`DB_PORT`、`DB_NAME` 分别覆盖默认值，`DB_USERNAME` 覆盖连接用户名。不要把后文的测试库或 Compose 示例地址当成当前业务库。

本项目约定的网页登录用户名为管理员 `admin` 和只读用户 `user`，实际登录以所连接数据库的 `app_users` 记录为准。前端不直接连接 PostgreSQL，也不使用本地文件校验登录密码。

## 当前范围

- 四个平台账号、模块、步骤和申诉记录接口。
- 管理员 / 只读账号、Cookie Session、8 小时空闲超时、CSRF、当前会话退出。
- 账号缺项导入、重复新增、物理删除并解除申诉关联。
- 批量状态原子更新、IP 完成标记、网段分组导入、验证账密按网段覆盖。
- PostgreSQL `bytea` 图片存储、完整 v1/v2 JSON 恢复、v2 导出和恢复回执。
- Docker Compose、Nginx 接入示例、数据库备份脚本。

前端已改为通过这些 API 读写共享数据，并完成隔离测试库上的联调；用户原浏览器数据没有自动迁移。首次使用时由管理员在前端“备份恢复”中选择已导出的 v1/v2 JSON，核对后确认覆盖服务器业务数据。代码与联调通过不等于已经生产上线。

## 目录

```text
src/main/java/com/mark/appeal/
  accounts/   账号
  auth/       登录、Cookie、权限、维护命令
  backup/     JSON 校验、快照导出、原子恢复
  common/     参数校验、分页与错误
  config/     MyBatis、Flyway 占位符验证
  domain/     实体
  evidence/   图片校验与读写
  flow/       模块与步骤
  maintenance/恢复互斥锁
  mapper/     MyBatis-Plus Mapper
  query/      汇总及筛选项
  records/    申诉记录与 IP 规则
src/main/resources/db/migration/  V1–V4
src/test/java/                    单元及真实数据库集成测试
docs/API.md                      接口使用说明
docs/DATABASE.md                 关联、联合索引与事务
```

## 启动当前后端：连接已有远端数据库

当前机器已经保留了被 Git 忽略的 `config/application-local.yml`。在 Java 21 可用、远端数据库可达、私密配置完整的前提下，从项目根目录启动即可，**不需要新建本地 PostgreSQL，也不需要重新创建登录账号**：

```powershell
cd D:\mark\backend
.\mvnw.cmd spring-boot:run
```

IDE 运行时也应使用 Java 21，并把工作目录设为 `D:\mark\backend`，因为 `spring.config.import` 按工作目录读取 `./config/application-local.yml`。该文件不会随 Git 克隆或 Docker 镜像分发。当前后端已并入主仓库，前端位于 `../frontend`；下文命令均在 `backend/` 目录执行。

默认端口为 `8080`，可通过 `SERVER_PORT` 覆盖；端口占用时启动失败，不会自动换端口。已有后端运行时请先在其启动终端或 IDE 中正常停止，再启动新实例。前端的 Vite `/api` 默认代理到 `127.0.0.1:8080`；正式部署使用 Nginx 同源转发。

本机 Windows JDK 21 曾出现 `Unable to establish loopback connection`。只有遇到该错误时，才使用本机已验证的临时目录参数：

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.jvmArguments=-Djdk.net.unixdomain.tmpdir=D:/mark/backend/target"
```

这不是数据库地址配置。其他机器应使用自己的存在且可写的目录，不要照抄 `D:/mark/backend/target`。

## 私密配置与首次初始化的区别

- `DB_PASSWORD` 是后端连接远端 PostgreSQL 使用的数据库密码，公共配置没有明文默认值。
- `INITIAL_*` 是 Flyway 首次建号使用的初始化参数，不是日常登录的账号数据源。
- 两个登录账号由 `V3__seed_initial_users.sql` 在**所连接的数据库**中一次性插入。Flyway 已成功执行 V3 后，不会因为重启或改配置而重新插入或修改已有账号密码。
- 当前 `SeedValidation` 在每次启动的迁移阶段仍校验这四个初始化参数；因此即使数据库已有账号，也必须保留有效配置。它们通过校验不代表会重置账号，修改已有密码应使用维护命令。

当前机器无需重复填写。另一台机器首次克隆仓库时，应通过安全渠道取得必要配置，并在其项目根目录创建 `config/application-local.yml`，或设置等价环境变量。以下仅为结构示例，所有尖括号内容均需替换，不可原样运行：

```yaml
DB_PASSWORD: '<远端数据库连接密码>'
INITIAL_ADMIN_USERNAME: admin
INITIAL_ADMIN_PASSWORD_HASH: '<带 {bcrypt} 前缀的有效初始化哈希>'
INITIAL_READONLY_USERNAME: user
INITIAL_READONLY_PASSWORD_HASH: '<带 {bcrypt} 前缀的另一个有效初始化哈希>'
app:
  secure-cookie: ${SECURE_COOKIE:false}
```

此示例只将 HTTP 本机开发的 Cookie 设置为非 Secure；正式 HTTPS 必须设置 `SECURE_COOKIE=true`。私密文件被 Git 忽略且排除在 Docker 构建外。普通 Maven/Java 不会自动读取 Compose 的 `.env`，但会按本项目配置导入上述 YAML；环境变量可覆盖同名配置。

只有首次初始化一套新数据库，或执行密码维护时，才需要生成新的哈希；**连接当前已有远端库不要求重新初始化账号**。不要修改已执行的迁移文件。

使用与登录相同的编码器生成密码哈希（终端提示后输入密码；无交互控制台时从标准输入读取）：

```powershell
.\mvnw.cmd -q compile org.codehaus.mojo:exec-maven-plugin:3.5.0:java "-Dexec.mainClass=com.mark.appeal.auth.UserMaintenanceCommand" "-Dexec.args=hash"
```

输出形如 `{bcrypt}$2a$...`。用户名只允许 1–100 位字母、数字及 `_.@-`，两个用户名必须不同；SQL 占位符会先校验再替换。真实密码、哈希、JSON 备份不提交 Git。

## 可选：独立 Docker 演示环境

后端模块目录的 `compose.yml` 会创建自己的 PostgreSQL 容器，Java 连接的是 `postgres:5432/appeal`，并使用命名卷 `appeal-data`。**这不是当前远端 `mark` 数据库，不会自动包含它的数据，也不是当前机器的必需启动步骤。**

1. 将 `.env.example` 复制为 `.env`，填入数据库密码、两个用户名和生成的哈希。哈希用单引号包裹，避免 Compose 展开 `$`。
2. 本地 HTTP 开发设置 `SECURE_COOKIE=false`；HTTPS 正式环境使用 `true`。
3. 运行 `docker compose up -d --build`。

这个示例的 API 只映射宿主机 `127.0.0.1:8080`，数据库不映射宿主机端口；可用 `BACKEND_PORT` 调整宿主映射，避免与当前 Java 进程冲突。不要执行 `docker compose down -v`，它会删除该示例的数据卷。

如果要用容器连接已有远端库，必须另行调整 Compose 中后端的 `DB_URL`、`DB_USERNAME`、私密配置和数据库服务依赖；仅在 `.env` 中增加 `DB_URL` 不会覆盖该 Compose 中写死的连接地址。

Swagger：`http://localhost:8080/swagger-ui/index.html`，需要有效 API 登录会话。健康检查：`/actuator/health/readiness`。当前提供的是容器配置示例，不代表容器部署已经验证或上线。

## 测试和打包

这里的本机数据库仅供隔离测试，**不是业务运行使用的远端库**。测试会清空业务表和 Session，禁止连接远端 `mark` 或任何需要保留数据的库。

默认集成测试使用 Testcontainers 创建 PostgreSQL 17.6，需要 Docker 正在运行：

```powershell
.\mvnw.cmd verify
```

也可使用独立的本机测试库（测试会清空其中业务表和 Session；绝不能指定正式库）：

```powershell
$env:TEST_DB_URL='jdbc:postgresql://127.0.0.1:55439/appeal_backend_test'
$env:TEST_DB_USERNAME='appeal_test'
$env:TEST_DB_PASSWORD=''
.\mvnw.cmd verify "-DargLine=-Djdk.net.unixdomain.tmpdir=D:/mark/backend/target"
```

外部测试 URL 只接受 `127.0.0.1` 和 `_test` 后缀。测试库必须预先准备好；`test-admin`、`test-reader` 是测试夹具账号，与业务登录用户不是同一组。测试会覆盖连接和初始化配置，不使用远端业务库。

如果只构建 JAR，不执行集成测试：

```powershell
.\mvnw.cmd -DskipTests package
```

产物为 `target/appeal-backend-0.1.0.jar`，跳过测试不等于通过验证。Java 进程不会因为打包而自动启动。实际验证证据和未验证事项见 [验证记录](docs/VERIFICATION.md)。

Gitea 入口为仓库根目录的 `.gitea/workflows/backend.yml`，包含隔离测试、镜像构建、可选镜像发布及已有 K8s Deployment 更新。发布和部署默认关闭；模块专用变量和版本标签规则见 [CI 配置](../docs/CI.md)。根目录 `.github/workflows/backend.yml` 用于 GitHub 检查，`integration.yml` 使用本仓库两个模块联调。工作流文件存在不代表远端流水线或部署已经验证。

## 密码重置与备份

维护命令 `reset <username>` 从控制台读取新密码，更新哈希并删除该用户已有数据库 Session。它会启动临时随机端口的应用上下文，需要相同数据库及迁移配置；不用于向公网提供服务。

完整业务恢复接口覆盖全部四个平台，但不覆盖登录用户、Session、Flyway 或恢复回执。恢复前暂停所有设备编辑，完成后关闭旧编辑框并刷新；后写覆盖规则不会检测恢复后才提交的旧草稿。

`sh deploy/backup.sh` 只备份本仓库 Compose 中的 `postgres` 服务及 `appeal` 库，**不会备份当前远端 `mark` 库**。

远端数据库应使用兼容其服务端版本的 PostgreSQL 客户端，显式指定远端地址。以下为手动备份示例，需相应数据库权限；`-W` 交互输入数据库密码，密码不写入命令或 Git：

```powershell
New-Item -ItemType Directory -Force backups | Out-Null
$backupFile = Join-Path 'backups' ('mark-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
pg_dump -h postgres.default.svc.local.k8s.ipipd.top -p 5678 -U postgres -d mark -Fc -W -f $backupFile
if ($LASTEXITCODE -ne 0) { throw '备份失败，请检查错误信息；勿把不完整文件当成备份' }
```

该示例尚未完成远端备份恢复演练。数据库备份包含登录用户等敏感内容，需限制文件权限、保留异机副本，并在另一空库中演练 `pg_restore --exit-on-error --no-owner -d <隔离库> <转储文件>`；不要在日常业务库上直接演练。持久卷不是备份，业务 JSON 也不能替代数据库备份。
