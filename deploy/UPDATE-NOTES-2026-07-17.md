# Leadspace.Alipay 更新说明（2026-07-17）

> 本次准备部署的内容汇总。部署前请本地 `npm run build` 通过，并按 `Leadspace.Ali.md` §15 确认后再上线。

## 1. 账号变更

| 项 | 说明 |
|----|------|
| 管理员登录名 | `Antonio` → **`admin`** |
| 初始密码（仅新建） | `123456` |
| 已有环境 | seed / `ensureAdminDirector` 会把历史用户名 `Antonio` **改名为 `admin`，不重置密码** |
| 登录提示 | 开发环境文案已改为 `admin / 123456` |

部署后请用 **`admin`** 登录（若生产曾改过 Antonio 密码，改名后密码不变）。

---

## 2. 业务线架构

- 入口页选择业务线：**小蓝环 `/xlh`**、**支付宝 N7 `/n7`**
- 用户表增加 `businessLines`（默认 `["xlh","n7"]`）
- 组织管理可勾选经理可访问的业务线
- 页面中间件 + API（N7 / 小蓝环）按业务线鉴权
- **仅开通 N7 的经理**不能再直接调用小蓝环 ledger/teams/members/stats/excel API

---

## 3. N7 业务线（新功能）

### 3.1 数据与导入

- 新模型 `N7DeviceRecord`（设备 SN 全量同步：新增 / 更新 / 删除缺失 SN）
- 管理员：`/n7/admin/import` 上传运营加工表（非「原始表格」）
- 按**注册日期**筛选（默认本月；预设本月 / 上月）

### 3.2 看板（负责人 / 经理）

| 角色 | 首页 | 能力 |
|------|------|------|
| 负责人 | `/n7` 经理排行 | 下钻队员、设备；导入；全量待跟进 |
| 经理 | `/n7` 本团队队员排行 | 每日绩效、待跟进（仅本团队）；无导入 |

摘要条：拓展 SN、已达标（绿）、达标率（≥75% 绿 / 60–75% 橙 / &lt;60% 红）、待跟进、P0。

优先级筛选文案：

- P0 **剩余≤2天**
- P1 无动销
- P2 未订阅/打卡
- P3 预警（紫色）

### 3.3 每日绩效 `/n7/daily`

- 顶部合计：开单数、已达标
- 图表：**并排柱**（蓝=开单数，橙=已达标）
- 语义：按注册日统计；已达标为该日注册设备的**当前**达标状态

### 3.4 待跟进 `/n7/follow-up`

- 优先级 / 队员筛选
- **导出表格**（Excel，含当前筛选结果）
- 电脑端导出按钮在页头右上角

### 3.5 其它 UX

- 排行榜小屏仍为完整表格（可横滑，前两列固定）
- 手机顶栏显示当前业务线名称
- 日期筛选本月/上月高亮；搜索/下拉小屏全宽
- 有明确父级的返回用真实链接；通用「返回」仅同站来源才 `history.back`
- 修改密码页有返回；说明双业务线共用一套密码

---

## 4. 部署与安全加固（同批）

| 项 | 变更 |
|----|------|
| `deploy/server-deploy.sh` | 先起 DB → `prisma db push` → 再 build/启动 app；默认**不跑 seed**（`RUN_DB_SEED=1` 才跑） |
| Seed 密码 | 已有 admin/Antonio **不覆盖密码** |
| Nginx | `client_max_body_size 100m`；`proxy_*_timeout 600s`（大表导入） |
| 管理员种子 | 用户名改为 `admin` |

**部署后务必**：把更新后的 `deploy/nginx/ali.orblead.com.conf` 同步到服务器并 `nginx -t && reload`。

---

## 5. 部署步骤（摘要）

```bash
# 本地
npm run build

# 确认可部署后
./deploy/push-and-deploy.sh

# 服务器 nginx（若 conf 有变）
# 复制 nginx 配置 → nginx -t → reload

# 仅首次或要迁 Antonio→admin / 补种子时：
# RUN_DB_SEED=1 ./deploy/server-deploy.sh
```

### 部署后检查

- [ ] https://ali.orblead.com/login 可开
- [ ] **`admin`** 可登录（原 Antonio 密码仍有效）
- [ ] 业务选择 → 小蓝环 / N7
- [ ] 经理：N7 团队看板、待跟进、导出
- [ ] 负责人：N7 导入 + 经理排行
- [ ] 已登录用户建议**重新登录**（刷新 JWT 中的 `businessLines`）
- [ ] hk.orblead.com 不受影响

---

## 6. 已知限制（已自动处理）

| 原风险 | 现处理 |
|--------|--------|
| 经理同名可能串数据 | 部署时回填 `managerUserId`；查询仅对「未绑定 id」的历史行用姓名兜底 |
| 未开通 N7 仍进空壳页 | 页面入口校验业务线，未开通直接回业务选择页 |
| Antonio → admin | 每次部署自动跑 `deploy:bootstrap`，改名不改密码 |

---

## 7. 主要新增/修改路径（便于 Code Review）

```
src/app/(dashboard)/n7/**          # N7 页面
src/app/(dashboard)/xlh/**         # 小蓝环迁路径
src/app/api/n7/**                  # N7 API + 待跟进导出
src/services/n7/**                 # 分析、权限范围
src/services/export/n7-follow-up-exporter.ts
src/services/xlh/xlh-scope.ts      # 小蓝环 API 业务线校验
src/lib/business-lines.ts
prisma/schema.prisma               # User.businessLines、N7DeviceRecord
deploy/server-deploy.sh
deploy/nginx/ali.orblead.com.conf
```
