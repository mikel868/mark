# 单仓库 CI 与发布

## 当前 GitHub 云服务器部署

GitHub 仓库 `mikel868/mark` 的当前入口为 `.github/workflows/deploy.yml`。`main` 的 push 和手动运行先调用前端、后端、联调检查与部署脚本测试，再构建镜像并通过固定主机公钥的 SSH 上传到独立服务器。不使用下文的 Gitea 镜像仓库、发布开关或 Kubernetes 凭据。唯一部署 Secret 为 `DEPLOY_SSH_KEY`，数据库和初始化密码留在服务器。

首次配置、HTTP 验证入口、内存限制与后续更新见 [独立云服务器部署](../deploy/server/README.md)。其他分支及 PR 继续运行检查，不获得部署密钥；`main` 由统一工作流调用检查，避免重复执行。下文记录旧 Gitea / Kubernetes 发布方式，不是当前 GitHub 部署步骤。

## 历史 Gitea / Kubernetes 配置

前端和后端现在都属于 `IP-Correction-Document`，工作流统一放在仓库根目录。

| 平台   | 入口                                | 检查范围                                                               |
| ------ | ----------------------------------- | ---------------------------------------------------------------------- |
| Gitea  | `.gitea/workflows/frontend.yml`     | 前端格式、Lint、121 项单元测试、类型检查、构建、依赖审计、容器静态烟测 |
| Gitea  | `.gitea/workflows/backend.yml`      | Java 21、Maven verify、隔离 PostgreSQL 集成测试、生产镜像构建          |
| GitHub | `.github/workflows/frontend.yml`    | 前端质量与容器静态检查                                                 |
| GitHub | `.github/workflows/backend.yml`     | 后端 Maven verify                                                      |
| GitHub | `.github/workflows/integration.yml` | 使用同次提交中的两个模块运行 Playwright 联调                           |

只修改 `frontend/` 时触发前端检查，只修改 `backend/` 时触发后端检查。根目录的共享文档、README、忽略规则触发两边检查；修改某个工作流时触发它自身。GitHub 联调在任一模块变动时运行，不再需要 `BACKEND_REPOSITORY` 或跨仓库凭据。

Gitea 前端在推送到 `main` 且检查通过后自动发布镜像、更新部署，不需要额外的发布开关；其他分支只检查和构建。后端仍需发布、部署开关明确为 `true`，并匹配 `RELEASE_BRANCH`。PR 不发布、不部署。

## 工作目录与版本

- 前端命令在 `frontend/` 执行，版本来自 `frontend/package.json`，当前 `0.1.0`。
- 后端命令在 `backend/` 执行，版本来自 `backend/pom.xml` 的项目 version，当前 `0.1.0`。
- 两个模块独立发版，Git 标签分别为 `frontend-v0.1.0`、`backend-v0.1.0`。标签中的版本必须与对应模块一致。旧 `v*` 标签不再触发发布。
- 镜像标签为 `<模块版本>-<完整提交 SHA>`；不覆盖 `latest`，部署使用发布得到的 `repository@sha256:...`。
- 前端发布分支固定为 `main`；后端发布分支由变量 `RELEASE_BRANCH` 指定。版本标签只发布对应镜像，不自动更新部署。
- Docker 构建上下文分别是 `frontend/` 和 `backend/`，不要从仓库根目录使用 `docker build .`。

## 合并后的变量名称

同一仓库需要两组模块变量，避免前后端发布到相同镜像或更新同一个容器。旧仓库的 Variables/Secrets 不会随着 Git 历史导入。

| 用途       | 前端变量                       | 后端变量                      |
| ---------- | ------------------------------ | ----------------------------- |
| 允许发布   | 自动发布，无需开关             | `BACKEND_PUBLISH_ENABLED`     |
| 允许部署   | `main` 自动部署，无需开关      | `BACKEND_DEPLOY_ENABLED`      |
| 镜像路径   | `FRONTEND_IMAGE_NAME`          | `BACKEND_IMAGE_NAME`          |
| 命名空间   | `FRONTEND_K8S_NAMESPACE`       | `BACKEND_K8S_NAMESPACE`       |
| Deployment | `FRONTEND_K8S_DEPLOYMENT_NAME` | `BACKEND_K8S_DEPLOYMENT_NAME` |
| 容器名称   | `FRONTEND_K8S_CONTAINER_NAME`  | `BACKEND_K8S_CONTAINER_NAME`  |

共享 Variables：`REGISTRY`、`REGISTRY_USERNAME`、`KUBECTL_VERSION`。`RELEASE_BRANCH` 仅供后端使用；前端不再读取 `FRONTEND_PUBLISH_ENABLED`、`FRONTEND_DEPLOY_ENABLED` 或外部的 `RELEASE_BRANCH`，已有这些变量也不会影响前端发布。
共享 Secrets：`REGISTRY_PASSWORD`、`LOCAL_KUBECONFIG`（Base64 编码）。真实值不写入工作流。镜像仓库和部署目标仍需首次配置；前端缺少必需配置会明确报错，而不是按开关跳过。后端未设置开关时仍跳过发布/部署。

## 保留的发布约束

部署任务只更新已有 Deployment，不创建集群资源。它检查本次提交仍在发布分支历史中，并比较该模块及共享发布输入：后续仅修改另一个模块时允许继续，当前模块或共享输入已变化时跳过旧任务，避免目录过滤后某个模块漏发布。然后通过 `resourceVersion` 前置检查更新指定容器的镜像，再等待 rollout 和核对最终镜像。对象并发变化可能导致检查失败，需要核实后重跑；没有自动回滚。

前端镜像默认的 `frontend/deploy/nginx.conf` 使用 Docker DNS `127.0.0.11` 和 `backend:8080`。[K8s 清单](../deploy/k8s/README.md) 通过独立 ConfigMap 覆盖为集群 Service 代理。自动部署前先准备这些资源并验证，前端 Deployment / 容器名分别为 `ip-correction-frontend` / `frontend`，后端分别为 `ip-correction-backend` / `backend`；两者命名空间均填写 `test`，PVC 也应位于该命名空间。
后端就绪检查 `/actuator/health/readiness` 包含数据库检查；存活检查为 `/actuator/health/liveness`。业务数据库凭据和初始化参数不提供给 CI 测试。

Runner 需支持 Linux、Bash、Git、Python 3 和 Docker；后端测试使用 Testcontainers 的一次性 PostgreSQL。Gitea 前端静态烟测故意不启动后端，不能代替完整业务联调。

## 验证记录

2026-10-12 的旧工作流本地检查记录保留在 Git 历史中，不作为迁移后工作流已经在远端通过的证据。迁移后的本地验证和限制见 [仓库合并说明](MONOREPO.md)。
