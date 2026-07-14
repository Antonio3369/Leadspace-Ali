# Leadspace.Alipay 项目参考手册

> 支付宝 P 站推广业务数据统计、展示与管理系统。  
> 本文档供下次开发前快速查阅；入门步骤见 [README.md](./README.md)。

**最后更新**：2026-07-13（含生产部署规范）

---

## 1. 项目是什么

| 项 | 说明 |
|---|---|
| 产品名 | **Leadspace.Alipay**（副标题：数据工作台 / 数据管理） |
| 业务 | 推广商户拓展数据导入、指标统计、风控台账、商机分析、团队/人员管理 |
| 用户 | 事业部负责人、区域经理、团队主管、一线业务员（业务员为数据账号，不可登录） |
| 数据来源 | 现阶段以 Excel 人工上传为主；P 站 API 同步为后续阶段 |

---

## 2. 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 16（App Router） |
| 语言 | TypeScript |
| 数据库 | PostgreSQL 16 + Prisma 7（client 输出到 `src/generated/prisma`） |
| 认证 | NextAuth.js v5（JWT session） |
| 样式 | Tailwind CSS 4 |
| 表格 | @tanstack/react-table |
| 图表 | recharts |
| Excel | xlsx |

---

## 3. 本地开发

### 3.1 启动顺序

```bash
# 终端 1：数据库（二选一）
docker compose up -d
# 或
npx prisma dev -d          # 本地 Prisma Dev，默认 localhost:51214

# 终端 2：应用
npm install
npm run db:push && npm run db:seed   # 首次
npm run dev                          # http://localhost:3000
```

### 3.2 环境变量

复制 `.env.example` → `.env`，至少需要：

- `DATABASE_URL` — PostgreSQL 连接串
- `AUTH_SECRET` — `openssl rand -base64 32`
- `PERSONNEL_FILE`（可选）— 人员名单 Excel 路径，seed 时使用

Docker 默认：`postgresql://leadspace:leadspace@localhost:5432/leadspace`

### 3.3 演示账号

| 账号 | 密码 | 角色 | 说明 |
|---|---|---|---|
| `Antonio` | `123456` | DIRECTOR（事业部负责人） | 全权限，已激活 |

Excel 导入后分三类处理：

- **经理**（可登录）：默认 `IMPORTED`（无密码），须管理员在 **组织管理** 开通
- **主管**（可登录）：Excel 导入后须开通；或由经理创建账号并设密码（`PENDING_ONBOARDING` → onboarding）
- **业务员**（纯数据账号）：人员名单 Excel 导入即可，**无需、也无法开通登录**

### 3.4 常用命令

```bash
npm run dev              # 开发服务器
npm run build            # 生产构建（改代码后建议跑一遍）
npm run db:push          # 同步 schema
npm run db:seed          # Antonio + 人员名单
npm run db:studio        # Prisma Studio
npm run import:all       # CLI 批量导入商户 Excel
npm run import:fresh     # 重置并重新导入
npm run backfill:merchant-owners  # 按姓名回填商户归属
npx tsx scripts/enable-manager.ts <登录名> [密码]  # CLI 开通经理
```

### 3.5 常见故障

| 现象 | 原因 | 处理 |
|---|---|---|
| 登录页「服务器错误」 | Prisma Dev 进程 OOM/断连（约 40min+） | 重启 `npx prisma dev` + `npm run dev` |
| 端口 3000 占用 | 旧 Next 进程未退出 | `lsof -i :3000` 后 kill |
| 构建报 Prisma 类型错误 | schema 变更后未 generate | `npm run db:generate` |

---

## 4. 品牌与 UI 规范

### 4.1 全站 Notion 风格

2026-06-14 起全站统一 Notion 化布局，核心组件在：

```
src/components/ui/notion.tsx
```

常用导出：

| 组件 | 用途 |
|---|---|
| `PageShell` / `PageHeader` | 页面容器与标题区 |
| `NotionPanel` / `notion.tableWrap` | 卡片、表格容器 |
| `NotionButton` / `NotionInput` / `NotionSelect` | 表单控件 |
| `DateFilterBar` / `DateRangeMeta` | 日期快捷筛选（本月/上月/近30天/近90天/全部/自定义） |
| `NotionStatCard` / `NotionTabs` | 指标卡、Tab |
| `NotionAlert` | 提示条 |

配色要点：页面背景 `#f4f6f9` / `#fbfbfa`，面板白底圆角 14px，主色 `#2563eb`。

### 4.2 布局结构

```
src/components/layout/
├── AppShell.tsx      # 侧边栏 + 主内容区
├── Sidebar.tsx       # 左侧导航（替代旧 Navbar）
└── SignOutButton.tsx
```

**Sidebar 导航项**（按顺序）：

1. 数据总览 `/`
2. 团队明细 `/teams`
3. 商机分析 `/opportunities`
4. 风控台账 `/ledger`
5. 组织管理 `/admin/org` 或 团队管理 `/admin/team`（按角色）
6. 数据上传 `/admin/import`（仅 DIRECTOR）
7. 公共大屏 `/screen`（仅 DIRECTOR）

品牌区显示 **Leadspace.Alipay** + **数据工作台**；经理角色侧边栏显示「经理」而非「区域经理」。

### 4.3 尚未 Notion 化的页面

- `/onboarding` — 实名认证（经理/主管；业务员不使用）
- `/change-password` — 强制改密（功能已有，样式较简）

---

## 5. 角色与权限

定义在 `src/lib/permissions.ts`，中间件 `src/middleware.ts` + `src/lib/auth.config.ts`。

### 5.1 四级角色

| 角色 | 英文 | 数据范围 | 特殊能力 |
|---|---|---|---|
| 事业部负责人 | DIRECTOR | 全量 | 上传 Excel、公共大屏、组织管理 |
| 区域经理 | MANAGER | 所辖团队 | 团队管理（业务员花名册）、组织管理侧开通主管 |
| 团队主管 | SUPERVISOR | 小组 + 个人 | **强制双区**（团队/个人 Tab） |
| 一线业务员 | SALES | 个人 | **不可登录**（纯数据账号） |

### 5.2 谁可以登录

**可登录角色**：DIRECTOR、MANAGER、SUPERVISOR（`canRoleSignIn` 拒绝 `SALES`）。

```
Excel 导入 → IMPORTED（无密码）
    ↓ 管理员在组织管理开通
经理 → ACTIVE（可立即登录；首登须改密）
    ↓ 经理可创建/开通主管
主管 → PENDING_ONBOARDING → 实名认证 /onboarding → ACTIVE
```

**业务员（SALES）不走上述流程**：

```
人员名单 Excel 导入 → IMPORTED（永久保持，无密码）
    ↓ 商户 Excel 按姓名匹配 salesUserId
经理/主管在系统中查看该业务员的业绩数据
```

业务员相关能力边界：

- 不支持登录（`/api/auth/check-account` 直接拒绝）
- 不支持开通（`/api/admin/users/.../enable` 拒绝）
- 不支持在后台手动创建（须走人员名单 Excel）
- `/admin/team` 仅查看花名册、作业账号/PID、停用/启用**数据状态**

额外规则（针对可登录角色）：

- 首登须改密：`mustChangePassword=true` → 强制跳转 `/change-password`
- 停用账号：`status=DISABLED` → 踢回登录页
- 管理员代操作（重置密码、停用等）后，目标用户下次访问自动退出
- Session 与 DB 状态通过 middleware 同步校验

### 5.3 数据可见性

统计与查询统一走 `src/services/stats/manager-scope.ts` + `buildLedgerWhere()`，按角色计算 `accessibleUserIds` / `accessibleTeamIds`，防止 URL 参数越权（`assertUserAccess` / `assertTeamAccess`）。

---

## 6. 页面与路由地图

### 6.1 业务页面（需登录，`src/app/(dashboard)/`）

| 路径 | 页面 | 要点 |
|---|---|---|
| `/` | 数据总览 | URL 日期筛选，默认**本月**；主管双区 |
| `/teams` | 团队明细 | 按人员/团队列表，可进经理详情 |
| `/teams?…` | 团队详情展开 | `TeamDetailsView`，URL 日期+搜索+排序 |
| `/members` | 人员明细 | 列表 + 导出 |
| `/members/[id]` | 经理/主管详情 | **统一日期范围**（Option A）：指标、图表、排行同一 `dateFrom/dateTo` |
| `/opportunities` | 商机分析 | URL 日期筛选，默认本月；列表按拓展日期过滤 |
| `/opportunities/[id]` | 商机详情 | 返回链接保留日期参数 |
| `/ledger` | 风控台账 | 分页、多维筛选、URL 持久化、Excel 导出 |
| `/screen` | 公共大屏 | 仅 DIRECTOR，占位/待增强 |

### 6.2 管理页面

| 路径 | 角色 | 功能 |
|---|---|---|
| `/admin/org` | DIRECTOR | 经理开通/创建、主管开通、Tab 筛选、重置密码、停用启用 |
| `/admin/team` | MANAGER | 业务员花名册（纯数据账号）：查看作业账号/PID、停用/启用数据状态 |
| `/admin/import` | DIRECTOR | 人员名单 + 商户明细 Excel 上传 |

### 6.3 认证页面

| 路径 | 说明 |
|---|---|
| `/login` | Notion 风格登录（Leadspace.Alipay / 数据管理）；业务员账号会被拒绝 |
| `/onboarding` | 实名认证（经理填手机邮箱；主管完成认证。**业务员不使用此页**） |
| `/change-password` | 首登强制改密（可登录角色） |

### 6.4 主要 API

```
src/app/api/
├── auth/           check-account, change-password, session-expired
├── admin/users/    用户 CRUD、开通、重置密码
├── import/         excel, personnel
├── ledger/         台账分页 + export
├── stats/          指标 + charts
├── members/        人员列表 + export
├── teams/          团队明细 + export
└── onboarding/
```

---

## 7. URL 筛选参数（重要）

**原则**：筛选状态写入地址栏，刷新/分享/返回均保留。日期预设默认 `month`（本月），URL 中省略 `preset=month`。

共享日期工具：`src/lib/ledger-date.ts`

| preset | 含义 |
|---|---|
| `month` | 本月（默认） |
| `lastMonth` | 上月 |
| `30d` / `90d` | 近 30/90 天 |
| `all` | 全部时间 |
| `custom` | 自定义 dateFrom/dateTo |

### 7.1 数据总览 `/`

解析：`src/lib/dashboard-url.ts`

| 参数 | 说明 |
|---|---|
| `dateFrom` / `dateTo` | YYYY-MM-DD |
| `preset` | 日期预设 |
| `view` | `team` / `personal`（主管双区） |

### 7.2 商机分析 `/opportunities`

解析：`src/lib/opportunities-url.ts`（与 dashboard 同结构）

列表与详情 API 均传入 `dateFrom`/`dateTo` 过滤 `expandDate`。

### 7.3 风控台账 `/ledger`

解析：`src/lib/ledger-url.ts`

| 参数 | 说明 |
|---|---|
| `dateFrom` / `dateTo` / `preset` | 拓展日期 |
| `search` | 关键词 |
| `managerId` | 经理筛选（Director 可见下拉） |
| `salesUserId` | 业务员筛选（Manager 可见下拉） |
| `riskStatus` | 风控状态 |
| `photoStatus` | 照片状态 |
| `salesActivationStatus` | 动销进度 |
| `page` | 页码 |

台账 UX 要点：

- 搜索 debounce
- 快捷筛选 chips（`LEDGER_QUICK_FILTERS`）
- 三维度状态图例（`SalesStatusLegend` + `ledger-labels.ts`）
- 状态列带颜色 tone（`LEDGER_STATUS_TONE_CLASS`）
- 风控「不通过」时才显示不通过原因列

### 7.4 团队明细 `/teams`

解析：`src/lib/team-details-url.ts`

| 参数 | 说明 |
|---|---|
| `dateFrom` / `dateTo` / `preset` | 日期 |
| `search` | 搜索 |
| `sortBy` | 排序字段 |

另有 `sessionStorage` 回退（`TEAM_DETAILS_FILTERS_STORAGE_KEY`），解决返回时 `useSearchParams` 短暂为空。

---

## 8. 核心业务规则

定义分散在：

- `src/lib/business-rules.ts` — 动销/风控计算
- `src/lib/constants.ts` — 指标名称、阈值、配色
- `src/lib/ledger-labels.ts` — 台账展示文案

### 8.1 八个核心指标

见 `CORE_METRICS`：累计拓展、照片通过率、动销通过率、当前/预估风控达标率、审核中、审核中已动销、不通过等。

### 8.2 动销判定

```
照片审核通过 AND (
  15天碰笔 + 15天扫码 ≥ 2
  OR 30天交易笔数 ≥ 2
)
```

对应枚举 `SalesActivationStatus`：

- `NOT_ACTIVATED` — 照片未通过
- `IN_PROGRESS` — 照片已通过，笔数未达标
- `ACTIVATED` — 已动销

### 8.3 预估风控达标率

```
(风控通过数 + 审核中已动销数) / 总商户数 × 100%
```

达标率配色：≥70% 绿、60–70% 橙、<60% 红（`getRateColorLevel`）。

### 8.4 组织与去重

- **组织归属**：100% 以后台人员配置为准，P 站 Excel 仅提供姓名
- **去重主键**：作业编号 `jobNumber`（同一商家 PID 可有多条作业）
- **更新策略**：同 jobNumber upsert，**保留已有 `salesUserId` 归属**（不覆盖）

### 8.5 数据保留

`src/lib/merchant-retention.ts`：自动清理拓展日期早于 **含本月共 3 个月** 窗口之外的商户（导入时 `autoPrune` 默认开启）。

---

## 9. 数据模型要点

Schema：`prisma/schema.prisma`

| 模型 | 说明 |
|---|---|
| `OrgUnit` | 组织树：事业部 → 区域 → 团队 |
| `User` | 用户；`role` + `status` + `accountLifecycle` + `mustChangePassword` |
| `SalesPlatformIdentity` | 业务员 P 站身份（作业账号 + 个人 PID）；导入或回填写入，供花名册展示与匹配 |
| `MerchantRecord` | 商户明细（核心业务表） |
| `Opportunity` | 商机 |
| `ImportLog` | 导入批次日志 |
| `AnomalyRecord` | 异常数据（姓名不匹配等） |
| `SystemConfig` | 全局配置（数据模式、API 同步 cron 等，后续用） |

Prisma client 生成路径：`src/generated/prisma/`（import 时用 `@/generated/prisma/client`）。

---

## 10. 导入与导出

### 10.1 导入流程

1. **人员名单** — `personnel-importer.ts`：创建/更新经理、主管、业务员与团队结构（业务员导入后为纯数据账号，`IMPORTED`，无密码）
2. **商户明细** — `excel-importer.ts`：解析 P 站列名 → upsert by jobNumber → **按 P 站姓名匹配业务员**（`salesUserId`）

导入入口：

- 后台 `/admin/import`（推荐）
- CLI `npm run import:all`

导入结果字段：`createdRows` / `updatedRows` / `prunedRows` / `skippedRows` / `anomalyRows`

### 10.2 导出

| 模块 | 文件 |
|---|---|
| 风控台账 | `src/services/export/ledger-exporter.ts` |
| 人员明细 | `src/services/export/members-exporter.ts` |
| 团队明细 | `src/services/export/team-details-exporter.ts` |

---

## 11. 统计引擎

主入口：`src/services/stats/analytics.ts`

| 函数 | 用途 |
|---|---|
| `getDashboardBundle` | 首页指标 + 图表 |
| `getChartData` / `getChartDataByWhere` | 饼图、趋势、商机表 |
| `getOpportunityAnalysisList/Detail` | 商机页（支持 dateFrom/dateTo） |
| `getManagerTeamMonthlyRanking` | 经理团队排行 |
| `getSalesStaffMonthlyRankingForManager` | 经理下业务员排行（支持日期范围） |
| `buildLedgerWhere` / `getLedgerRecords` | 台账查询 |
| `getMemberStats` | 人员明细 |
| `getTeamDetails` | 团队明细页 |

计算辅助：`calculator.ts`、`alert-generator.ts`、`query.ts`

---

## 12. 关键文件索引

```
src/
├── app/
│   ├── (dashboard)/          # 所有业务页
│   ├── login/                # 登录（Notion 化）
│   ├── change-password/      # 强制改密
│   └── onboarding/           # 实名认证（经理/主管）
├── components/
│   ├── ui/notion.tsx         # ★ 全站 UI 基础
│   ├── layout/AppShell.tsx   # ★ 布局壳
│   ├── layout/Sidebar.tsx    # ★ 侧边栏
│   ├── dashboard/DashboardView.tsx
│   ├── ledger/LedgerView.tsx
│   ├── teams/TeamDetailsView.tsx
│   └── opportunities/OpportunitiesPageContent.tsx
├── lib/
│   ├── permissions.ts        # ★ 权限
│   ├── auth.config.ts        # ★ 中间件路由守卫
│   ├── ledger-date.ts        # ★ 日期工具
│   ├── dashboard-url.ts
│   ├── opportunities-url.ts
│   ├── ledger-url.ts
│   ├── team-details-url.ts
│   ├── business-rules.ts
│   └── ledger-labels.ts
└── services/
    ├── stats/analytics.ts    # ★ 统计主逻辑
    └── import/excel-importer.ts
```

---

## 13. 近期已完成（2026-06-14）

一次大提交 `4a7dfd3`，主要包括：

- [x] 全站 Notion 组件 + 侧边栏布局（Leadspace.Alipay 品牌）
- [x] 首页 URL 日期筛选，默认本月
- [x] 商机页 URL 日期筛选 + 详情页参数保留
- [x] 登录页 Notion 化
- [x] 风控台账 P0–P2（URL 筛选、debounce、颜色、快捷筛选、经理/业务员下拉、商机列、条件不通过原因）
- [x] 团队明细页 `TeamDetailsView` + 导出
- [x] 经理详情页统一日期范围（Option A）
- [x] 导入 upsert + 保留归属 + 自动清理 + 导入报告
- [x] 首登强制改密 `/change-password`
- [x] 业务员改为纯数据账号（方案 D）：隐藏开通入口、禁止登录/开通/手动创建

---

## 14. 让用户用起来（上线检查清单）

按优先级，只需保证**可登录角色**能顺畅使用；业务员无需任何登录操作。

1. **数据就绪** — 人员名单 + 商户明细 Excel 导入完成，归属匹配正常
2. **开通经理** — 管理员在 `/admin/org` 为各区域经理开通账号
3. **开通主管**（如有）— 经理登录后创建/开通团队主管
4. **经理试用** — 登录后确认数据总览、团队明细、风控台账、商机分析数据正确
5. **环境稳定** — 生产库连接稳定（开发环境 Prisma Dev 长跑易 OOM）

**不需要做的事**：给业务员开通账号、发密码、引导实名认证或 onboarding。

---

## 15. 生产部署规范

### 15.1 线上环境

| 项 | 值 |
|---|---|
| 访问地址 | https://ali.orblead.com |
| 服务器 | 腾讯云轻量，与 **hk.orblead** 共用（`43.136.25.181`） |
| SSH 别名 | `sales-cloud`（`~/.ssh/config`） |
| 项目目录 | `/opt/leadspace-alipay` |
| 应用容器 | `leadspace-alipay-app` → `127.0.0.1:3001` |
| 数据库 | Docker `leadspace-postgres`（仅内网，不与 hk 混库） |
| Nginx 配置 | `/etc/nginx/conf.d/ali-orblead.conf` |
| hk 影响 | hk 走独立容器 `3080`，Leadspace 部署**通常不影响** hk |

### 15.2 与 hk.orblead 部署方式的差异

| | hk.orblead | Leadspace.Alipay |
|---|---|---|
| 习惯流程 | 本地 build → 打 `tgz` → 上传服务器 → 重启 | `rsync` 源码 → 服务器内 `docker compose build` |
| 项目路径 | `/opt/sales-data-agent` | `/opt/leadspace-alipay` |
| 触发 | 手动 / 固定发布脚本 | **须先本地验证 + 负责人确认后再部署** |

两种方式都能用；Leadspace 默认用仓库内 `deploy/` 脚本，但**不自动上线**。

### 15.3 默认发布流程（必须遵守）

**有用户在使用时，禁止跳过本地验证直接部署。**

```
1. 本地改代码
2. npm run build                    # 类型与构建必须通过
3. npm run dev                      # 浏览器点验关键路径（登录、改密、台账等）
4. 负责人确认「可以部署」
5. 同步代码并重建应用容器
6. 线上抽查 https://ali.orblead.com
7. 回报「已上线，请刷新验证」
```

**仅当负责人明确说「直接上线」**（紧急修线上 bug）时，可跳过第 3～4 步，但仍须 `npm run build` 通过。

**与 AI / Cursor 协作时**：默认只改代码、本地验证；**不得**在未经确认的情况下 SSH 部署生产环境。

### 15.4 部署对用户的影响

| 操作 | 影响 |
|---|---|
| `docker compose up -d --build app` | 应用重启约 **10～30 秒**，期间可能无法登录 |
| 构建失败 | 服务可能起不来，需回滚或修复后重部署 |
| 数据库 schema 变更 | 风险更高，须提前备份并单独评估 |
| hk.orblead | 独立服务，一般不受影响 |

经理已开始日常使用后，避免在工作时段频繁部署；可攒一批改动一次发。

### 15.5 部署命令参考

```bash
# 本地：构建验证（部署前必做）
npm run build

# 方式 A：一键（须已确认可部署）
./deploy/push-and-deploy.sh

# 方式 B：分步
rsync -avz --delete \
  --exclude node_modules --exclude .next --exclude .git --exclude '.env' --exclude 'src/generated' \
  ./ sales-cloud:/opt/leadspace-alipay/

ssh sales-cloud 'cd /opt/leadspace-alipay && ./deploy/server-deploy.sh'

# 仅重建应用（不改数据库）
ssh sales-cloud 'cd /opt/leadspace-alipay && sudo docker compose -f docker-compose.prod.yml up -d --build app'

# 首次 SSL（DNS 生效后）
ssh sales-cloud 'cd /opt/leadspace-alipay && ./deploy/setup-ssl.sh'
```

相关文件：

```
deploy/
├── push-and-deploy.sh      # 本机 rsync + 远程 server-deploy
├── server-deploy.sh        # 服务器：build、up、db push、seed
├── setup-ssl.sh            # Let's Encrypt + Nginx HTTPS
├── env.production.example
└── nginx/ali.orblead.com.conf
docker-compose.prod.yml
Dockerfile
```

### 15.6 部署后检查

- [ ] https://ali.orblead.com/login 可打开
- [ ] Antonio / 经理账号可登录
- [ ] 数据总览、台账有数据（已导入前提下）
- [ ] `sudo docker ps` 中 `leadspace-alipay-app`、`leadspace-postgres` 为 Up
- [ ] hk.orblead.com 仍正常

---

## 16. 后续待办

### 产品路线图（README 规划）

| 阶段 | 内容 |
|---|---|
| P3 | P 站 API 拉取、定时任务、异常数据管理 |
| P4 | 公共大屏增强（自动刷新、投屏） |
| P5 | 后台管理（模式切换、日志中心、历史回溯） |

### 可选优化（非紧急）

- onboarding / change-password 页面 Notion 化
- Director 首页经理团队排行（`shouldShowManagerRanking` 相关代码已存在）
- `/screen` 公共大屏实现或隐藏占位
- 浏览器 tab / metadata 标题统一为 Leadspace.Alipay

---

## 17. 开发约定

1. **改 UI 优先复用** `notion.tsx`，不要各页单独写样式
2. **新筛选页** 参照 `dashboard-url.ts` 模式：parse → build → queryString，URL 为唯一状态源
3. **统计查询** 必须走 `manager-scope` + `buildLedgerWhere`，不要绕过权限
4. **Prisma schema 变更** 后跑 `npm run db:generate && npm run db:push`
5. **提交前** 跑 `npm run build` 验证类型
6. **不主动 git commit/push**，除非用户明确要求
7. **不主动部署生产**，除非本地已验证且负责人确认（见 §15.3）；紧急线上修复除外

---

## 18. 快速定位问题

| 问题类型 | 先看 |
|---|---|
| 登录/Session | `auth.config.ts`, `check-account/route.ts` |
| 权限/越权 | `permissions.ts`, `manager-scope.ts` |
| 指标不对 | `business-rules.ts`, `analytics.ts` |
| 导入失败 | `excel-parser.ts`, `excel-importer.ts`, `user-matcher.ts` |
| 台账筛选 | `ledger-url.ts`, `LedgerView.tsx`, `buildLedgerWhere` |
| 日期默认值 | `ledger-date.ts` → `getCurrentMonthRange()` |
| UI 不一致 | `notion.tsx`, 对照 `/` 或 `/ledger` 页面 |

---

*如有架构级变更，请同步更新本文档与 README.md。*
