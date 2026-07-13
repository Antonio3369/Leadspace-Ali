# Leadspace 支付宝业务数据管理

支付宝 P 站推广业务数据统计、展示与管理系统。

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

`db:seed` 会创建管理员 **Antonio** 并尝试从 `PERSONNEL_FILE` 导入人员名单 Excel（路径见 `.env` 或 `prisma/seed.ts` 默认值）。

### 5. 导入业务数据

**方式一：后台上传（推荐）** — 管理员登录后打开 `/admin/import`：

1. **人员名单** — 创建/更新经理、主管、业务员与团队；经理/主管导入后须开通方可登录，**业务员为纯数据账号，导入即可、不支持登录**  
2. **商户明细** — 导入推广商家数据（作业编号去重，按 P 站姓名匹配业务员归属）

**方式二：命令行**

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
| 管理员开通 | 经理 → `ACTIVE` | 在组织管理设置登录名与初始密码，可立即登录（首登须改密） |
| 经理创建/开通主管 | 主管 → `PENDING_ONBOARDING` | 设置密码后须完成实名认证 |
| 实名认证 | `ACTIVE` | 经理填手机邮箱；主管完成 onboarding 后正常使用 |

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
| `Antonio` | 管理员（事业部负责人） | 已激活，全量数据 + 组织管理 + 数据上传 |
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
| `/admin/org` | 管理员 | 经理开通/创建、主管开通、待认证/已停用 Tab、重置密码、停用启用 |
| `/admin/team` | 区域经理 | 业务员花名册：查看作业账号/PID、停用/启用数据状态（**不支持开通登录**） |
| `/admin/import` | 管理员 | 人员名单 + 商户明细 Excel 上传（经理无上传权限） |
| `/onboarding` | 经理/主管 | 首次登录实名认证（**业务员不使用**） |

管理员代操作（重置密码、停用/启用、完成认证）后，目标用户下次访问将自动退出并需重新登录。

## 已实现功能

### 数据与指标

- 四级角色 RBAC + 中间件权限拦截
- 8 项核心指标、预估风控达标率、动销判定、自动预警文案
- Excel 上传导入（P 站列名、去重、姓名匹配组织）
- 首页双饼图、商机统计表、每日拓展/动销趋势
- 风控台账（分页、多选筛选、**URL 筛选持久化**、Excel 导出）
- 人员明细、团队排行、商机专项、公共大屏（管理员）
- 人员/台账 Excel 导出

### 账号与安全

- 管理员操作范围校验（经理仅能管理所辖团队）
- Session 与数据库状态同步（停用/生命周期变更强制重新登录）
- 业务员为纯数据账号：禁止登录、禁止开通、禁止在后台手动创建

## 后续阶段

| 阶段 | 内容 |
|------|------|
| P3 | P 站 API 拉取、定时任务、异常数据管理 |
| P4 | 公共大屏增强（自动刷新、投屏优化） |
| P5 | 后台管理（模式切换、日志中心、历史回溯） |

## 项目结构

```
src/
├── app/
│   ├── (dashboard)/     # 需登录的业务页面
│   ├── api/             # API 路由
│   └── login/           # 登录页
├── components/          # UI 组件
├── lib/                 # 工具、权限、业务规则
└── services/
    ├── stats/           # 指标计算引擎
    └── import/          # Excel 导入
prisma/
├── schema.prisma        # 数据模型
└── seed.ts              # 种子数据（Antonio + 人员名单）
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
npm run db:seed                    # 填充 Antonio + 人员名单
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

示例：`/ledger?dateFrom=2026-06-01&dateTo=2026-06-30&riskStatus=PENDING&salesActivationStatus=ACTIVATED`
