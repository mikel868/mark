# K8s 部署

前端通过 NodePort `30080` 提供页面和同源 `/api/` 代理，后端仅提供 ClusterIP 服务。连接已有 PostgreSQL，不创建数据库、PV 或 PVC。

## 部署前修改

1. 确认 `deployment.yaml` 中前后端镜像地址对应已发布版本，构建上下文分别为仓库的 `frontend/` 和 `backend/`。两个 Deployment 均配置 `imagePullSecrets: [{name: ipipd-aliyun}]`，该镜像拉取 Secret 必须已存在于 `test` 命名空间。
2. 检查 `configmap.yaml` 中现有数据库地址、连接用户名和两个初始化用户名。默认沿用项目当前配置的 `mark` 数据库。
3. 复制 `secret.example.yaml` 为 `secret.yaml`，填写数据库密码和两个完整的 `{bcrypt}$2a$...` / `{bcrypt}$2b$...` / `{bcrypt}$2y$...` 初始化哈希。真实 `secret.yaml` 已被 Git 忽略。
4. 确认 `test` 命名空间已有绑定成功的 `test-pv-claim`，且没有其他工作负载与它发生挂载冲突。所有 YAML 资源均指定 `metadata.namespace: test`，PVC 也必须位于 `test` 命名空间。

后端每次启动都会校验初始化参数，即使数据库已有账号也必须提供有效值；这些值不会重置已有账号。生成哈希的方法见 [后端说明](../../backend/README.md#私密配置与首次初始化的区别)。

PVC 使用卷名 `ipipd-data`，仅将卷内的 `ip-correction-backend` 子目录通过 `subPath` 挂载到后端 `/app/data`，避免与卷内其他应用目录混用；`JAVA_TOOL_OPTIONS` 将 Java 临时目录设为该路径，用于备份导出临时文件，正常导出完成后文件会删除。业务数据、证据图片和会话仍存放在已有 PostgreSQL。后端使用非 root 用户，通过 `fsGroup: 2000` 请求卷的组写权限；若存储驱动不支持 `fsGroup`，需由存储侧保证该组可写。

默认按内网直接 HTTP NodePort 访问设置 `SECURE_COOKIE=false`。正式环境接入 HTTPS 后将其改为 `true`；启用 Secure Cookie 后，浏览器需通过 HTTPS 访问。

## 应用清单

以下是供人工执行的命令，使用已有的 `test` 命名空间。从仓库根目录运行：

```bash
cp deploy/k8s/secret.example.yaml deploy/k8s/secret.yaml
# 编辑 secret.yaml、configmap.yaml 和 deployment.yaml，完成以上配置。
kubectl -n test get pvc test-pv-claim
kubectl -n test apply -f deploy/k8s/configmap.yaml
kubectl -n test apply -f deploy/k8s/secret.yaml
kubectl -n test apply -f deploy/k8s/service.yaml
kubectl -n test apply -f deploy/k8s/deployment.yaml
kubectl -n test rollout status deployment/ip-correction-backend --timeout=300s
kubectl -n test rollout status deployment/ip-correction-frontend --timeout=300s
```

不要对整个目录执行 `apply -f deploy/k8s/`，避免同时应用占位用的 `secret.example.yaml`。

访问 `http://<节点 IP>:30080`；节点网络需允许访问此端口。后端就绪探针检查数据库连接，前端 `/health` 仅检查 Nginx 服务。

ConfigMap / Secret 更新后，已有环境变量和 `subPath` 挂载的 Nginx 配置需要重启 Pod 才能生效：

```bash
kubectl -n test rollout restart deployment/ip-correction-backend deployment/ip-correction-frontend
```

后端保持单副本并使用 `Recreate` 更新策略，以配合单个 PVC；更新后端时服务会短暂中断。前端通过 K8s Service 名解析后端，不使用 Compose 镜像默认的 Docker DNS；若删除重建后端 Service，需重启前端以刷新 Nginx 的解析结果。

本目录只提供部署清单；生成清单不会修改集群。
