# 前后端仓库合并

> 本文是原 Gitea 仓库合并的历史记录。2026-10-21 已将代码干净导入 `https://github.com/mikel868/mark`，不携带本文描述的旧 Git 历史或私密配置。新工作副本为 `D:\mark-github`，当前说明以根目录 README 为准；原目录和 Gitea 仓库保持不变。

2026-10-19 将 Vue 和 Spring Boot 统一到原有 `IP-Correction-Document` 仓库。本机根目录仍为 `D:\mark`，远端地址没有变化，没有创建新远端仓库。

## 当前目录

| 内容                               | 当前位置                                         |
| ---------------------------------- | ------------------------------------------------ |
| Vue 源码、依赖与前端构建           | `frontend/`                                      |
| Spring Boot 源码、Maven 与后端构建 | `backend/`                                       |
| 共享文档与原计划                   | `docs/`                                          |
| 后端 API、数据库与历史验证说明     | `backend/docs/`                                  |
| Gitea、GitHub 工作流               | 根目录 `.gitea/workflows/`、`.github/workflows/` |

这次只合并仓库，没有改变 API、登录、权限、数据库结构或业务数据。前后端仍是两个运行服务，版本分别为 `0.1.0`。

## Git 历史

先按功能提交原有未提交的前端界面、前端 CI 和后端 CI 变更，再移动前端目录。后端通过不 squash 的 Git subtree 导入，原后端提交成为主仓库历史的祖先，没有复制嵌套 `.git`、改写旧提交或使用强制推送。

原 `D:\mark-backend` 目录及其远端仓库保留。后续后端开发以 `D:\mark\backend` 为准；旧目录中的独立分支不会自动同步新仓库。

## 本地配置

- 前端原 `.env.local` 已随模块移动到 `frontend/.env.local`，仍被忽略，不用于校验登录。
- 后端原 `config/application-local.yml` 和 `.env` 已复制到 `backend/`，内容校验一致，仍被 Git 忽略。原文件未删除，未输出其内容。
- 后端启动工作目录需设为 `backend/`，才能导入 `./config/application-local.yml`。新克隆不会包含这些私密文件。
- `node_modules` 移到 `frontend/`；构建产物和私密配置不进入 Git。原 `backend/` 之外的运行实例不会因合并而自动切换工作目录。
- 历史计划和验证文档中的旧路径描述当时状态，保留原文；当前启动方式以根目录 README 为准。

## 构建与 CI

Docker 构建上下文分别为 `frontend/` 和 `backend/`。完整 Compose 示例仍在 `frontend/deploy/docker-compose.example.yml`，后端上下文改为同仓库的 `../../backend`。后端独立 Compose 示例位于 `backend/compose.yml`。

工作流已移到仓库根目录，设置模块工作目录、依赖缓存路径和目录过滤。镜像名、部署开关、容器目标使用各模块专用变量；标签分别是 `frontend-v<版本>` 和 `backend-v<版本>`。同仓库 GitHub 联调不再检出旧后端仓库。详情见 [CI 说明](CI.md)。

## 本地验证范围

- 前端迁移前和迁移后均通过 19 个文件、121 项单元测试；迁移后通过格式、Lint、类型检查和生产构建。
- 后端从新目录完成 Java 编译、4 项 `IpRulesTest`、Spotless 检查和可执行 JAR 打包。未更改 Java 业务源码或 SQL 迁移文件。
- 五份工作流通过 YAML 解析、35 段 Bash 和 2 段 Python 语法检查；通过 24 组目录过滤、16 组模块发布条件和 10 组真实 Git 历史的过期发布判断。后者从模块工作目录执行实际判断脚本，覆盖其他模块更新、自身更新、共享输入更新和提交被移出分支。
- 两份 Compose 使用虚构参数通过 `config --quiet`；没有启动或重建业务容器。
- 检查双方 Git 历史可达、131 个迁移的源码/测试/配置文件内容一致、私密配置一致且被忽略，并验证凭据检查能从前端目录发现后端的私密文件。
- 前端开发服务在新目录使用原端口 `5176`；本机原后端 `8080` 保持运行。API 连通性检查只访问未登录接口，不导入备份或修改业务记录。

本机 Docker daemon 不可用，未重跑依赖 PostgreSQL 的后端集成测试、Playwright 全栈联调或容器烟测；不能把编译打包通过当作这些测试通过。没有推送、创建 PR、配置远端变量或部署。

Code review: skipped (ce-code-review unavailable)

已加载专用审查技能，但它要求独立审查与汇总代理；当前项目明确要求在主线程顺序执行，因此无法产出其独立审查回执。使用主线程差异检查和上述配置、历史、源码一致性与运行验证，不将其称为独立审查通过。
