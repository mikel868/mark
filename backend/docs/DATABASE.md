# 数据库与事务说明

业务账号与登录用户分别是 accounts / app_users，不要混淆。账号名允许重复；登录用户名唯一。

## 当前数据来源

默认业务连接是远端 `postgres.default.svc.local.k8s.ipipd.top:5678/mark`；环境变量可以覆盖，具体规则见 [README](../README.md)。Java 在本机运行不代表 PostgreSQL 也在本机。

- `accounts`、申诉、IP 与图片等业务数据保存在该数据库。
- 登录时 `SecurityConfig.users()` 从 `app_users` 查询密码哈希、角色和启用状态；不是读取本地登录账号文件。
- Spring Session JDBC 也使用此数据源，保存到 `spring_session` 和 `spring_session_attributes`。
- 本地私密配置保存连接密码及初始化参数，不是另一个账号数据库。Compose 的 `appeal` 库和隔离测试库属于其他环境，不能视为远端 `mark` 的副本。

## Flyway

- V1：业务表、平台约束、关系与索引。
- V2：登录用户、Spring Session 官方字段结构和索引。
- V3：一次性插入 ADMIN/READONLY；用户名及 bcrypt 哈希由占位符注入。
- V4：恢复成功回执。

当前启动代码每次仍校验初始化用户名及哈希，即使 V3 已执行也需提供有效 `INITIAL_*`；V3 不会因此重复执行或重置现有密码。

所有表使用 PostgreSQL；不提供 H2 替代建表脚本。业务实体 ID 为 text，兼容旧非 UUID 备份；新业务记录使用 UUID 字符串，业务时间列为 timestamptz。Spring Session 使用自己的表结构，其中时间字段为 bigint，不能把业务字段类型套用于所有表。

## 联合索引与最左前缀

| 索引列顺序 | 对应查询 / 约束 |
| --- | --- |
| accounts(platform_id,created_at DESC,id DESC) | 当前平台账号列表排序分页 |
| appeal_records(platform_id,created_at DESC,id DESC) | 不限状态的申诉列表 |
| appeal_records(platform_id,status,created_at DESC,id DESC) | 平台＋状态筛选后分页 |
| appeal_records(platform_id,account_id) | 账号引用与删除时解除关联 |
| appeal_records(platform_id,module_id,step_id) | 流程引用检查 |
| appeal_steps(platform_id,module_id,sort_order,id) | 模块内步骤排序 |
| appeal_record_ips(record_id,position,id) | 每条记录内 IP 顺序 |
| record_evidence_images(platform_id,record_id,created_at,id) | 单条记录图片元信息 |

以 `(platform_id,status,created_at,id)` 为例：平台和状态是等值过滤，后两列可提供排序；只限定平台时，跨状态的时间排序不能直接由此索引保证，所以另有不含 status 的列表索引。最左前缀与 WHERE 条件书写顺序无关，不代表缺少最左列就绝对不能使用索引。生产数据量和筛选分布确定后，用 EXPLAIN (ANALYZE, BUFFERS) 核验；小表顺序扫描不一定是问题。

父表 `(platform_id,id)` 唯一约束主要服务于跨平台复合外键，并非声称比已有 id 主键定位更快。PostgreSQL 不会自动为所有外键的引用端创建索引，因此相关索引显式列出。

## 删除与并发

- 删除账号：复合外键 `ON DELETE SET NULL (account_id)`，保留平台、记录、IP、图片。
- 删除记录：级联删除 IP 子项及证据；删除有引用的模块/步骤受到外键阻止。
- 非空 step_id 必须有 module_id，三列外键保证步骤属于同平台的正确模块。
- 普通更新只写提交字段，不使用 @Version；同字段最后数据库写入生效。
- 批量状态：一次 UPDATE，影响行数与去重 ID 数不一致就抛异常，事务回滚。
- IP/账密/图片：先持有共享维护锁，再锁父记录，在事务里更新，防止数量与状态竞态。
- 恢复：独占事务级 advisory lock，与普通写入互斥；成功回执与业务替换同事务。
- 导出：REPEATABLE READ 快照，先生成受限临时文件再发送；数据库图片始终为 bytea，不存 Base64。

恢复后旧表单仍可能按后写覆盖规则提交，因此需要维护窗口及所有设备手动刷新。普通请求无通用幂等回执，不得自动重试新增/导入。
