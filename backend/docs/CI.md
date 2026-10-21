# 后端 CI

后端已并入 `IP-Correction-Document/backend/`。有效工作流位于仓库根目录：

- Gitea：`.gitea/workflows/backend.yml`。
- GitHub：`.github/workflows/backend.yml`。
- 前后端联调：`.github/workflows/integration.yml`，直接使用本仓库的 `frontend/` 和 `backend/`。

Maven 和 Docker 构建均以 `backend/` 为工作目录；Java 21，版本读取 `backend/pom.xml`。后端版本标签使用 `backend-v<版本>`，当前为 `backend-v0.1.0`。

合并后的变量、发布条件和验证边界统一维护在 [仓库 CI 说明](../../docs/CI.md)。原独立仓库的变量不会自动导入，旧 `PUBLISH_ENABLED`、`IMAGE_NAME`、`DEPLOY_ENABLED` 等需按文档替换为后端专用名称。
