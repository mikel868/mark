# 平台申诉管理台

INS、Google、TikTok、Ping0 的账号、申诉流程、记录和证据管理。

本仓库 [mikel868/mark](https://github.com/mikel868/mark) 同时保存 Vue 前端和 Spring Boot 后端。两个模块仍独立运行、构建和部署，没有合成单个 JAR。

2026-10-21 从现有项目做干净导入，不携带旧仓库提交历史、真实部署凭据、私密配置或业务备份。GitHub 工作副本位于 `D:\mark-github`；原 `D:\mark` 和 Gitea 仓库保留不变，后续 GitHub 开发请使用新目录。

现有 GitHub Actions 用于质量检查和前后端联调，尚未配置向新云服务器自动部署。`.gitea/`、Kubernetes 清单和历史部署文档保留作参考，不代表 GitHub 已接入原服务器或新服务器。

```text
frontend/             Vue 3 + TypeScript + Element Plus
backend/              Java 21 + Spring Boot + MyBatis-Plus + PostgreSQL
docs/                 共享开发、测试与 CI 文档
.gitea/workflows/     Gitea 前端、后端工作流
.github/workflows/    GitHub 检查与同仓库联调
```

## 本地开发

需要 Node.js 24 和 Java 21。后端先启动，前端通过同源 `/api` 代理请求它。

后端终端：

```powershell
cd D:\mark-github\backend
.\mvnw.cmd spring-boot:run
```

后端读取 `backend/config/application-local.yml` 或环境变量，默认端口 `8080`。本次导入未复制任何私密配置；启动前必须自行提供数据库连接密码和初始化参数，并通过 `DB_URL`、`DB_USERNAME` 指向自己的数据库，不要直接连接历史配置中的旧服务器。见 [后端说明](backend/README.md)。

前端终端：

```powershell
cd D:\mark-github\frontend
npm ci
npm run dev
```

访问 `http://localhost:5176`。端口被占用时启动失败，不会自动切换。前端默认代理到 `http://127.0.0.1:8080`，可用 `BACKEND_URL` 覆盖。

从仓库根目录也可执行 `npm --prefix frontend run dev`。后端启动请进入 `backend/`，使相对路径的私密配置能正确加载。

## 验证与构建

```powershell
cd D:\mark-github
npm --prefix frontend run check:secrets
npm --prefix frontend run format:check
npm --prefix frontend run lint
npm --prefix frontend run test:unit
npm --prefix frontend run build

cd backend
.\mvnw.cmd verify
```

后端集成测试默认启动一次性 PostgreSQL，需要 Docker。Playwright 使用隔离测试库，配置见 [测试说明](docs/TESTING.md)。不要对业务数据库运行测试。

前端产物是 `frontend/dist/`，后端产物是 `backend/target/appeal-backend-0.1.0.jar`。模块版本目前均为 `0.1.0`，分别维护，不随 Git 提交自动增长。

## 项目文档

- [前端说明](frontend/README.md)
- [后端说明](backend/README.md) · [API](backend/docs/API.md) · [数据库设计](backend/docs/DATABASE.md)
- [单仓库 CI](docs/CI.md) · [测试](docs/TESTING.md) · [部署配置](docs/DEPLOYMENT.md)
- [仓库合并与本地文件说明](docs/MONOREPO.md) · [凭据与数据](docs/SECURITY.md)

后续统一在 GitHub 工作副本更新两个模块。历史文档中的 Gitea 地址、旧本机路径和集群地址描述迁移前的环境，不能直接当成新服务器的部署配置。原目录和旧仓库未删除，也没有被本次导入推送修改。
