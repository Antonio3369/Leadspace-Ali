# Leadspace.Alipay 项目参考手册

> 支付宝 P 站推广业务数据统计、展示与管理系统。  
> 本文档供下次开发前快速查阅；入门步骤见 [README.md](./README.md)。

**最后更新**：2026-07-22（移动端：回顶按钮、viewport 适配；§13 已部署）

---

## 1. 项目是什么

| 项 | 说明 |
|---|---|
| 产品名 | **Leadspace.Alipay**（副标题：数据工作台 / 数据管理） |
| 定位 | 支付宝业务数据工作台；**顶层按业务线分区**，当前含「小蓝环」与「支付宝 N7」 |
| 业务 | 小蓝环：推广商户拓展数据导入、指标统计、风控台账、商机分析、团队/人员管理；N7：机具考核今日待办 / 达标跟进 / 数据看板（Excel 导入） |
| 用户 | 事业部负责人、区域经理、团队主管、一线业务员（业务员为数据账号，不可登录） |
| 数据来源 | **现行：Excel 人工上传**（小蓝环人员名单 + 商户明细；N7 考核表）。P 站 API 自动拉取为后续阶段，**尚未上线** |

**约定**：「业务线」是最上层；「商机」只属于某一业务线内部（目前仅小蓝环），不要把 N7 做成小蓝环下的一个商机。

### 1.1 已确认约定（勿再误判）

| 约定 | 说明 |
|---|---|
| 小蓝环商户明细靠运营上传 | 管理员在 `/xlh/admin/import` →「商户明细」上传 `.xlsx`。这是**当前唯一正规入口**（另有 CLI `npm run import:all` 供开发/运维） |
| 不要收掉商户上传 UI | `SystemConfig.dataMode = API_SYNC` 仅为预留字段；**在 P 站 API 同步真正交付前，禁止据此关闭或隐藏 Excel 上传** |
| 账号一套、密码一套 | 全站共用 `User`；开通一次即可进小蓝环与 N7；改密两边同时生效 |
| 首登改密只改一次 | 开通时 `mustChangePassword=true` → 登录后进 `/settings/password` 设新密码 → 静默重登刷新 JWT → 进业务选择页。**不得**再踢回改密页或要求改第二次 |
| N7 处理状态 | 与考核「待跟进」**相互独立**。详情：联系旁点选即保存；备注选填另存。列表（今日待办/达标跟进/队员明细）可一键「标已处理」。现阶段经理/管理员代记 |
| N7 首页=今日待办 | `/n7` 主列表按紧急度（今日必跟 / 其余待跟进）；未处理仅数字卡跳转筛选；排行复盘在 `/n7/board`；完整名单在 `/n7/follow-up` |
| 滚动与返回 | 主滚动在 `#app-scroll`（非 window）；列表进详情再返回应恢复位置；侧栏切换业务页须滚到顶部 |

### 1.2 本阶段停在哪里

生产 https://ali.orblead.com 已含 N7 今日待办等 2026-07-20 能力（见 §13 / §6.2b）。后续优先业务员端处理状态、结构化跟进与体验打磨。

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
| `admin` | `123456` | DIRECTOR（事业部负责人） | 全权限，已激活 |

Excel 导入后分三类处理：

- **经理**（可登录）：默认 `IMPORTED`（无密码），须管理员在 **组织管理** 开通
- **主管**（可登录）：Excel 导入后须开通；或由经理创建账号并设密码（`PENDING_ONBOARDING` → onboarding）
- **业务员**（纯数据账号）：人员名单 Excel 导入即可，**无需、也无法开通登录**

### 3.4 常用命令

```bash
npm run dev              # 开发服务器
npm run build            # 生产构建（改代码后建议跑一遍）
npm run db:push          # 同步 schema
npm run db:seed          # admin + 人员名单
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
├── AppShell.tsx      # 业务选择页轻量顶栏 / 业务内：侧边栏 + 主内容区
├── BackToTop.tsx     # 手机端浮动「返回顶部」（监听 #app-scroll）
├── Sidebar.tsx       # 左侧导航（含「切换业务」）
└── SignOutButton.tsx
src/components/business/
└── BusinessHub.tsx   # 登录后业务选择页（小蓝环 / N7）
src/lib/business-lines.ts  # 业务线常量与路径工具
```

- `/`：业务选择页，**无侧栏**
- `/xlh/*`、`/n7/*`：业务内完整侧栏；顶部显示当前业务名 + **← 切换业务**
- **手机端**：根布局 `export const viewport`（`device-width` + `viewport-fit=cover`）；全局 `BackToTop` 下滑约 280px 后出现；宽表仍容器内横滑，页面不整体撑宽

**小蓝环 Sidebar 导航项**（按顺序）：

1. 数据总览 `/xlh`
2. 团队明细 `/xlh/teams`
3. 商机分析 `/xlh/opportunities`
4. 风控台账 `/xlh/ledger`
5. 组织管理 `/xlh/admin/org` 或 团队管理 `/xlh/admin/team`（按角色）
6. 数据上传 `/xlh/admin/import`（仅 DIRECTOR）
7. 公共大屏 `/xlh/screen`（仅 DIRECTOR）
8. 修改密码 `/settings/password`（全局）

品牌区显示 **Leadspace.Alipay** + 当前业务名；经理角色侧边栏显示「经理」而非「区域经理」。

### 4.3 尚未 Notion 化的页面

- `/onboarding` — 实名认证（经理/主管；业务员不使用）
- `/change-password` — 强制改密（功能已有，样式较简）

### 4.4 业务线分区（2026-07-16）

方案：**登录后先选业务，再进各自空间**（方案 2）。

| 路径 | 含义 |
|---|---|
| `/` | 业务选择页（小蓝环 / 支付宝 N7 两张卡片） |
| `/xlh/*` | 小蓝环：现有看板能力（总览、团队、商机、台账、管理） |
| `/n7/*` | 支付宝 N7：今日待办、达标跟进、数据看板、设备详情、导入（见 §6.2b） |
| `/login` `/onboarding` `/change-password` `/settings/password` | 全局，不挂业务前缀 |

旧书签兼容（`next.config.ts` redirects）：`/ledger`、`/teams`、`/opportunities`、`/members`、`/admin/*`、`/screen` → 对应 `/xlh/...`。

权限：可登录角色按 `User.businessLines` 进入对应业务线；N7 与小蓝环共用同一套账号。

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

- 首登须改密：`mustChangePassword=true` → 中间件强制跳转 `/settings/password`（`/change-password` 仅重定向到此页）
- 改密成功后：前端用新密码静默 `signIn` 刷新 JWT，再进 `/`；**不要**再走「退出 → 手动登录 → 又挡回改密」的双次改密路径
- 改密页挂在 `(account)` 布局（`getSessionUser`），**不**跑 `ensureLiveSession`，避免改密瞬间会话漂移被误踢
- `ensureLiveSession`：仅在管理员重置导致 `mustChangePassword` 从 `false→true`、或被重新置为待认证时强制重登；用户刚改完密（`true→false`）不得踢出
- 停用账号：`status=DISABLED` → 踢回登录页
- 管理员代操作（重置密码、停用等）后，目标用户下次访问可能需重新登录以刷新 JWT
- 中间件用 JWT 校验角色/改密/业务线；Node 侧 JWT callback 会从 DB 同步 `mustChangePassword` 等字段

### 5.3 数据可见性

统计与查询统一走 `src/services/stats/manager-scope.ts` + `buildLedgerWhere()`，按角色计算 `accessibleUserIds` / `accessibleTeamIds`，防止 URL 参数越权（`assertUserAccess` / `assertTeamAccess`）。

---

## 6. 页面与路由地图

### 6.1 业务选择与分区

| 路径 | 页面 | 要点 |
|---|---|---|
| `/` | 业务选择页 | `BusinessHub`：小蓝环 / 支付宝 N7 |
| `/xlh` | 小蓝环 · 数据总览 | URL 日期筛选，默认本月；主管双区 |
| `/n7` | 支付宝 N7 · 今日待办 | 运营队列首页；复盘看板在 `/n7/board` |

### 6.2 小蓝环业务页面（需登录，`src/app/(dashboard)/xlh/`）

| 路径 | 页面 | 要点 |
|---|---|---|
| `/xlh/teams` | 团队明细 | 按人员/团队列表，可进经理详情 |
| `/xlh/teams?…` | 团队详情展开 | `TeamDetailsView`，URL 日期+搜索+排序 |
| `/xlh/members` | 人员明细 | 列表 + 导出（会重定向到团队相关流） |
| `/xlh/members/[id]` | 经理/主管详情 | **统一日期范围**：指标、图表、排行同一 `dateFrom/dateTo` |
| `/xlh/opportunities` | 商机分析 | URL 日期筛选，默认本月；列表按拓展日期过滤 |
| `/xlh/opportunities/[id]` | 商机详情 | 返回链接保留日期参数 |
| `/xlh/ledger` | 风控台账 | 分页、多维筛选、URL 持久化、Excel 导出；支持指标/饼图钻取 |
| `/xlh/screen` | 公共大屏 | 仅 DIRECTOR，占位/待增强 |

### 6.3 管理页面（小蓝环）

| 路径 | 角色 | 功能 |
|---|---|---|
| `/xlh/admin/org` | DIRECTOR | 经理开通/创建、主管开通、Tab 筛选、重置密码、停用启用 |
| `/xlh/admin/team` | MANAGER | 业务员花名册（纯数据账号）：查看作业账号/PID、停用/启用数据状态 |
| `/xlh/admin/import` | DIRECTOR | **现行数据入口**：人员名单 + 商户明细 Excel 上传（两 Tab 均需保留） |

### 6.2b 支付宝 N7 页面（需登录，`src/app/(dashboard)/n7/`）

侧栏：今日待办 · 达标跟进 · 数据看板/团队看板 · 每日绩效 ·（管理员）数据导入。

| 路径 | 要点 |
|---|---|
| `/n7` | **今日待办**（首页）：四卡（今日必跟 / 未处理 / 其余待跟进 / 区间已达标）；主列表仅两段（今日必跟、其余待跟进，各预览 10 条）；未处理卡 → 达标跟进筛未处理；已达标卡 → `/n7/board` |
| `/n7/follow-up` | **达标跟进**：考核「待跟进」完整列表；处理状态筛选；行内「标已处理」 |
| `/n7/board` | **数据看板 / 团队看板**：经理排行或本队队员排行（复盘，非日常作业首页） |
| `/n7/managers/[managerKey]` | 经理下队员排行 |
| `/n7/managers/.../staff/[staffKey]` | 队员设备明细；行内「标已处理」 |
| `/n7/devices/[sn]` | 设备详情：进度 → **联系 + 处理状态**同卡；点选已处理/未处理即保存；备注选填另存 |
| `/n7/daily` | 每日绩效 |
| `/n7/admin/import` | DIRECTOR：N7 考核表 Excel 导入 |

**两套「跟进」勿混用**：

| 名称 | 含义 |
|---|---|
| 待跟进（考核） | 未达标、仍在考核期内的设备，由 Excel 指标自动算紧急度 |
| 处理状态 | 人是否已联系/处理过（`followUpDone` / `followUpNote`）；Excel 重导**不覆盖** |

**考核紧急度（内部仍用 P0–P3；界面/导出用人话）**（`n7-rules.ts` / `n7PriorityLabel`）：

| 内部 | 界面文案 | 规则摘要 |
|---|---|---|
| P0 | 剩余≤2天 | 考核还剩 0/1/2 天 → 今日必跟 |
| P1 | 无动销 | 天数与用户均为 0，且剩余 ≥6 天 |
| P2 | 行为未齐 | 未点亮 / 未订阅 / 未打卡 |
| P3 | 一般预警 | 其它待跟进 |

列表列名约定：已用天数、已有用户、缺口；列表不展示 SN（详情页可见）。示意稿：`docs/n7-today-mock.html`（仅视觉参考）。

### 6.4 认证页面

| 路径 | 说明 |
|---|---|
| `/login` | Notion 风格登录（Leadspace.Alipay / 数据管理）；业务员账号会被拒绝；登录成功默认进 `/` 业务选择 |
| `/onboarding` | 实名认证（主管等 `PENDING_ONBOARDING`；经理开通后多为 `ACTIVE` 可跳过。**业务员不使用此页**） |
| `/settings/password` | 改密（含首登强制）；路由组 `(account)`，见 §5.2 |
| `/change-password` | 兼容旧链，重定向到 `/settings/password` |

### 6.5 主要 API

```
src/app/api/
├── auth/           check-account, change-password, session-expired
├── admin/users/    用户 CRUD、开通、重置密码、business-lines
├── import/         excel, personnel, n7
├── ledger/         台账分页 + export
├── stats/          指标 + charts
├── members/        人员列表 + export
├── teams/          团队明细 + export
├── n7/             today, managers, follow-up(+export), devices/[sn]（GET+PATCH）, daily
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

### 7.1 小蓝环数据总览 `/xlh`

解析：`src/lib/dashboard-url.ts`

| 参数 | 说明 |
|---|---|
| `dateFrom` / `dateTo` | YYYY-MM-DD |
| `preset` | 日期预设 |
| `view` | `team` / `personal`（主管双区） |

### 7.2 商机分析 `/xlh/opportunities`

解析：`src/lib/opportunities-url.ts`（与 dashboard 同结构）

列表与详情 API 均传入 `dateFrom`/`dateTo` 过滤 `expandDate`。

### 7.3 风控台账 `/xlh/ledger`

解析：`src/lib/ledger-url.ts`（含指标钻取 `buildMetricLedgerHref`）

| 参数 | 说明 |
|---|---|
| `dateFrom` / `dateTo` / `preset` | 拓展日期 |
| `search` | 关键词 |
| `managerId` | 经理筛选（Director 可见下拉） |
| `salesUserId` | 业务员筛选（Manager 可见下拉） |
| `opportunityId` | 商机范围（从商机详情钻取时） |
| `riskStatus` | 风控状态（可多值逗号/重复 key） |
| `photoStatus` | 照片状态 |
| `salesActivationStatus` | 动销进度（可多值，如 P2：`IN_PROGRESS,NOT_ACTIVATED`） |
| `page` | 页码 |

台账 UX 要点：

- 搜索 debounce
- 快捷筛选 chips（`LEDGER_QUICK_FILTERS`：审核中已动销、审核中未动销、待动销达标、风控不通过、风控审核中）
- 三维度状态图例（`SalesStatusLegend` + `ledger-labels.ts`）
- 状态列带颜色 tone（`LEDGER_STATUS_TONE_CLASS`）
- 风控「不通过」时才显示不通过原因列

### 7.4 团队明细 `/xlh/teams`

解析：`src/lib/team-details-url.ts`

| 参数 | 说明 |
|---|---|
| `dateFrom` / `dateTo` / `preset` | 日期 |
| `search` | 搜索 |
| `sortBy` | 排序字段 |

另有 `sessionStorage` 回退（`TEAM_DETAILS_FILTERS_STORAGE_KEY`），解决返回时 `useSearchParams` 短暂为空。

---

## 7.5 小蓝环看板怎么看 + 指标钻取（给经理）

首页（`/xlh`）看「这段时间拓展商户质量」，重点两件事：**动销过了没有**、**风控过了没有**。

| 指标 | 白话 |
|---|---|
| 累计拓展商户 | 这段时间一共拓展了多少户 |
| 照片审核通过率 | 进件照片质量（一般很高） |
| 整体动销通过率 | 真正「跑起来」的占比 |
| 当前风控达标率 | 已明确风控通过的占比 |
| 风控审核中 | 还在排队等风控结果 |
| 审核中已动销（可转化） | 生意已起来，就差风控出结果——最值得催 |
| 风控不通过 | 已被驳回 |
| 预估风控达标率 | 若「审核中已动销」也过了，达标率大概能到多少 |

左饼图：风控通过 / 审核中 / 不通过。右饼图：动销未达标原因（多数为碰笔/扫码/交易不够）。

**跟进优先级（P0→P2）与点击钻取：**

| 优先级 | 人群 | 怎么点开明细 | 台账自动筛选 |
|---|---|---|---|
| P0 | 审核中已动销 | 点指标卡「审核中已动销（可转化）」 | `riskStatus=PENDING` + `salesActivationStatus=ACTIVATED` |
| P1 | 待动销达标（碰笔/扫码/交易未达标） | 点「整体动销通过率」，或右饼「碰笔/扫码/交易未达标」 | `photoStatus=APPROVED` + `salesActivationStatus=IN_PROGRESS` |
| P2 | 审核中未动销 | 点指标下「审核中未动销 N」，或左饼底部链接 | `riskStatus=PENDING` + 动销为未动销/待达标（排除已动销） |

先选好日期再点数字，台账会带同一段日期。落地后快捷筛会高亮。

实现：`src/lib/ledger-url.ts`（`METRIC_LEDGER_DRILLDOWNS`）、`PieChartCard` 扇区/图例可点、`MetricsGrid` / `DashboardView`。

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
| `User` | 用户；`role` + `status` + `accountLifecycle` + `mustChangePassword` + `businessLines`（`xlh` / `n7`） |
| `SalesPlatformIdentity` | 业务员 P 站身份（作业账号 + 个人 PID）；导入或回填写入，供花名册展示与匹配 |
| `MerchantRecord` | 商户明细（核心业务表；现行靠 Excel 导入写入） |
| `N7DeviceRecord` | N7 设备考核；含 `followUpDone` / `followUpNote` / `followUpAt` / `followUpById`（处理状态，Excel 重导不覆盖） |
| `Opportunity` | 商机 |
| `ImportLog` | 导入批次日志 |
| `AnomalyRecord` | 异常数据（姓名不匹配等） |
| `SystemConfig` | 全局配置；`dataMode`（`MANUAL_UPLOAD` / `API_SYNC`）为**预留**，API 同步未上线前默认/实际均按人工上传处理 |

Prisma client 生成路径：`src/generated/prisma/`（import 时用 `@/generated/prisma/client`）。

---

## 10. 导入与导出

### 10.1 小蓝环导入流程（现行，已确认）

运营日常路径（管理员 DIRECTOR）：

1. 登录 → 业务选择 → 小蓝环 → 侧栏「数据上传」`/xlh/admin/import`
2. **先**导入「人员名单」— `personnel-importer.ts`：创建/更新经理、主管、业务员与团队（业务员为纯数据账号，`IMPORTED`，无密码）
3. **再**导入「商户明细」— `excel-importer.ts`：解析 P 站列名 → upsert by `jobNumber` → **按 P 站姓名匹配业务员**（`salesUserId`）

| 入口 | 用途 |
|---|---|
| `/xlh/admin/import`（推荐） | 运营日常上传人员名单 + 商户明细 |
| CLI `npm run import:all` | 开发/运维批量导入，不替代后台上传 |

**禁止**：在 API 同步未交付前，以「已改 API 模式」为由去掉「商户明细」Tab，或让 `importExcelFile` 因 `dataMode === API_SYNC` 直接拒绝上传。

导入结果字段：`createdRows` / `updatedRows` / `prunedRows` / `skippedRows` / `anomalyRows`

N7 考核表走独立入口 `/n7/admin/import`（`n7-excel-importer.ts`），与小蓝环商户明细不是同一套表。

### 10.2 导出

| 模块 | 文件 |
|---|---|
| 风控台账 | `src/services/export/ledger-exporter.ts` |
| 人员明细 | `src/services/export/members-exporter.ts` |
| 团队明细 | `src/services/export/team-details-exporter.ts` |
| N7 待跟进 | `src/services/export/n7-follow-up-exporter.ts`（含处理状态与备注） |

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
│   ├── (dashboard)/
│   │   ├── page.tsx              # 业务选择页 /
│   │   ├── xlh/                  # 小蓝环业务空间
│   │   ├── n7/                   # 今日待办 / board / follow-up / devices / daily / import
│   │   └── settings/password/
│   ├── login/
│   ├── change-password/
│   └── onboarding/
├── components/
│   ├── business/BusinessHub.tsx  # ★ 业务选择
│   ├── ui/notion.tsx             # ★ 全站 UI 基础
│   ├── layout/AppShell.tsx       # ★ 布局壳
│   ├── layout/Sidebar.tsx        # ★ 侧边栏 + 切换业务
│   ├── n7/                       # N7TodayView / Board / FollowUp / DeviceDetail / StatusCell …
│   ├── dashboard/DashboardView.tsx
│   ├── ledger/LedgerView.tsx
│   ├── teams/TeamDetailsView.tsx
│   └── opportunities/OpportunitiesPageContent.tsx
├── lib/
│   ├── business-lines.ts         # ★ 业务线常量与路径
│   ├── n7-rules.ts               # ★ N7 考核优先级与人话标签
│   ├── n7-follow-up-client.ts    # 处理状态 PATCH 客户端
│   ├── permissions.ts
│   ├── auth.config.ts
│   ├── ledger-date.ts
│   ├── dashboard-url.ts
│   ├── opportunities-url.ts
│   ├── ledger-url.ts             # ★ 含指标钻取 href
│   ├── team-details-url.ts
│   ├── business-rules.ts
│   └── ledger-labels.ts
└── services/
    ├── n7/analytics.ts           # ★ N7 今日队列 / 看板 / 跟进
    ├── stats/analytics.ts
    └── import/excel-importer.ts
```

---

## 13. 近期已完成

### 2026-07-22（已部署生产）

- [x] 手机端 **返回顶部**：`BackToTop.tsx`，全局挂载；监听 `#app-scroll`，下滑后右下角浮动按钮平滑回顶（含 safe-area）
- [x] 手机端 **首屏适配**：根布局显式 `viewport`（`device-width`、`initialScale=1`、`viewport-fit=cover`）；`globals.css` 防横向溢出与 iOS 字体缩放
- [x] 登录 / 首登 / 账号页 / AppShell 内容区补 `min-w-0`、`overflow-x-hidden`，避免打开时像桌面宽度缩进手机

### 2026-07-21（已部署生产）

- [x] 主机 2G Swap（防整机假死缓冲）
- [x] 生产 compose：app/postgres 内存上限 + NODE_OPTIONS
- [x] 导入互斥锁；人员/N7/小蓝环导入改为后台任务 + 前端轮询
- [x] 文档 §15.6 稳定性与升配建议

### 2026-07-20（已部署生产）

- [x] N7 首页改为 **今日待办**（`N7TodayView` + `/api/n7/today`）；侧栏：今日待办 · 达标跟进 · 数据看板/团队看板 · …
- [x] 原排行看板迁至 `/n7/board`
- [x] 今日待办：主列表仅「今日必跟 / 其余待跟进」（预览 10 条 + 显示全部）；未处理/已达标为数字卡入口，不铺第三张表
- [x] 考核优先级界面用人话（剩余≤2天 / 无动销 / 行为未齐 / 一般预警）；URL/API 仍用 P0–P3；导出同步人话
- [x] 处理状态 P0 体验：详情「联系 + 处理」同卡、点选即保存；列表行内「标已处理」（`N7FollowUpStatusCell`）；PATCH 省略备注时不覆盖原备注

### 2026-07-18（已部署生产）

- [x] **确认**小蓝环商户明细现行入口为 Excel 上传（§1.1 / §10.1）；禁止在 API 同步未上线前收掉上传 Tab；`importExcelFile` 不再因 `API_SYNC` 硬拒
- [x] 首登改密只改一次：`(account)/settings/password`、成功后静默重登、`ensureLiveSession` 不误踢 `mustChangePassword true→false`
- [x] 列表滚动记忆 / 返回定位（`#app-scroll` + `mainScroll.ts` + `HistoryBackLink`）；侧栏点击滚回顶部
- [x] 组织管理等宽表移动端可横滑
- [x] N7 列表列：已用天数 / 已有用户 / 缺口；去掉列表 SN 列
- [x] N7 **处理状态**（已处理/未处理 + 备注）：详情可代记；待跟进列表与队员明细可见可筛；导出带状态；与考核「待跟进」独立
- [x] 文档同步 §1.1 / §6.2b；生产 `ali.orblead.com` 已含上述能力

### 2026-07-16

- [x] 业务选择页 `/`（小蓝环 / 支付宝 N7）
- [x] 小蓝环整站迁入 `/xlh/*`；N7 `/n7` 占位
- [x] 侧栏「切换业务」；旧路径 redirects 到 `/xlh/...`
- [x] 指标/饼图钻取台账（P0 审核中已动销、P1 待动销达标、P2 审核中未动销）
- [x] 台账快捷筛：审核中已动销 / 审核中未动销 / 待动销达标 等

### 2026-06-14

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

1. **数据就绪** — 管理员在 `/xlh/admin/import` 上传人员名单 + 商户明细 Excel，归属匹配正常
2. **开通经理** — 管理员在 `/xlh/admin/org` 为各区域经理开通账号（告知登录名与初始密码）
3. **经理首登** — 登录 → `/settings/password` 改一次密 → 自动进入业务选择（不应再被要求改密）
4. **开通主管**（如有）— 经理登录后创建/开通团队主管
5. **经理试用（小蓝环）** — 业务选择 → 进小蓝环，确认总览、团队明细、风控台账、商机分析与钻取
6. **经理试用（N7）** — 今日待办 → 列表「标已处理」或进详情点选 → 达标跟进核对；复盘看数据看板
7. **环境稳定** — 生产库连接稳定（开发环境 Prisma Dev 长跑易 OOM）

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

### 15.6 生产稳定性（防整机假死）

同机约 3.6G 内存，跑 ali / unicom / hk 等多服务。大表导入曾导致内存顶满、整机无响应。

| 措施 | 说明 |
|---|---|
| Swap 2G | 主机已挂载 `/swapfile`，开机自动启用 |
| 容器内存上限 | `docker-compose.prod.yml`：app 1G、postgres 768M；超限只重启该容器 |
| Node 堆上限 | `NODE_OPTIONS=--max-old-space-size=768` |
| 导入互斥 | 同时只允许一个重导入；看数/登录不限 |
| 后台导入 | 上传后返回 `jobId`，后台处理，前端轮询 `/api/import/jobs/[id]` |

**升配建议（F，需在腾讯云控制台操作）**

- 短期：轻量应用升到 **4 核 8G**（或至少 8G 内存），同机多站更稳  
- 更稳：ali 单独一台机，与 hk/unicom 拆开  
- 升配后可酌情放宽 compose 内存上限

相关文件：`deploy/nginx` 已配 `proxy_*_timeout 600s`、`client_max_body_size 100m`。

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
- [ ] admin / 经理账号可登录
- [ ] 数据总览、台账有数据（已导入前提下）
- [ ] `sudo docker ps` 中 `leadspace-alipay-app`、`leadspace-postgres` 为 Up
- [ ] hk.orblead.com 仍正常

---

## 16. 后续待办

### 产品路线图（README 规划）

| 阶段 | 内容 |
|---|---|
| N7 | 业务员端写入处理状态；结构化跟进（下次联系日/原因枚举）；空态与移动端细节打磨（回顶/viewport 已做） |
| P3 | **P 站 API 拉取**（真正上线后才可切换 `dataMode=API_SYNC` 并考虑关闭商户 Excel 上传） |
| P4 | 公共大屏增强（自动刷新、投屏） |
| P5 | 后台管理（模式切换、日志中心、历史回溯） |

### 可选优化（非紧急）

- 无业务线权限时中间件踢回 `/` 应带说明，避免「静默回首页」
- 单业务线经理登录后可跳过业务选择页直达
- 经理首登后空态补充「下一步」指引（谁导入数据、先看哪页）
- N7：列表展示处理备注摘要（现仅悬停 title）；按处理人筛选；详情改回「未处理」的二次确认（可选）
- Director 首页经理团队排行（`shouldShowManagerRanking` 相关代码已存在）
- `/xlh/screen` 公共大屏实现或隐藏占位
- 记住上次进入的业务线（cookie），登录后可直达

---

## 17. 开发约定

1. **改 UI 优先复用** `notion.tsx`，不要各页单独写样式
2. **新筛选页** 参照 `dashboard-url.ts` 模式：parse → build → queryString，URL 为唯一状态源
3. **统计查询** 必须走 `manager-scope` + `buildLedgerWhere`，不要绕过权限
4. **Prisma schema 变更** 后跑 `npm run db:generate && npm run db:push`
5. **提交前** 跑 `npm run build` 验证类型
6. **不主动 git commit/push**，除非用户明确要求
7. **不主动部署生产**，除非本地已验证且负责人确认（见 §15.3）；紧急线上修复除外
8. **小蓝环数据入口**：未交付 P 站 API 同步前，保留 `/xlh/admin/import` 的「人员名单」与「商户明细」两 Tab（见 §1.1）
9. **架构/产品约定变更** 时同步更新本文档与 README.md

---

## 18. 快速定位问题

| 问题类型 | 先看 |
|---|---|
| 登录/Session | `auth.ts`, `auth.config.ts`, `check-account/route.ts`, `session-expired` |
| 首登改密 | `ChangePasswordForm.tsx`, `(account)/settings/password`, `api/auth/change-password` |
| 滚动/返回 | `mainScroll.ts`, `ScrollMemory.tsx`, `HistoryBackLink.tsx`, `AppShell` `#app-scroll` |
| N7 今日待办 | `N7TodayView`, `api/n7/today`, `analytics.getN7TodayQueues`；看板 `/n7/board` |
| N7 优先级文案 | `n7-rules.n7PriorityLabel`, `N7PriorityBadge`, `n7-filter-styles` |
| N7 处理状态 | `N7DeviceDetailView`, `N7FollowUpStatusCell`, `n7-follow-up-client`, `api/n7/devices/[sn]` PATCH |
| 权限/越权 | `permissions.ts`, `manager-scope.ts`, `business-lines.ts`, `n7-scope.ts` |
| 指标不对 | `business-rules.ts`, `analytics.ts`（小蓝环）/ `services/n7/analytics.ts`（N7） |
| 导入失败 | `excel-parser.ts`, `excel-importer.ts`, `n7-excel-importer.ts`；入口 `/xlh/admin/import`、`/n7/admin/import` |
| 台账筛选 | `ledger-url.ts`, `LedgerView.tsx`, `buildLedgerWhere` |
| 日期默认值 | `ledger-date.ts` → `getCurrentMonthRange()` |
| UI 不一致 | `notion.tsx`, 对照 `/xlh` 或 `/xlh/ledger` 页面 |

---

*如有架构级变更，请同步更新本文档与 README.md。*
