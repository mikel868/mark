# 平台申诉管理台

Vue 3 + TypeScript + Element Plus 前端，管理 INS、Google、TikTok、Ping0 的账号、申诉流程、记录和证据。
现在通过 Spring Boot API 读写 PostgreSQL，数据跨浏览器、跨设备共享。后端位于本仓库的 `../backend`，统一入口见 [项目说明](../README.md)。

## 开发

以下命令均在 `frontend/` 目录执行。需要 Node.js 24，先启动后端（默认 8080），再执行：

```powershell
npm ci
npm run dev
```

前端固定使用 `http://localhost:5176`，端口占用时直接报错，不自动换端口。
Vite 把 `/api` 转发到 `http://127.0.0.1:8080`。其他地址通过启动进程环境变量 `BACKEND_URL` 设置。
不要把后端 URL 或密码写成 `VITE_*` 凭据。旧 `.env.local` 文件保留在本机，但不再用于前端登录，也不再跟踪到 Git。

## 数据与登录

- 登录由后端验证；HttpOnly Cookie 保存 Session 标识，CSRF token 仅在内存中使用。
- 管理员维护数据，只读账号查看、搜索、复制和导出；后端最终执行权限检查。
- 列表使用服务端分页和筛选；进入页面、筛选、翻页、保存或手动刷新时获取数据，不自动轮询。
- 编辑只发送实际修改的字段；批量状态更改由后端保证整批成功或整批回滚。
- 图片原始内容保存在 PostgreSQL `bytea`，页面通过认证接口获取。
- 完整备份和绿色 IP 导出不限当前页；恢复覆盖服务器全部四个平台数据。

切换不会清空原浏览器 IndexedDB，也不会自动导入旧备份。旧数据需由管理员在“备份恢复”页面选择已导出的 JSON，核对数量后确认恢复。

## 检查

```powershell
npm run lint
npm run typecheck
npm run test:unit
npm run format:check
npm run build
```

真实浏览器测试会覆盖测试库，必须先准备隔离后端，见 [测试说明](../docs/TESTING.md)。不要对正式服务运行 E2E。
部署配置和限制见 [部署说明](../docs/DEPLOYMENT.md)，凭据与备份约定见 [安全说明](../docs/SECURITY.md)。
