# GitHub Actions 部署到独立云服务器

当前目标为 `8.163.78.177`，Ubuntu 22.04、x86_64。服务器只运行容器；镜像由 GitHub 托管运行器构建，通过 SSH 上传，不使用私有镜像仓库，不要求本机开启 Docker。

## 现有资源不会重建

- PostgreSQL 容器：`mark-postgres`，数据库和用户名：`mark`。
- 数据卷：`mark-postgres-data`，挂载到 `/var/lib/postgresql/data`。
- Docker 网络：`mark-network`。
- Compose 只定义 `backend`、`frontend` 两个服务，没有 PostgreSQL 服务或数据卷定义。
- 不执行 `docker compose down`、删除数据库或数据卷、全局镜像清理。应用首次启动会由 Flyway 创建业务表和初始化用户；后续版本只执行新的迁移。

## 首次上线

1. 仓库 Settings → Secrets and variables → Actions → Repository secrets，添加 `DEPLOY_SSH_KEY`。值为服务器部署专用 SSH 私钥，不能设置成 Variable，也不要发送到聊天或提交 Git。
2. 对应公钥必须已追加到服务器 `/root/.ssh/authorized_keys`。本次以 root 部署，这把密钥具有服务器管理权限；只给可信仓库使用。工作流仅在 `main` 上的 push 或手动启动时取得部署密钥，PR 检查不取得它。
3. `deploy/server/ssh_known_hosts` 固定了用户已登录并信任的服务器 ED25519 公钥。不使用 `StrictHostKeyChecking=no` 或未核实的即时 `ssh-keyscan`。换机器、重装系统或换 IP 时，先从可信控制台核实新公钥，再修改工作流目标和该文件。
4. 合并部署配置到 `main`，打开 [Deploy to cloud server](https://github.com/mikel868/mark/actions/workflows/deploy.yml)。流程先执行前端、后端和联调测试，再构建镜像并上传。CI 只使用隔离测试数据库，绝不连接服务器业务库。
5. 首次没有 `/opt/mark/backend.env` 时，流程会显示 **Awaiting first-time server configuration — NOT LIVE**。此时镜像已准备，但应用未启动。流水线成功不代表已经上线。
6. 在已登录的服务器终端执行：

   ```bash
   release_dir=$(cat /opt/mark/pending-release)
   bash "$release_dir/configure.sh"
   ```

   按提示输入当前 `mark` 数据库的密码、新管理员密码和新只读密码。输入不显示字符；登录密码需要重复确认。脚本调用刚上传镜像中与登录相同的 Spring 密码编码器生成 BCrypt 哈希，不安装 Java 或 Maven，不输出明文或哈希。用户名固定为 `admin`、`user`。

   私密配置仅写入服务器 `/opt/mark/backend.env`，权限 `600`。文件已存在时拒绝覆盖。Compose 用 `env_file.format: raw` 读取，密码或哈希中的 `$`、引号和反斜杠不会被再次展开。后续发布保留该文件，不需要重复填写。

7. 配置成功后，在同一终端执行：

   ```bash
   bash "$release_dir/deploy.sh"
   docker ps
   ```

   脚本等待后端数据库就绪检查、前端健康检查，并验证 Nginx 的 `/api/v1/auth/csrf` 代理。只有通过后才输出 `MARK_DEPLOY_STATUS=deployed` 并记录 `/opt/mark/current-release`。已有登录账号不会因为初始化参数变化而重置。

8. 在云安全组中允许需要访问的来源连接 TCP `80`；SSH `22` 还需允许 GitHub 托管运行器连接。不要开放 `5432` 或 `8080`。若启用了系统防火墙，也要允许上述所需流量。浏览器打开 `http://8.163.78.177/`，验证登录、读写、复制、只读限制，然后用管理员在“备份恢复”中导入已导出的 JSON。导入会覆盖业务数据，先核对目标库与备份。

初始入口是 **HTTP 验证环境**，`SECURE_COOKIE=false`。HTTP 会明文传输登录信息、业务凭据和备份；接入可信 HTTPS 并把服务器 `backend.env` 中的 `SECURE_COOKIE` 改成 `true` 后，才能按 HTTPS 使用。不要在只有 HTTP 时提前改成 true，否则浏览器不会发送会话 Cookie。当前配置不包含域名、证书签发或 HTTPS 自动续期。

## 后续更新

本地修改 → 提交 / 合并到 `main` → GitHub 测试 → 构建两个镜像 → SSH 上传 → 更新应用。服务器不需要 Git 仓库，也不需要你的 GitHub 私钥。

- 镜像标签用完整提交 SHA，不覆盖 `latest`；构建记录和传输文件都有校验，加载后核对镜像 ID。
- 统一流水线串行部署，服务器还有 `flock` 锁；准备部署前检查提交仍是最新 `main`，旧任务不会覆盖新任务。
- 不是蓝绿部署，更新时可能短暂中断。失败不会自动回滚数据库迁移；应检查后修复再重试，不要修改已执行的 Flyway 文件。
- `main` 统一调用三份可复用检查工作流，避免同时重复运行原来的 main push 检查。其他分支和 PR 仍保留检查，但不会部署。
- 手动重试：在 GitHub Actions 的该工作流选择 Run workflow，分支选 `main`；或者在服务器确认版本后执行当前 / 待配置发布目录内的 `deploy.sh`。

## 内存、磁盘与备份

后端限制 640MiB（Java 堆最大 320MiB），前端限制 96MiB；数据库沿用之前设置的 512MiB 限制。实际是否足够取决于并发、图片和备份大小，不能把这些上限当作内存充足的保证。服务器已有 Swap 可缓解峰值，但不能替代物理内存。

每次只删除本次已加载的镜像压缩传输包；保留旧镜像，不自动执行全局 prune。定期检查 `free -h`、`docker stats --no-stream`、`df -h` 和 `docker system df`。数据库命名卷不是备份，需要安排独立的数据库备份和异机副本。GitHub 上传镜像或应用更新不包含业务数据迁移。

## 本地部署脚本测试

```bash
node --test deploy/server/deployment.test.mjs
```

需要 Bash 和 Docker Compose 客户端；只执行 Compose 配置解析及模拟 Docker 的脚本测试，不启动容器，不需要 Docker 引擎。Windows Git Bash 可先设置 `BASH_FOR_TESTS` 为实际 bash.exe 路径；Windows 的测试模拟 `flock`，Linux CI 使用真实文件锁。真实镜像构建、哈希工具和全栈测试由 GitHub Actions 验证。
