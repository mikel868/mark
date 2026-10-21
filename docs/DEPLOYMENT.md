# 部署说明

浏览器访问 Nginx；Nginx 提供 Vue 静态文件，并将同源 `/api/` 请求转发到 Spring Boot；Java 读写 PostgreSQL。
不再支持脱离后端的本地数据模式。数据库连不上时页面显示失败，不会回退到浏览器保存。

## 本机运行

1. 在 `D:\mark\backend` 启动后端，私密配置位于该目录的 `config/application-local.yml`。
2. 在 `D:\mark\frontend` 执行 `npm run dev`，访问 `http://localhost:5176`。
3. 使用后端管理员或只读账号登录，前端 `.env.local` 的旧账号无效。
4. 默认 `/api` 代理到 `127.0.0.1:8080`。覆盖地址：`$env:BACKEND_URL='http://127.0.0.1:8080'`，随后启动 Vite。
5. HTTP 本机调试需后端 `SECURE_COOKIE=false`；正式 HTTPS 使用 `true`。

## 容器部署包

`frontend/deploy/docker-compose.example.yml` 使用同一仓库中的 `frontend/` 和 `backend/` 作为各自的构建上下文。
包含前端 Nginx、Java 和 PostgreSQL 17；只绑定本机 `127.0.0.1:8088`，数据库不开放宿主端口。
在宿主 HTTPS 入口反代到 8088，或按实际 TLS 入口调整配置。不要公开 HTTP 登录口。

创建不进 Git 的私密环境文件，提供：

- `DB_PASSWORD`：独立部署数据库密码。
- `INITIAL_ADMIN_USERNAME`、`INITIAL_READONLY_USERNAME`：两个登录名。
- `INITIAL_ADMIN_PASSWORD_HASH`、`INITIAL_READONLY_PASSWORD_HASH`：按后端文档生成的 BCrypt 哈希，不是明文密码。
- `SECURE_COOKIE=true`：正式 HTTPS；仅本机 HTTP 演示可设 false。

```powershell
cd D:\mark
docker compose --env-file D:\private\appeal.env -f frontend/deploy/docker-compose.example.yml config --quiet
docker compose --env-file D:\private\appeal.env -f frontend/deploy/docker-compose.example.yml up -d --build
```

Compose 示例会使用自己的新数据库卷，不会自动接入现有远程 mark 数据库。需要复用远程库时只修改后端连接配置，勿把默认数据卷当成已迁移的数据。
Nginx `/health` 只证明静态服务存活；后端数据库就绪检查是 `/actuator/health/readiness`，容器内调用验证。
API 错误不回退到 SPA。代理允许 110 MiB 请求，后端限制 JSON 2 MiB、备份文件 100 MiB、单图片 5 MiB/每条 10 张。

## K8s NodePort 部署

[K8s 清单与操作步骤](../deploy/k8s/README.md) 位于 `deploy/k8s/`，前后端分别部署，前端使用 NodePort `30080`，后端使用 ClusterIP 并连接已有 PostgreSQL，不部署新数据库。
ConfigMap 与 Secret 模板分开保存；真实 `secret.yaml` 被 Git 忽略。后端挂载已有 PVC `test-pv-claim` 到 `/app/data`，用于备份导出临时文件，业务数据和图片仍存数据库。
清单默认适配内网直接 HTTP NodePort，`SECURE_COOKIE=false`；正式环境接入 HTTPS，改为 `true`。

## 首次恢复旧数据

保留用户已导出的原 JSON，不要覆盖这份原件。登录管理员，进入“备份恢复”，选择文件并核对数量，再确认覆盖服务器共享数据。
恢复期间让其他设备暂停修改；v1 备份不含图片，恢复后图片为空。
恢复网络超时不等于失败：保留页面，用“查询恢复结果”确认；需要重试时页面复用原文件和操作编号。不要刷新页面重新生成另一笔恢复请求。
恢复前若服务器已有数据，先导出服务器完整备份。

## 上线检查与回退

- 验证两个独立浏览器共享数据、只读写入被拒绝、图片显示、完整备份往返。
- PostgreSQL 持久卷之外，建立异机 `pg_dump` 备份并在隔离库演练恢复；JSON 不包含应用用户、密码和会话，不能替代数据库运维备份。
- 保存前后端构建版本。回退前停止共享写入并导出当前服务器数据；切回旧纯前端版本不会自动包含服务器的新修改。
- 不执行 `docker compose down --volumes`，除非确实要销毁该部署数据库。

本次只修改和验证本机代码，不代表已部署。Docker 守护进程不可用时无法证明容器实际运行；上线前仍需运行全栈容器与数据恢复演练。

## CI

Gitea 使用仓库根目录的 `.gitea/workflows/frontend.yml` 和 `backend.yml`：按模块检查，通过后可分别发布镜像，并可选更新已有 K8s Deployment。发布和部署默认关闭，模块变量与版本标签规则见 [CI 配置](CI.md)。当前工作流配置不代表线上已执行。

Compose 镜像默认 Nginx 仍采用 Docker 网络 DNS；K8s 清单通过独立 ConfigMap 覆盖为集群 Service 代理。开启 K8s 自动部署前，应先按上述步骤准备资源并完成实际部署验证。

GitHub 工作流也在仓库根目录。`integration.yml` 直接检出同次提交中的两个模块，不再使用 `BACKEND_REPOSITORY`。Gitea 当前执行模块检查和容器静态烟测，完整浏览器联调仍按 [测试说明](TESTING.md) 在隔离环境验证。
