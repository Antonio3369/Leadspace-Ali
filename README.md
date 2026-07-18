# Leadspace 支付宝业务数据管理

支付宝业务数据统计、展示与管理系统（Leadspace.Alipay）。

登录后先选择业务线：**小蓝环**（完整看板）或 **支付宝 N7**（考核看板 / 达标跟进 / 处理状态）。产品约定与路由详见 [Leadspace.Ali.md](./Leadspace.Ali.md)（**最后更新 2026-07-18，本阶段暂告一段落**）。

## 技术栈

- **Next.js 16** (App Router)
- **Prisma 7** + **PostgreSQL**
- **NextAuth.js** (Auth.js v5)
- **Tailwind CSS 4**
- **xlsx** (Excel 解析)

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动 PostgreSQL

```bash
docker compose up -d
# 或使用 prisma dev：npx prisma dev -d
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，设置 DATABASE_URL 与 AUTH_SECRET（可用 openssl rand -base64 32 生成）
```

### 4. 初始化数据库

```bash
npm run db:push
npm run db:seed
```

`db:seed` 会创建管理员 **admin** 并尝试从 `PERSONNEL_FILE` 导入人员名单 Excel（路径见 `.env` 或 `prisma/seed.ts` 默认值）。

### 5. 导入业务数据

> **已确认**：小蓝环现阶段以 Excel 人工上传为准（人员名单 + 商户明细）。P 站 API 自动拉取尚未上线，**不要关闭商户明细上传入口**。详见 [Leadspace.Ali.md](./Leadspace.Ali.md) §1.1、§10.1。

**方式一：后台上传（推荐，运营日常）** — 管理员登录后进入小蓝环，打开 `/xlh/admin/import`：

1. **人员名单** — 创建/更新经理、主管、业务员与团队；经理/主管导入后须开通方可登录，**业务员为纯数据账号，导入即可、不支持登录**  
2. **商户明细** — 导入推广商家数据（作业编号去重，按 P 站姓名匹配业务员归属）

**方式二：命令行**（开发/运维，不替代后台）

```bash
npm run import:all                 # 人员名单 + 多文件商户
npm run backfill:merchant-owners   # 按姓名回填商户归属业务员
```

### 6. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

## 账号与开通流程

**可登录角色**：事业部负责人、区域经理、团队主管。业务员（`SALES`）为**纯数据账号**，不参与登录。

### 可登录账号生命周期

| 阶段 | `accountLifecycle` | 说明 |
|------|-------------------|------|
| Excel 导入 | `IMPORTED` | 无密码，无法登录 |
| 管理员开通 | 经理 → `ACTIVE` | 设登录名与初始密码；**首登须在 `/settings/password` 改一次密**（成功后静默重登进入系统，不应再改第二次） |
| 经理创建/开通主管 | 主管 → `PENDING_ONBOARDING` | 设置密码后须完成实名认证 |
| 实名认证 | `ACTIVE` | 主管完成 onboarding；经理开通后多为直接 `ACTIVE` |

### 业务员（纯数据账号）

| 项 | 说明 |
|---|---|
| 创建方式 | 仅通过人员名单 Excel 导入 |
| 登录 | **不支持**（系统会拒绝业务员账号登录） |
| 开通 | **不支持**（团队管理无开通入口） |
| 用途 | 商户按姓名归属到业务员；经理在团队明细、台账、排行中查看其业绩 |
| 团队管理 | 经理可查看花名册、作业账号/PID，或对离职人员标记停用 |

更完整的角色说明与上线检查清单见 [Leadspace.Ali.md](./Leadspace.Ali.md)。

### 演示账号（开发环境）

密码均为 `123456`（**生产环境登录页不显示演示密码**）

| 账号 | 角色 | 说明 |
|------|------|------|
| `admin` | 管理员（事业部负责人） | 已激活，全量数据 + 组织管理 + 数据上传 |
| Excel 导入的经理 | 区域经理 | 默认「未开通」，须在 **组织管理** 开通后方可登录 |
| Excel 导入的主管 | 团队主管 | 须开通或由经理创建账号；开通后须完成实名认证 |
| Excel 导入的业务员 | 业务员 | **纯数据账号**，导入即可，无需开通、无法登录 |

经理开通脚本（与后台「开通账号」一致，开通后为 `ACTIVE`）：

```bash
npx tsx scripts/enable-manager.ts <登录名> [密码]
```

### 管理后台

| 路径 | 角色 | 功能 |
|------|------|------|
| `/` | 已登录 | 业务选择（小蓝环 / 支付宝 N7） |
| `/xlh/admin/org` | 管理员 | 经理开通/创建、主管开通、待认证/已停用 Tab、重置密码、停用启用 |
| `/xlh/admin/team` | 区域经理 | 业务员花名册：查看作业账号/PID、停用/启用数据状态（**不支持开通登录**） |
| `/xlh/admin/import` | 管理员 | **现行数据入口**：人员名单 + 商户明细 Excel（两 Tab 均保留；经理无上传权限） |
| `/settings/password` | 可登录角色 | 改密 / 首登强制改密 |
| `/onboarding` | 待认证角色 | 实名认证（**业务员不使用**） |

管理员重置他人密码后，对方下次访问可能需重新登录；本人首登改密成功后应直接进入系统（只改一次）。

## 已实现功能

### 业务线与入口

- 登录后业务选择页：小蓝环 `/xlh`、支付宝 N7 `/n7`
- 侧栏「切换业务」；旧路径 `/ledger` 等自动跳转 `/xlh/...`
- 列表滚动记忆与返回定位（`#app-scroll`）；侧栏切换滚到顶部

### 数据与指标（小蓝环）

- 四级角色 RBAC + 中间件权限拦截
- 8 项核心指标、预估风控达标率、动销判定、自动预警文案
- 指标卡 / 饼图点击钻取风控台账（审核中已动销、待动销达标、审核中未动销等）
- Excel 上传导入（P 站列名、去重、姓名匹配组织）——**现行主入口，勿关商户明细上传**
- 首页双饼图、商机统计表、每日拓展/动销趋势
- 风控台账（分页、多选筛选、**URL 筛选持久化**、Excel 导出）
- 人员明细、团队排行、商机专项、公共大屏（管理员）
- 人员/台账 Excel 导出

### 支付宝 N7

- 考核表 Excel 导入（`/n7/admin/import`）；看板 / 达标跟进 / 队员明细 / 设备详情
- **处理状态**（已处理/未处理 + 备注）：与考核「待跟进」独立；经理/管理员可在详情代记；列表可见可筛
- 列表列：已用天数、已有用户、缺口（列表不展示 SN）

### 账号与安全

- 管理员操作范围校验（经理仅能管理所辖团队）；业务线 `businessLines`
- Session 与数据库状态同步；首登改密只改一次后静默进入系统
- 业务员为纯数据账号：禁止登录、禁止开通、禁止在后台手动创建
- 小蓝环数据入口：`/xlh/admin/import` 人员名单 + 商户明细（现行，非 API）

## 后续阶段

| 阶段 | 内容 |
|------|------|
| N7 | 业务员端写入处理状态；看板/空态/移动端体验 |
| P3 | P 站 API 拉取（真正上线后才可考虑关闭小蓝环商户 Excel 上传） |
| P4 | 公共大屏增强（自动刷新、投屏优化） |
| P5 | 后台管理（模式切换、日志中心、历史回溯） |

## 项目结构

```
src/
├── app/
│   ├── (dashboard)/     # / 业务选择；/xlh 小蓝环；/n7 N7
│   ├── api/             # API 路由
│   └── login/           # 登录页
├── components/          # UI 组件（含 business/BusinessHub）
├── lib/                 # 工具、权限、业务规则、business-lines
└── services/
    ├── stats/           # 指标计算引擎
    └── import/          # Excel 导入
prisma/
├── schema.prisma        # 数据模型
└── seed.ts              # 种子数据（admin + 人员名单）
scripts/
├── import-all.ts        # 批量导入商户 Excel
├── enable-manager.ts    # 命令行开通经理
└── backfill-merchant-owners.ts
```

## 常用命令

```bash
npm run dev                        # 开发服务器
npm run build                      # 生产构建
npm run db:push                    # 同步数据库 schema
npm run db:migrate                 # 创建迁移
npm run db:seed                    # 填充 admin + 人员名单
npm run db:studio                  # Prisma Studio
npm run import:all                 # 批量导入商户 Excel
npm run backfill:merchant-owners   # 回填商户归属
```

## 核心业务规则

- **动销判定**：照片审核通过 +（15 天碰笔+扫码 ≥ 2 **或** 30 天交易 ≥ 2）
- **预估风控达标率**：`(风控通过数 + 审核中已动销数) / 总商户数 × 100%`
- **组织归属**：100% 以后台人员配置为准，P 站仅提供姓名
- **去重规则**：作业编号（同一商家 PID 可有多条作业记录）

## 风控台账 URL 筛选参数

筛选条件会写入地址栏，刷新或分享链接可保留状态：

| 参数 | 说明 |
|------|------|
| `dateFrom` / `dateTo` | 拓展日期范围（YYYY-MM-DD） |
| `preset` | 日期快捷选项：`lastMonth` / `30d` / `90d` / `all` / `custom` |
| `riskStatus` | 审核状态（可多选，重复参数） |
| `salesActivationStatus` | 动销进度：待照片通过 / 待动销达标 / 已动销（可多选） |
| `search` | 搜索关键词 |
| `page` | 页码 |

示例：`/xlh/ledger?dateFrom=2026-06-01&dateTo=2026-06-30&riskStatus=PENDING&salesActivationStatus=ACTIVATED`
