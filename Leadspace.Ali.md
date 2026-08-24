# Leadspace.Alipay 项目参考手册

> 支付宝 P 站推广业务数据统计、展示与管理系统。  
> 本文档供下次开发前快速查阅；入门步骤见 [README.md](./README.md)。

**最后更新**：2026-08-25（导入失败必提醒 + 移机到新店 + 考核将到期可看名单 · **已部署** `58dc634`）

---

## 1. 项目是什么

| 项 | 说明 |
|---|---|
| 产品名 | **Leadspace.Alipay**（副标题：数据工作台 / 数据管理） |
| 定位 | 支付宝业务数据工作台；**顶层按业务线分区**，当前含「小蓝环」「支付宝 N7」「微信小绿盒」 |
| 业务 | 小蓝环：推广商户拓展数据导入、指标统计、风控台账、商机分析、团队/人员管理；N7：机具考核今日待办 / 达标跟进 / 数据看板（Excel 导入）；**小绿盒**：收银商户沉睡预警、自然月考核达标、团队看板（Excel 导入） |
| 用户 | 事业部负责人、区域经理、团队主管、一线业务员（**N7 队员可登录**；小蓝环 / 小绿盒侧业务员仍主要作数据归属） |
| 数据来源 | **现行：Excel 人工上传**（小蓝环人员名单 + 商户明细；N7 考核表；**小绿盒运营原始表 + 人员归属表**）。P 站 API 自动拉取为后续阶段，**尚未上线** |

**约定**：「业务线」是最上层；「商机」只属于某一业务线内部（目前仅小蓝环），不要把 N7 / 小绿盒做成小蓝环下的一个商机。

### 1.1 已确认约定（勿再误判）

| 约定 | 说明 |
|---|---|
| 小蓝环商户明细靠运营上传 | 管理员在 `/xlh/admin/import` →「商户明细」上传 `.xlsx`。这是**当前唯一正规入口**（另有 CLI `npm run import:all` 供开发/运维） |
| 不要收掉商户上传 UI | `SystemConfig.dataMode = API_SYNC` 仅为预留字段；**在 P 站 API 同步真正交付前，禁止据此关闭或隐藏 Excel 上传** |
| 账号一套、密码一套 | **支付宝域**（小蓝环 + N7）共用 `User`；开通一次即可进小蓝环与 N7；改密两边同时生效。**微信小绿盒**使用独立 `XlvMemberAccount`，登录入口 `/login/xlv` |
| 平台入口分流 | 未登录 `/` 选 **支付宝业务** 或 **微信业务（小绿盒）**；支付宝登录后进 `/alipay` 再选小蓝环 / N7；微信登录后直达 `/xlv` |
| 小绿盒开号 | 组织名册 Excel 导入后**自动**开通 `XlvMemberAccount`（拼音用户名 + 初始 `123456` + 首登改密；已有密码不覆盖）；全局 `admin` 仍可从 `/login/xlv` 登录做导入/归属 |
| 首登改密只改一次 | 开通时 `mustChangePassword=true` → 登录后进 `/settings/password` 设新密码 → 静默重登刷新 JWT → 进业务选择页。**不得**再踢回改密页或要求改第二次 |
| N7 处理状态 / V1 关单 | 与考核「待跟进」**相互独立**。关单须选接通结果（已接通/未接通）、可叠加不愿配合/已答应使用达标、≥1 张现场图；列表「去关单」进详情。Excel 重导不覆盖 |
| N7 系统催办 | `/n7` 主列表 = P0（剩余≤2天）未处理，系统自动进入，**非经理点催办**；关单后离开催办池 |
| N7 关单回告经理 | 队员/代记关单成功后，所属经理收**提醒通知**（`N7Notification`）；入口：今日待办「队员已处理」、`/n7/notifications`、待办底栏角标；点开详情即已读 |
| N7 关单外推（MVP-A） | 关单站内通知成功后，旁路推**企微**群 Webhook（`N7_OUTBOUND_WEBHOOK_URL`）；文案含结果摘要 + `/n7/devices/{sn}`；**失败只打日志，不挡关单**。代码已在 main；**生产未配 Webhook / 未验收前勿当已上线** |
| N7 首页=今日待办 | `/n7` 只列系统催办（P0）；未处理/区间已达标/过期未达标为入口卡；完整名单在 `/n7/follow-up`，复盘在 `/n7/board` |
| 滚动与返回 | 主滚动在 `#app-scroll`（非 window）；列表进详情再返回应恢复位置；侧栏切换业务页须滚到顶部 |
| N7 经理/队员手机底栏 | 待办 · 跟进 · 看板 · 绩效 · 我的；设备详情藏底栏；队员数据仅本人 |
| N7 队员开号 | 经理 `/n7/me/team` 按姓名开号（拼音 + `123456` + 首登改密，仅 N7）；人员 Excel **导入即自动开通登录**；历史导入可 `npm run backfill:sales-login` 补开通 |
| N7 人员管理 | 在职：开通登录/重置密码、停用；**已停用**才可「彻底删除」（二次确认）；设备保留并解挂靠 |
| N7 本队同名双号 | 仅**同一经理 + 姓名完全一致**；一侧有数据、其余为 0 → 停用空号（不删除）；**双侧都有数据则跳过**；近音不同字不合并；打开人员管理或 `npm run dedupe:team-sales` |
| N7 设备挂靠 | 匹配键=**作业员姓名 + 所属经理**（对齐联通 §8.1）；导入用 `findN7SalesInIndexes`；部署引导会按姓名+经理重挂（`relinkN7SalesDevices`） |
| N7 开经理账号 | 管理员在 `/n7/admin/import` →「开经理账号」只填姓名开号（拼音 + `123456` + 首登改密，仅 N7） |
| N7 名单口径（勿混） | **今日待办 `/n7`、达标跟进 `/n7/follow-up`**：按**考核期**（`remainingEnded=false` 待跟进；过期 Tab 为考核已结束未达标），**不按注册月截断**；上月注册、考核未结束本月仍可见。**数据看板 `/n7/board`、队员排行/队员设备明细**：按**注册日期**区间统计拓展/达标（本月/上月切换上方日期） |
| N7 设备搜索 | 今日待办、达标跟进、队员明细支持搜**门店名 / SN / 手机**；URL 参数 `q`；有搜索词时**跨月全库**搜（不限注册月）；实现见 `src/lib/n7-search.ts` |
| 小绿盒双表导入 | 管理员 `/xlv/admin/import`：**先**运营原始表（多日快照 + 全量指标）→ **再**人员归属表（按 SN 补作业员/经理）；后台任务 + 轮询；导入完成展示**摘要**（列匹配、日期范围、重复合并、未匹配姓名） |
| 小绿盒口径 | **剩余库存** = 未挂经理设备；**已铺设** = 总数 − 库存；**正常活跃** = 总数 − 库存 − 沉睡 − 单笔沉默；达标率分母 = **已铺设**；默认列表排除库存 |
| 小绿盒沉睡 | `sleepDays ≥ 2` 为沉睡；`cumulativeTxns === 1` 且 `sleepDays ≥ 2` 为**单笔沉默**（更严重，单独标红） |
| 小绿盒考核 | 自然月增量：**+20 用户 + 300 笔**（两项须同时满足）；首笔交易月为装机月，最多考核两个自然月；**月成绩 = 该自然月内最后截面「累计用户/笔数」减月前基线**（对齐微信运营表累计列；交易趋势图仍按收款日展示逐日笔数）；装机月无截面时可回退设备累计；状态 `qualified` / `in_progress` / `invalid`（`xlv-rules.ts`） |
| 小绿盒团队合规率 | 目标 **≥90%**，分母为已铺设设备，按最新运营状态动态计算并按设备去重：**已达标**永久合规；**考核中且当前活跃**合规；跟进后产生新交易且**当前仍活跃**的设备计为已唤醒并合规。仅完成跟进不计合规；再次沉睡即退出合规 |
| 小绿盒经理自营 | 作业员与经理**同名**视为经理本人拓展；已挂 `managerUserId` 即视为作业员侧已挂靠，**不要求**单独 `salesUserId` |
| 小绿盒看板 | `/xlv/alerts` 六宫格；`/xlv/board` 经理排行；**`/xlv/admin/companies` 分公司排名看板**（Admin，按沉睡排序，末尾未归属/待定） |
| 小绿盒设备库存 | `/xlv/admin/inventory`（Admin）/ `/xlv/inventory`（经理）：**库存看板**（收到 / 已铺设 / 剩余 / 铺设率 + **合规率** 供补货决策）；入库 / 划拨 / 期初；**移机撤机明细暂隐藏**，撤机改由 **SN 归属换商户** 推断；与团队看板分离，见 §6.2d |
| 小绿盒今日待办 | `/xlv`（首页）：P0 **优先催办**、P1 **疑似沉睡**、P2 **考核将到期**（两月窗口剩≤15天仍未达标）。点「考核将到期」展开**这批设备完整名单**（不跳设备页「考核中」全量） |
| 小绿盒沉睡回访 | 对齐 N7 V1 跟进表单（界面称「跟进」）：接通/未接通、可叠加「不愿配合」「已答应继续使用」、**跟进图（至少一张）**；Excel 重导保留跟进内容，唯一例外是未达标设备在下一日运营快照仍沉睡时将 `followUpDone` 重开为待跟进；台账 `/xlv/follow-up`（无侧栏入口，从待办钻取）；标题下 **← 返回**；Tab 为待回访 / 已回访 / 全部；`priority=P0\|P1` 时 Tab 计数与列表同为该档口径 |
| 小绿盒关单回告经理 | 队员关单成功后，所属经理收**站内通知**；**抄送 admin**；入口 `/xlv/notifications`：经理看「队员已跟进」，队员看「经理反馈」；**不再推业务群**（仅站内） |
| 小绿盒撤机 | 移机明细 / 待确认流程 **已关闭**（`XLV_WITHDRAW_IMPORT_ENABLED=false`）；撤机由 **SN 归属换商户** 推断；**不再发撤机待确认通知/企微** |
| 小绿盒移机展示 | 同 SN 换商户后，设备列表/详情标 **移机到新店**，并显示原门店；依赖 SN 归属成功写入的换商流水 |
| 小绿盒数据上传企微 | 任意小绿盒导入 **SUCCESS/PARTIAL** → **运维小群**；**FAILED / 重启中断** 同样推运维小群（未成功必须重传，不能当已导入） |
| 小绿盒分公司汇总企微 | **SN 归属表**导入成功后 → **负责人群** `XLV_OUTBOUND_WEBHOOK_URL`；9 家分公司排名指标 + `/xlv/admin/companies`；不含未归属/待定 |
| 小绿盒运维企微 | 导入卡死 / 站点不可用 / 内存过高 / 自动重启 / **部署成功** → **运维小群**；不进业务群；见 §15.6 |
| 小绿盒经理/队员手机底栏 | **经理**：待办 · 设备 · 团队 · 回访 · 我的；**队员**：待办 · 设备 · 回访 · 我的（无团队）；设备详情藏底栏 |
| 小绿盒设备状态文案 | 列表/详情/导出统一 `xlv-device-display.ts`：沉睡优先；已达标/考核中；用户侧不出现「正常」「未收款」 |
| 小绿盒唤醒 | 已回访后，导入数据自动判定：`sleepDays < 2` 或 `lastTxnDate` 晚于 `followUpAt` → **已唤醒**；见 `src/lib/xlv-wake-up.ts`、§6.2c `/xlv/daily`（**回访情况**） |

### 1.2 本阶段停在哪里

生产 https://ali.orblead.com。已上线：N7 底栏、队员开号、V1 关单、设备挂靠、设备搜索；**微信小绿盒**（沉睡回访、今日待办、关单回告、运维告警运维小群、**分公司排名看板**、企微分流；**导入失败/中断推运维小群**、导入页三表成功失败一目了然、**移机到新店**、考核将到期点开看完整名单 · `58dc634`）。  
**其它待部署**：N7 关单企微外推 MVP-A（见 §16.1）。

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
├── BusinessHub.tsx      # 支付宝域业务选择（小蓝环 / N7）
└── PlatformPicker.tsx   # 未登录 `/` 平台选择（支付宝 / 微信小绿盒）
src/lib/business-lines.ts  # 业务线常量与路径工具
```

- `/`：未登录 **平台选择**（支付宝业务 / 微信小绿盒）；支付宝登录后进 `/alipay` 再选小蓝环 / N7
- `/alipay`：支付宝域业务选择（小蓝环 / N7），**无侧栏**
- `/xlh/*`、`/n7/*`、`/xlv/*`：业务内完整侧栏；顶部显示当前业务名 + **← 切换业务**
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

### 4.4 业务线分区（2026-08-08 平台分流）

方案：**未登录先选平台**；支付宝域登录后选小蓝环 / N7；微信域独立登录后进小绿盒。

| 路径 | 含义 |
|---|---|
| `/` | **平台选择**（支付宝业务 / 微信小绿盒）；未登录入口 |
| `/login` | 支付宝域登录（小蓝环 + N7，共用 `User`） |
| `/login/xlv` | 微信小绿盒登录（`XlvMemberAccount`） |
| `/alipay` | 支付宝域业务选择（小蓝环 / N7） |
| `/xlh/*` | 小蓝环：现有看板能力（总览、团队、商机、台账、管理） |
| `/n7/*` | 支付宝 N7：今日待办、达标跟进、数据看板、设备详情、导入（见 §6.2b） |
| `/xlv/*` | 微信小绿盒：今日待办、沉睡预警、团队看板、回访情况、设备详情、导入（见 §6.2c） |
| `/onboarding` `/change-password` `/settings/password` | 全局，不挂业务前缀 |

旧书签兼容（`next.config.ts` redirects）：`/ledger`、`/teams`、`/opportunities`、`/members`、`/admin/*`、`/screen` → 对应 `/xlh/...`。

权限：**支付宝域**（小蓝环 + N7）按 `User.businessLines`；**微信小绿盒**使用独立 `XlvMemberAccount`（组织名册导入自动开号，见 §1.1）。

---

## 5. 角色与权限

定义在 `src/lib/permissions.ts`，中间件 `src/middleware.ts` + `src/lib/auth.config.ts`。

### 5.1 四级角色

| 角色 | 英文 | 数据范围 | 特殊能力 |
|---|---|---|---|
| 事业部负责人 | DIRECTOR | 全量 | 上传 Excel、公共大屏、组织管理 |
| 区域经理 | MANAGER | 所辖团队 | 团队管理（业务员花名册）、组织管理侧开通主管 |
| 团队主管 | SUPERVISOR | 小组 + 个人 | **强制双区**（团队/个人 Tab） |
| 一线业务员 | SALES | 个人 | **可登录（N7）**；默认业务线可仅 `n7`；小蓝环侧仍主要作数据归属 |

### 5.2 谁可以登录

**可登录角色**：DIRECTOR、MANAGER、SUPERVISOR、**SALES**（`canRoleSignIn` 全角色允许；停用仍由 `canLogin(status)` 拦截）。

```
Excel 导入 → 自动开通登录（ACTIVE + 默认密码 123456 + 首登改密；已开通不覆盖密码）
    ↓ 或经理本队开号 / 重置密码
队员 → 登录 → 强制改密 → N7 工作台（仅本人数据）
```

**N7 队员能力边界**：

- 支持登录；数据范围强制 `staffKey = 本人`
- 管理员组织页仍不直接「开通业务员」；由经理「人员管理」或人员 Excel 导入开通
- `/n7/me/team`：开号、重置密码、停用；已停用可彻底删除；打开时补开通 + 本队同名空号去重

**设备 / 人员匹配（N7）**：

- 匹配键 = **作业员姓名 + 所属经理**（勿仅按姓名全局匹配）
- 导入：`findN7SalesInIndexes`；部署/脚本：`relinkN7SalesDevices` / `npm run dedupe:team-sales`

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
| `/` | 业务选择页 | `BusinessHub`：小蓝环 / 支付宝 N7 / 微信小绿盒 |
| `/xlh` | 小蓝环 · 数据总览 | URL 日期筛选，默认本月；主管双区 |
| `/n7` | 支付宝 N7 · 今日待办 | 运营队列首页；复盘看板在 `/n7/board` |
| `/xlv` | 微信小绿盒 · **今日待办** | P0/P1/P2 行动清单；与 N7 一样为业务首页 |
| `/xlv/alerts` | 微信小绿盒 · **设备** | 全量列表 + 顶部六宫格筛选；团队看板在 `/xlv/board` |

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
| `/n7` | **今日待办**：主列表「系统催办」（P0）；经理有未读关单提醒时显示横幅；三卡入口（未处理 / 区间已达标 / 过期未达标）；**搜索**门店/SN/手机（`q`，跨月） |
| `/n7/follow-up` | **达标跟进**：考核「待跟进」完整列表（**按考核期**，非注册月）；处理状态筛选；**搜索**；行内「去关单」进详情 |
| `/n7/board` | **数据看板 / 团队看板**：经理排行或本队队员排行；**拓展/达标按注册日期**；摘要含过期未达标 |
| `/n7/managers/[managerKey]` | 经理下队员排行（注册日期口径） |
| `/n7/managers/.../staff/[staffKey]` | 队员设备明细（**注册日期口径**，与看板数字一致）；Tab：待跟进 / 已达标 / 过期未达标 / 全部；支持搜索；行内「去关单」 |
| `/n7/devices/[sn]` | 设备详情：进度 → 联系 + **V1 关单**（接通结果 + 叠加项 + 现场图）；经理打开可清该 SN 未读提醒 |
| `/n7/notifications` | 经理：**队员已处理**列表（今日待办入口）；点进详情审阅 |
| `/n7/daily` | 每日绩效 |
| `/n7/admin/import` | DIRECTOR：N7 考核表 Excel 导入 |

**两套「跟进」勿混用**：

| 名称 | 含义 |
|---|---|
| 待跟进（考核） | 未达标、仍在考核期内的设备，由 Excel 指标自动算紧急度；**名单不按注册月截断** |
| 过期未达标 | 考核已结束且仍未达标（`remainingEnded && !isQualified`）；与待跟进互斥；看板摘要卡可下钻到 `/n7/follow-up?status=expired`；队员设备有 Tab |
| 看板拓展/达标 | 按所选**注册日期**区间汇总；与待办/跟进运营名单口径不同，页顶有说明 |
| 处理状态 / V1 关单 | 人是否已关单（`followUpDone` + 接通结果 / 叠加 flags / 现场图）；Excel 重导**不覆盖** |
| 系统催办 | 与 P0 未处理对齐；非经理派单 |

**考核紧急度（内部仍用 P0–P3；界面/导出用人话）**（`n7-rules.ts` / `n7PriorityLabel`）：

| 内部 | 界面文案 | 规则摘要 |
|---|---|---|
| P0 | 剩余≤2天 | 考核还剩 0/1/2 天 → **系统催办** |
| 已无望 | （标记，非独立优先级） | 还差有效天数 > 剩余天数+1（含今天）；仍展示，排在可追名单之后 |
| P1 | 无动销 | 天数与用户均为 0，且剩余 ≥6 天 |
| P2 | 行为未齐 | 未点亮 / 未订阅 / 未打卡 |
| P3 | 预警 | 其它待跟进 |

列表列名约定：已用天数、已有用户、缺口；列表不展示 SN（详情页可见）。示意稿：`docs/n7-today-mock.html`（仅视觉参考）。

### 6.2c 微信小绿盒页面（需登录，`src/app/(dashboard)/xlv/`）

侧栏：**今日待办** · **设备** · **团队看板** · **回访情况**（经理/管理员）；手机底栏见 §1.1（经理 5 键 / 队员 4 键）。业务员（`XlvMemberAccount`）进入后直接看本人设备。

| 路径 | 要点 |
|---|---|
| `/xlv` | **今日待办**（首页）：P0/P1/P2 分区 + 快捷卡；顶栏 **「系统通知」** 链 `/xlv/notifications` |
| `/xlv/notifications` | **系统通知**：**队员已跟进**（关单回告 / 经理反馈，可批量标已读）与 **撤机通知**（待确认，须逐条同意/拒绝）两个分区；跟进类点进设备详情审阅即已读；**查看设备不关闭撤机待确认**；设备详情页亦可确认撤机 |
| `/xlv/alerts` | **设备**（全量列表）：顶部**两行六宫格**（本月拓展 → 已达标 → 达标率 → 单笔沉默 → 沉睡 → 唤醒率）；点击可下钻列表或跳转回访情况；`?expand=month`、`?alert=`、`?status=`、`?manager=`、`?operator=`、`?q=`；指标 API `/api/xlv/dashboard/pulse`；**负责人选经理后，队员下拉仅该团队**；默认列表**不含剩余库存** |
| `/xlv/follow-up` | **沉睡回访**（无侧栏入口）：`?follow=pending\|done\|all`、`?priority=P0\|P1`（与今日待办对齐；有 priority 时 Tab 计数按该档统计）；筛选芯片 **优先催办** / **疑似沉睡**；跟进需跟进图（至少一张）+ 接通状态 + 备注；标题下返回；支持 **导出 Excel** |
| `/xlv/daily` | **回访情况**：回访跟进 / 已唤醒 / 仍沉睡；负责人看经理排行、经理看队员排行、队员看自己；按**跟进日**筛选 + 唤醒日趋势图 |
| `/xlv/board` | **团队看板**：经理排行 → 队员排行 → 设备列表；汇总条显示 Admin **整体合规率**或经理**团队合规率**；经理/队员卡片均突出 **90% 合规线**（合规台数、容错剩余或恢复差距），并分**业绩**（设备/已达标/考核中）、**风险**（单笔沉默/沉睡/待跟进）、**本月跟进**（已跟进/已唤醒/唤醒率）；不展示无效；支持合规率 / 待跟进 / 本月跟进 / 唤醒率排序；指标可下钻 |
| `/xlv/managers/[managerKey]` | 经理下队员排行；`?status=` 考核筛选 |
| `/xlv/managers/.../staff/[staffKey]` | 队员设备列表（队员底栏「设备」同页）：已达标 / 考核中 + 沉睡类筛选；**不展示无效**；沉睡 / 单笔沉默卡片右侧显示 **待回访 / 已回访** |
| `/xlv/managers/.../staff/[staffKey]/performance` | **队员月绩效**：拓展/达标（首笔交易月）、回访跟进（跟进日）、唤醒；经理从看板队员名进入 |
| `/xlv/devices/[sn]` | 设备详情：**考核进度** → **沉睡回访**（沉睡类）→ **交易趋势**；考核表当前月高亮「当前」；商户名与 SN 可复制 |
| `/xlv/me` `/xlv/me/team` | 小绿盒「我的」、经理队员管理（开号/重置密码） |
| `/xlv/admin/import` | DIRECTOR：运营原始表 + 人员归属表 Excel 导入 |
| `/xlv/admin/attribution` | DIRECTOR：**人员挂靠** — 未匹配姓名、未挂靠设备、批量重挂 |
| `/xlv/admin/accounts` | DIRECTOR：小绿盒经理账号管理 |

**今日优先级**（`classifyXlvTodayPriority`，每台仅入最高档）：

| 档 | 条件 |
|---|---|
| P0 | 单笔沉默，或沉睡 ≥7 天且未回访 |
| P1 | 其它需回访的沉睡（`sleepDays` 为 2–6 天；不含已达标设备的沉睡展示） |
| P2 | 考核中且剩余 ≤15 天（两月窗口） |

**口径（勿混）**：

| 名称 | 含义 |
|---|---|
| 剩余库存 | 运营表无经理字段的设备池；摘要条展示，可点进 `/xlv/alerts?manager=剩余库存` |
| 已铺设 | 已挂经理/队员的设备；达标率、默认列表、看板排行的统计分母 |
| 沉睡 / 单笔沉默 | `sleepDays ≥ 2`；仅 1 笔且沉睡为单笔沉默（优先标红） |
| 考核状态 | 自然月增量达标判定（20 用户 **且** 300 笔）；月成绩按**实际收款日**汇总；`qualified` / `in_progress` / `invalid` |
| 回访字段 | `followUpDone` 等；Excel 重导**不覆盖**；界面文案统一「跟进」 |
| 唤醒 | 跟进后首次快照满足不再沉睡或末笔晚于跟进日；实现 `detectXlvWakeUpDate` |

规则与常量：`src/lib/xlv-rules.ts`；快照按中国日历日归一：`src/lib/xlv-stat-date.ts`。

### 6.2d 微信小绿盒 · 库存管理（Phase 1 · 蓝图 v1.1）

**定位**：物流账（谁拿着 SN、是否已铺设）与运营账（原始表 + 考核 + 沉睡/单笔沉默）分离。N7 / P 站无关；数据均来自 Excel 上传。

| 路径 | 角色 | 功能 |
|---|---|---|
| `/xlv/admin/inventory` | DIRECTOR | **库存看板**（默认 Tab）、期初盘点、**新增入库**、**回拨机具**、**划拨下级**、待收货确认；**撤机 Tab 暂隐藏** |
| `/xlv/inventory` | MANAGER | **库存看板**、待收货确认、分给队员；**撤机 Tab 暂隐藏** |

**库存看板（默认 Tab）**：Admin 见各经理 **收到 / 已铺设 / 剩余 / 铺设率 / 合规率**（合规率来自运营考核，与 `/xlv/board` 同口径，供货量有限时的补货决策）；经理见本团队摘要 + 队员手持未铺列表。**团队看板不再展示库存指标**。

**库存状态**（`XlvInventoryDevice.status`）：

| 状态 | 含义 | 进待办/看板 |
|---|---|---|
| `admin_stock` | 事业部总库 | 否 |
| `pending_mgr_confirm` | Admin 已划拨，待经理确认 | 否 |
| `manager_stock` | 经理库存 | 否 |
| `sales_stock` | 队员库存 | 否 |
| `deployed` | 已铺设（运营考核中） | **是** |

**无「待激活」状态**；已铺设设备的运营分类仍为 **单笔沉默 / 沉睡 / 达标 / 考核中**（`xlv-rules.ts`）。

**撤机（现行 · 由 SN 归属推断）**：移机明细表导入 / 待确认流程 **暂关闭**（`XLV_WITHDRAW_IMPORT_ENABLED=false`）。以 **SN 归属表** 为准：表内 SN = 已铺设；若同一 SN **原商户 → 新商户**，系统记 **推断撤机** 流水并铺到新商户。不再依赖归属人同意/拒绝。

**撤机（历史 · 移机明细表，已暂停）**：运营侧 Excel「移机明细」曾用于创建待确认撤机单；同意后 `deployed` → 原铺设人库存并清零运营态。代码保留，开关打开后可恢复。

**入库**：仅 Admin — Excel **新增入库**（列：`设备SN`，可选 `渠道`）或 Excel **划拨下级**（`设备SN` + `所属经理`）→ 经理 PC **确认收货** 后入 `manager_stock`。经理→队员：**无需队员确认**，上传 `设备SN` + `作业员` 即入 `sales_stock`。**经理之间不可相互划拨**；跨经理改归属 **只能由 Admin**，且须 **撤机（若已铺）→ 回拨机具 → 划拨下级**（见下），不可用移机明细表代替回拨/划拨，也不以期初表「改经理名」代替日常调拨。

**经理间调拨（Admin 专用 · 与撤机分离）**：

| 阶段 | 操作 | 含义 | 状态变化 |
|---|---|---|---|
| ① 撤机（仅当已铺设） | 导入 **移机明细**（=撤机表）→ 归属人 **同意** 后生效 | 从门店撤下，回到原经理/队员 | `deployed` → `manager_stock` / `sales_stock` |
| ② 回拨机具 | 导入 **回拨机具** Excel | Admin 从经理/队员手中收回总库 | `manager_stock` / `sales_stock` → `admin_stock` |
| ③ 划拨下级 | 导入 **划拨下级** | Admin 发给新经理 | `admin_stock` → `pending_mgr_confirm` |
| ④ 确认收货 | 新经理 PC 确认 | — | `pending_mgr_confirm` → `manager_stock` |

- **移机明细 ≠ 回拨机具**：撤机只到铺设人库存；进 `admin_stock` **必须**走 ②，与撤机是两次独立导入。
- 设备已在 **`manager_stock` / `sales_stock`**（未铺或已撤机）：跳过 ①，从 ② 开始。
- **`deployed` 不可直接回拨机具**：须先 ① 撤机；否则 ② 报错「请先撤机」。
- **`admin_stock` / `pending_mgr_confirm`**：已在总库或待确认链上，不需收回；待确认可重导划拨改目标经理。
- 每步独立 Excel、独立流水；**不做** Admin 一键改经理。
- 收回 Excel 列：`设备SN`（必填）、`备注`（可选）。
- 看板：Admin 摘要展示「事业部库存 N 台」；经理不可见、不可操作收回。

**渠道**（付呗/乐刷）仅展示统计，**不影响**调拨与撤机流程。

**期初**：上传 `微信盒子库存.xlsx`（`设备SN | 渠道 | 所属经理 | 作业员`）；**须先导入 SN 归属表**。按 SN 是否在归属表内：在表内 → `deployed`（已铺设）；表外且无作业员 → `manager_stock`；表外且有作业员 → `sales_stock`（队员库存）。支持 **dry-run 预览**；**同 SN 再次导入会覆盖**（可只上传需更正的行，如改错经理名）。期初表「所属经理」与运营归属不一致时，库存账以期初为准、合规率仍以运营表经理为准。

**与运营导入协作**：建议顺序 ① 库存变动 ② 运营原始表 ③ 名册 ④ SN 归属（逐步弱化）。库存未建账的 SN（`inventory` 为空）在 Phase 1 **仍视为已铺设**，兼容上线前数据；期初/撤机后 **`deployed` 以外状态** 的设备从默认列表、沉睡预警、今日待办等运营视图中排除（`xlv-scope.ts`）。**撤机同意**后同步清零设备表运营考核态（门店/指标/回访）；历史快照保留。若曾用旧版「立即撤机」且运营未清，可一次性跑 `npm run backfill:xlv-withdraw-ops`（预览）→ `--apply`（**仅历史补跑**；生产未导移机明细则不必跑）。

**撤机确认 API**：`POST /api/xlv/inventory/withdraw-requests/{id}/respond`，body `{ "action": "approve" | "reject" }`；仅小绿盒归属人账号。通知类型 `withdraw_pending`，入口 `/xlv/notifications` **撤机通知** 分区（同意/拒绝按钮；**查看设备不影响待确认**；列表加载时自动恢复历史误标已读）。设备详情页有待确认撤机单时展示确认横幅。

**Phase 2（未做）**：`XlvDeviceDeployment` 铺设轮次、详情页历史时间线、二次铺设自动开新轮。

实现：`src/services/xlv/inventory/*`、`src/lib/xlv-inventory.ts`、`src/lib/xlv-withdraw.ts`；模型 `XlvInventoryDevice` / `XlvInventoryTransfer` / `XlvWithdrawRequest`。

### 6.4 认证页面

| 路径 | 说明 |
|---|---|
| `/` | 未登录平台选择（支付宝 / 微信小绿盒） |
| `/login` | 支付宝域登录（Leadspace.Alipay / 数据管理）；成功默认进 `/alipay` |
| `/login/xlv` | 微信小绿盒登录（`XlvMemberAccount`）；成功进 `/xlv` |
| `/onboarding` | 实名认证（主管等 `PENDING_ONBOARDING`；经理开通后多为 `ACTIVE` 可跳过。**业务员不使用此页**） |
| `/settings/password` | 改密（含首登强制）；路由组 `(account)`，见 §5.2 |
| `/change-password` | 兼容旧链，重定向到 `/settings/password` |

### 6.5 主要 API

```
src/app/api/
├── auth/           check-account, change-password, session-expired
├── admin/users/    用户 CRUD、开通、重置密码、business-lines
├── import/         excel, personnel, n7, xlv
├── ledger/         台账分页 + export
├── stats/          指标 + charts
├── members/        人员列表 + export
├── teams/          团队明细 + export
├── n7/             today, managers, follow-up(+export), devices/[sn]（GET+PATCH）, daily
├── xlv/            dashboard, board, daily, devices/[sn], managers/.../performance,
│                   follow-up/export, admin/member-accounts, team
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
| `User` | 用户；`role` + `status` + `accountLifecycle` + `mustChangePassword` + `businessLines`（`xlh` / `n7` / `xlv`） |
| `SalesPlatformIdentity` | 业务员 P 站身份（作业账号 + 个人 PID）；导入或回填写入，供花名册展示与匹配 |
| `MerchantRecord` | 商户明细（核心业务表；现行靠 Excel 导入写入） |
| `N7DeviceRecord` | N7 设备考核；处理状态含 `followUpDone` / `followUpNote` / `followUpAt` / `followUpById` / `followUpConnectStatus` / `followUpFlags` / `followUpPhotoUrls`（Excel 重导不覆盖） |
| `N7Notification` | N7 提醒通知（如 `sales_follow_up_done` → 所属经理 `User`）；`read` / `meta` |
| `XlvMemberAccount` | 小绿盒独立登录账号（经理/作业员）；组织名册导入自动开通 |
| `XlvNotification` | 小绿盒提醒通知（队员关单 → 所属经理 `XlvMemberAccount`）；`read` / `meta` |
| `XlvDeviceRecord` | 小绿盒设备主表（SN 唯一）；含经理/作业员姓名与可选 `userId` 挂靠、沉睡指标、首末笔日期；回访字段 `followUpDone` / `followUpNote` / `followUpAt` / `followUpById` / `followUpConnectStatus` / `followUpFlags` / `followUpPhotoUrls`（重导保留内容；下一日运营快照仍沉睡时仅重开 `followUpDone`） |
| `XlvTeamRoster` | 小绿盒组织名册（作业员 → 经理，无 SN） |
| `XlvDeviceSnapshot` | 小绿盒按 SN + 统计日期存历史快照（支持自然月增量考核与趋势图） |
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

### 10.1b 小绿盒导入流程（现行 · 三表）

运营日常路径（管理员 DIRECTOR）：

1. 登录 → 业务选择 → 微信小绿盒 → `/xlv/admin/import`
2. **① 运营原始表** — 按 SN + 统计日期写快照与最新指标
3. **② 组织名册** — 作业员 → 经理（**无 SN**）；写入 `XlvTeamRoster`，并回写已有设备的经理/作业员字段
4. **③ SN 归属表** — **谁铺算谁的**：按 SN 挂作业员/经理；表内 SN 同步库存为 **已铺设**；**同 SN 商户名变更 = 推断撤机并铺到新商户**；经理列可省略，系统从名册反查。移机撤机明细导入暂关闭（`XLV_WITHDRAW_IMPORT_ENABLED=false`）

| 表 | 必填列 | 说明 |
|---|---|---|
| 原始表 | 设备 SN、统计日期 | 微信运营导出 |
| 组织名册 | 所属作业员、所属经理 | 你提供的经理–队员名单 |
| SN 归属 | 设备 SN、所属作业员 | 商户名称可选；经理可省略 |

导入完成后展示**摘要**；未匹配姓名见 `/xlv/admin/attribution`。

**大表（运营原始表）**：与 N7 / 小蓝环一致走 **后台任务**（`enqueueHeavyImport` → `HeavyImportJob`），上传返回 `202 + jobId`，前端轮询 `/api/import/jobs/[id]`。十万行约 **3～8 分钟**；勿关页、勿重复上传。批量写入见 `xlv-raw-bulk.ts`；故障复盘见 **§15.7**。

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
│   │   ├── xlv/                  # 沉睡预警 / board / devices / import
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
│   ├── xlv/                      # XlvDashboardView / Board / DeviceDetail / ImportSummary …
│   ├── dashboard/DashboardView.tsx
│   ├── ledger/LedgerView.tsx
│   ├── teams/TeamDetailsView.tsx
│   └── opportunities/OpportunitiesPageContent.tsx
├── lib/
│   ├── business-lines.ts         # ★ 业务线常量与路径
│   ├── xlv-rules.ts              # ★ 小绿盒沉睡/考核规则
│   ├── xlv-device-display.ts     # 小绿盒列表/详情/导出状态文案
│   ├── xlv-stat-date.ts          # 小绿盒统计日期归一（中国日历日）
│   ├── xlv-follow-up.ts          # 沉睡回访枚举 / 摘要 / 通知 type
│   ├── xlv-notifications-client.ts
│   ├── n7-rules.ts               # ★ N7 考核优先级与人话标签
│   ├── n7-search.ts              # N7 设备搜索（客户端筛选 + Prisma 跨月查询）
│   ├── n7-follow-up.ts           # V1 关单枚举 / 摘要文案
│   ├── n7-follow-up-client.ts    # 关单 PATCH + 图片上传客户端
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
    ├── n7/analytics.ts           # ★ N7 今日队列 / 看板 / 跟进（考核期 vs 注册日口径）
    ├── xlv/analytics.ts          # ★ 小绿盒看板 / 设备列表 / pulse 六宫格
    ├── xlv/assessment.ts         # 考核状态与快照加载
    ├── xlv/follow-up.ts          # 沉睡回访台账 + 关单写库
    ├── xlv/notifications.ts      # 关单回告经理（仅 XlvMemberAccount）
    ├── import/xlv-excel-*.ts     # 小绿盒 Excel 解析与导入
    ├── import/xlv-raw-bulk.ts    # 小绿盒原始表批量快照/设备写入
    ├── import/heavy-import-job.ts
    ├── n7/notifications.ts       # 关单回告经理提醒通知
    ├── n7/follow-up-photos.ts    # 关单现场图落盘
    ├── stats/analytics.ts
    └── import/excel-importer.ts
```

---

## 13. 近期已完成

### 2026-08-25（导入失败必提醒 · 移机展示 · 考核将到期可下钻 · **已部署** `58dc634`）

- [x] **导入未成功不能当已导入**：中断/失败推运维小群；导入页顶部固定三格（原始表 / 名册 / SN 归属）显示最近一次成功或失败
- [x] **中断文案**：改为「导入未成功，请重新上传」；不再写「请勿立即重复上传、可能已写入」
- [x] **移机到新店**：同 SN 换商户后，列表/详情标徽章并显示原门店
- [x] **考核将到期**：点 51 台卡片展开这批完整名单（不再跳设备页「考核中」全量，也不再截成 40 条）

### 2026-08-22（运维告警 · 运维小群 Webhook · 已部署 `38bb355`）

- [x] **通道**：内存过高 / 站点不可用 / 容器未运行 / 自动重启 / 导入卡死 → **运维小群** `OPS_ALERT_WEBHOOK_URL`（`ops-alert.sh` / `notifyXlvOutboundOpsAlert`）
- [x] **隔离**：故意不回退 `XLV_OUTBOUND_WEBHOOK_URL`，业务群不收运维噪声
- [x] **自建应用搁置**：曾试「LEADspace 运维」应用消息（`WECOM_*`）；卡在企业可信 IP / 域名主体校验（`60020`），代码保留为可选回退
- [x] **生产验收**：2026-08-22 试发「配置验收」运维小群已收到

### 2026-08-22（小绿盒 · SN 归属为准推断撤机 · 已部署 `e85d995`）

- [x] **撤机明细入口暂隐藏**：库存「撤机」Tab / 待确认 UI / 撤机通知分区；API `kind=withdraw` 返回 403（`XLV_WITHDRAW_IMPORT_ENABLED=false`）
- [x] **SN 归属为准**：表内 SN 同步库存为已铺设；谁铺算谁的
- [x] **换商户 = 推断撤机**：同 SN 原商户 → 新商户时记 withdraw + deploy 流水
- [x] **口径对齐**：看板沉睡/单笔计数与队员设备列表均按「已铺设」过滤

### 2026-08-21（小绿盒 · 看板降内存 + 内存告警不进业务群）

- [x] **根因**：打开 `/xlv/alerts` 时 pulse 会拉每日绩效全量关单设备 × 全部历史快照，RSS 约 10 分钟顶到 1.5GB
- [x] **Pulse**：本月关单设备算唤醒率，不再调用 `getXlvDailyPerformance` 全量
- [x] **Daily / 导出**：快照只拉 `followUpAt` 之后；折线仍含「更早关单、期内唤醒」
- [x] **回访列表**：用落库 `qualificationStatus`，不再为整表拉快照
- [x] **巡检**：每 10 分钟只记日志；连续两次超 1200MB 且无导入才重启；`restart-app.sh` 部署时补执行权限
- [x] **企微**：内存过高曾不推业务群（只记日志）；**现已改走运维小群**（见上条 `38bb355`）

### 2026-08-21（小绿盒 · 企微外推 + 运维告警 · 已部署生产 `a6d935b`）

- [x] **企微外推**：`outbound-notifier.ts` — 队员跟进完成、撤机待确认、**小绿盒数据上传成功**旁路推群（`XLV_OUTBOUND_WEBHOOK_URL`）
- [x] **运维告警**：`/api/xlv/ops/health` + cron 每 10 分钟；**现主通道为运维小群**（见 `38bb355`）；30 分钟冷却
- [x] **定时重启**：每天 03:00 `restart-app.sh`；有大表导入则跳过
- [x] **生产验收**：2026-08-21 测试消息送达企微群

### 2026-08-13（小绿盒 · 团队执行看板 + 回访体验 · 已部署 `afcb22a`）

- [x] **经理 / 队员行重构**：Admin 看经理、经理看队员均按业绩 / 风险 / 本月跟进三层呈现，移除行及摘要中的「无效」
- [x] **行动指标**：实时待跟进；本月已跟进、已唤醒与唤醒率；点击进入对应设备、回访或月绩效明细
- [x] **90% 动态合规线**：已达标永久合规；考核中且当前活跃、跟进后已唤醒且当前仍活跃计入合规；仅跟进不计，再次沉睡即退出；汇总条及人员卡片展示合规台数、容错余量或恢复差距
- [x] **跟进重开**：未达标设备在跟进后的下一批数据仍为单笔沉默/沉睡，自动重新待跟进；历史跟进日期保留用于本月执行统计
- [x] **排行切换**：合规率 / 待跟进 / 本月跟进 / 唤醒率；选择写入 `?sort=`
- [x] **回访文案统一**：P1 改称 **疑似沉睡**（2天≤沉睡＜7天）；回访 Tab「全部」；筛选芯片「优先催办」
- [x] **回访页体验**：标题下返回；`priority` 筛选时 Tab 计数与列表同口径
- [x] **设备看板**：队员设备页去掉「无效用户」筛选；沉睡类列表卡片展示回访状态

### 2026-08-12（小绿盒 · 设备页六宫格 · 已推 `2b030d0`）

- [x] **设备页六宫格**：`/xlv/alerts` 顶部两行三列 — 本月拓展 / 已达标 / 达标率 / 单笔沉默 / 沉睡 / 唤醒率；替代原「沉睡预警 + 考核状态」分卡
- [x] **pulse API**：`GET /api/xlv/dashboard/pulse`（`getXlvDashboardPulseSummary`）；本月拓展按 `firstTxnDate` 落在当月
- [x] **下钻**：拓展 / 达标率支持 `?expand=month`（可叠 `status=qualified`）；沉睡类仍用 `?alert=`；唤醒率跳转 `/xlv/daily` 当月区间

### 2026-08-09（小绿盒 · 已部署 `a56e4ae`）

- [x] **关单抄送 admin**：队员关单除通知所属经理外，另写一份给全局 `admin`（`User.username=admin`）；经理与 admin 各独立已读
- [x] **设备页队员筛选**：负责人选经理后，队员下拉按 `?manager=` 收窄（不再展示全公司队员）；实现 `XlvDashboardView` + `getXlvFilterOptions`

### 2026-08-08（XLV 大表导入稳定性 · 已部署生产）

- [x] **异步导入**：`/api/import/xlv` → `HeavyImportJob` + 前端轮询（修复同步超时）
- [x] **API 鉴权 JSON 化**：避免 `Unexpected token '<'`（`auth.config.ts` / `auth-realm.ts`）
- [x] **批量写入**：`xlv-raw-bulk.ts`（快照 + 设备更新）；导入进度分阶段上报
- [x] **任务恢复**：`instrumentation.ts` 启动清理孤儿任务；3 分钟无进展判失败；轮询 502 重试
- [x] **生产内存**：app 1.5G、Node 堆 1280MB
- [x] 运维文档：**§15.7 运维备忘 — XLV 大表导入**

### 2026-08-19（小绿盒 · 系统通知分区 + 撤机待确认修复）

- [x] **`/xlv/notifications` 分区**：**队员已跟进**（`sales_follow_up_done` / `manager_follow_up_review`）与 **撤机通知**（`withdraw_pending`）两个卡片列表；跟进类可「全部标已读」，撤机须逐条确认
- [x] **撤机待确认不误关**：查看设备 / 批量已读 **不** 关闭撤机待确认；仅同意/拒绝后标记已处理；历史误标已读在列表/详情加载时自动恢复
- [x] **设备详情撤机横幅**：有待确认撤机单时展示同意/拒绝；同意后刷新运营态
- [x] **入口文案**：侧栏 / 今日待办 / 页标题统一 **「系统通知」**；跟进通知文案 **「队员已跟进」**

### 2026-08-08（小绿盒关单回告 · UI · 已部署 `8182472`）

- [x] **关单回告经理**：`XlvNotification`；队员关单 → 按 `managerName` 匹配 `XlvMemberAccount`（**不走**支付宝 `User`）；经理自记不通知；`/xlv/notifications` + 侧栏 + 今日待办横幅 + 经理待办角标；详情打开即已读（`e553d2b`–`8182472`）
- [x] **设备状态文案**：`xlv-device-display.ts` 统一列表/详情/导出；沉睡优先；无用户侧「正常」
- [x] **设备详情**：考核进度在沉睡回访表单上方
- [x] **队员手机底栏**：4 键（待办 · 设备 · 回访 · 我的），去掉团队
- [x] **考核达标逻辑**：任一月达标即 `qualified`；详情/列表读时自愈 DB
- [x] **设备页** `/xlv/alerts`：考核卡与沉睡卡分开展示；看板排行纯文字彩色指标

### 2026-08-08（阶段 4 · UI 打磨 · 已部署 `f17f244`）

- [x] **考核进度**（设备详情）：去掉与表格重复的「当前关注」灰框；当前考核月在表内高亮「当前」+ 结果列展示缺口
- [x] **团队看板**排行行：指标改为纯文字彩色（如 `单笔沉默 1` 红字），无边框/底色；队员设备列表页筛选 Tab 仍保留带框样式

### 2026-08-08（阶段 4 · 已推 GitHub）

- [x] **平台入口分流**：`/` 选支付宝 / 微信；`/alipay` 支付宝业务选择；`/login/xlv` 独立登录
- [x] **`XlvMemberAccount`**：组织名册导入自动开号；`/xlv/admin/accounts` 经理账号；`scripts/backfill-xlv-member-accounts.ts`
- [x] **回访情况** `/xlv/daily`（侧栏/底栏文案，非「每日绩效」）：按跟进日统计回访跟进与唤醒
- [x] **队员月绩效** `/xlv/managers/.../performance`：拓展/达标/回访/唤醒一页汇总
- [x] **考核进度**：月成绩按实际收款日汇总；结果列展示缺口（如「用户已达标·差 N 笔」）
- [x] **交易趋势**：设备详情仅有收款日折线（`XlvTxnActivityChart`，替代快照趋势图）
- [x] 小绿盒文案统一「跟进」；SALES 可看本人设备列表

### 2026-08-08（阶段 3A/3B/3C · 已推 GitHub）

- [x] **沉睡回访**：`XlvDeviceRecord.followUp*`；设备详情跟进；台账 `/xlv/follow-up`；`priority=P0|P1` 与今日待办对齐
- [x] **今日待办** `/xlv`：P0/P1/P2 分区；`/xlv/today` → `/xlv`；沉睡预警迁至 `/xlv/alerts`
- [x] 侧栏收拢为：今日待办 · 沉睡预警 · 团队看板（回访从待办钻取，不占主导航）
- [x] UX：商户/SN 复制按钮；列表「去跟进」；跟进图文案
- [x] **阶段 3C**：`/xlv/daily` 回访统计（经理/队员排行 + 唤醒）；`/api/xlv/follow-up/export` Excel 导出

### 2026-08-07（阶段 2 · 已推 GitHub）

- [x] **人员挂靠** `/xlv/admin/attribution`：未匹配经理/作业员姓名清单（含设备数）
- [x] 未挂靠设备列表（缺 `managerUserId` / `salesUserId`）；单台修正归属
- [x] **重新匹配挂靠**：`backfillXlvManagerUserIds` + `relinkXlvSalesDevices`（对齐 N7 姓名+经理键）
- [x] 经理开队员号 / 删除队员时同步重挂或解绑 `XlvDeviceRecord`
- [x] 三表导入、XLV 同步导入、沉睡预警五卡 UX（正在活跃中、无「考核中」卡）

### 2026-08-07（阶段 1 · 已推 GitHub）

- [x] **微信小绿盒阶段 1**：独立业务线 `/xlv`（`businessLines` 含 `xlv`；业务选择页第三张卡片）
- [x] 双表 Excel 导入：运营原始表 + 人员归属表；后台任务；**导入摘要**（列匹配、日期范围、重复合并、未匹配姓名）
- [x] 沉睡预警 `/xlv`：单笔沉默 / 沉睡 / 正常活跃；考核状态筛选（已达标 / 考核中 / 无效用户）；列表按场景排序
- [x] 团队看板 `/xlv/board`：经理 → 队员 → 设备三级下钻；库存单独摘要、不进经理排行
- [x] 设备详情：考核进度面板 + **交易趋势**（按收款日）；统计日期按中国日历日归一

### 2026-08-04（已部署生产）

- [x] N7 **设备搜索**：今日待办、达标跟进、队员明细；`q` 参数；门店名 / SN / 手机；有搜索词时跨月服务端查询（`src/lib/n7-search.ts`）
- [x] N7 **名单口径拆分**：待办 `/n7`、跟进 `/n7/follow-up` 按**考核期**（未结束即展示）；看板 `/n7/board`、队员排行/队员明细按**注册日期**；页顶说明文案
- [x] `analytics.ts`：`activeAssessmentWhere` / `expiredAssessmentWhere` 与 `registeredWhere` 分场景使用

### 2026-07-22（已部署生产）

- [x] 手机端 **返回顶部**：`BackToTop.tsx`，全局挂载；监听 `#app-scroll`，下滑后右下角浮动按钮平滑回顶（含 safe-area）
- [x] 手机端 **首屏适配**：根布局显式 `viewport`（`device-width`、`initialScale=1`、`viewport-fit=cover`）；`globals.css` 防横向溢出与 iOS 字体缩放
- [x] 登录 / 首登 / 账号页 / AppShell 内容区补 `min-w-0`、`overflow-x-hidden`，避免打开时像桌面宽度缩进手机

### 2026-07-21（已部署生产）

- [x] 主机 2G Swap（防整机假死缓冲）
- [x] 生产 compose：app/postgres 内存上限 + NODE_OPTIONS
- [x] 导入互斥锁；人员/N7/小蓝环导入改为后台任务 + 前端轮询
- [x] 文档 §15.6 稳定性与升配建议

### 2026-07-29（代码已推 GitHub · **生产待测**）

- [x] N7 关单外推 MVP-A 代码：`outbound-notifier.ts` + 钩在 `notifyManagerFollowUpDone`；`N7_OUTBOUND_WEBHOOK_URL` / compose / env 示例
- [x] 产品确认：**企微**群机器人；**只做 A**（B 定时催 P0 未做）
- [ ] 本地/预发：配 Webhook → 单独推一条 → 关单验站内+群消息 → 坏 URL 关单仍成功
- [ ] 生产：写入 `.env` 的 Webhook 后部署并验收（§15.3：先测再上）

### 2026-07-26（已部署生产）

- [x] N7 队员可登录；历史导入补开通（`backfill:sales-login`）；登录页文案同步
- [x] 设备挂靠按 **姓名+所属经理**（导入 + `relinkN7SalesDevices`）；队员查询按姓名+经理兜底
- [x] 人员管理：可登录标记；**已停用**才可彻底删除（二次确认）；在职仅重置/停用
- [x] 本队同名双号：仅一侧有数据时停用空号；双侧有数据跳过；近音不合并（`dedupe:team-sales`）
- [x] 文档同步 §1.1 / §5.2

### 2026-07-20（已部署生产）

- [x] N7 首页改为 **今日待办**（`N7TodayView` + `/api/n7/today`）；侧栏：今日待办 · 达标跟进 · 数据看板/团队看板 · …
- [x] 原排行看板迁至 `/n7/board`
- [x] 今日待办：主列表「系统催办」（P0 未关单）；未处理/已达标/过期未达标为数字卡入口；经理有「队员已处理」入口
- [x] 考核优先级界面用人话（剩余≤2天 / 无动销 / 行为未齐 / 预警）；URL/API 仍用 P0–P3；导出同步人话
- [x] 处理状态 P0 体验：详情「联系 + 处理」同卡；列表行内入口
- [x] **系统催办 + V1 关单回告**：P0 自动催办；关单须接通结果+≥1 图；`N7Notification` 通知所属经理；`/n7/notifications` + 角标/横幅

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
6. **经理试用（N7）** — 今日待办系统催办 → 队员详情 V1 关单 → 经理从待办进「队员已处理」看结果与图片；复盘看数据看板
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

# 仅重启应用（释放内存，约 10s 502；有进行中的大表导入则自动跳过）
ssh sales-cloud '/opt/leadspace-alipay/deploy/restart-app.sh'

# 安装定时重启（默认每天 03:00；改时间：CRON_SCHEDULE="30 4 * * *" bash ...）
ssh sales-cloud 'bash /opt/leadspace-alipay/deploy/install-scheduled-restart.sh'

# 安装健康巡检 + 企微紧急告警（每 10 分钟；须 .env 配 XLV_OUTBOUND_WEBHOOK_URL + XLV_OPS_CRON_SECRET）
ssh sales-cloud 'bash /opt/leadspace-alipay/deploy/install-health-check-cron.sh'

# 手动测企微（站内逻辑，须已部署且 .env 已配 Webhook）
ssh sales-cloud 'curl -sS -H "Authorization: Bearer $(grep XLV_OPS_CRON_SECRET /opt/leadspace-alipay/.env | cut -d= -f2)" http://127.0.0.1:3001/api/xlv/ops/health'

# 首次 SSL（DNS 生效后）
ssh sales-cloud 'cd /opt/leadspace-alipay && ./deploy/setup-ssl.sh'
```

### 15.6 生产稳定性（防整机假死）

同机约 3.6G 内存，跑 ali / unicom / hk 等多服务。大表导入曾导致内存顶满、整机无响应。

| 措施 | 说明 |
|---|---|
| Swap 2G | 主机已挂载 `/swapfile`，开机自动启用 |
| 容器内存上限 | `docker-compose.prod.yml`：app **2G**、postgres 768M；超限 OOM Kill 后 Docker 自动重启 |
| Node 堆上限 | `NODE_OPTIONS=--max-old-space-size=1536`（须小于 app 容器上限） |
| **定时重启 app** | `deploy/restart-app.sh` + cron **每天 03:00**；导入进行中跳过；日志 `/var/log/leadspace-restart.log`；部署脚本 `chmod +x deploy/*.sh` |
| **紧急告警** | 导入卡死 / 站点不可用 / 容器未运行 / **内存过高** / 自动重启 → **运维小群** `OPS_ALERT_WEBHOOK_URL`（`ops-alert.sh` / `notifyXlvOutboundOpsAlert`）；**不进业务群**；可选 `WECOM_*` 自建应用（需可信 IP，当前因域名主体校验搁置） |
| **内存超阈值重启** | 巡检每 10 分钟；第一次 `memory_high` 只打标；**连续两次**（约 20 分钟）仍高且无导入才 `restart-app.sh` |
| **看板降内存** | pulse 不拉 daily 全量；快照可按 `statDateFrom` / 跟进日后加载；回访列表用落库达标状态 |
| 导入互斥 | 同时只允许一个重导入；看数/登录不限 |
| 后台导入 | 上传后返回 `jobId`，后台处理，前端轮询 `/api/import/jobs/[id]` |
| 启动恢复 | `instrumentation.ts` → `recoverOrphanedHeavyImportJobs`：重启后将孤儿 `PROCESSING/PENDING` 标为 `FAILED` |
| API 鉴权 | `/api/*` 鉴权失败返回 JSON（非 HTML 重定向），避免前端 `res.json()` 解析失败 |

**升配建议（F，需在腾讯云控制台操作）**

- 短期：轻量应用升到 **4 核 8G**（或至少 8G 内存），同机多站更稳  
- 更稳：ali 单独一台机，与 hk/unicom 拆开  
- 升配后可酌情放宽 compose 内存上限

相关文件：`deploy/nginx` 已配 `proxy_*_timeout 600s`、`client_max_body_size 100m`。

相关文件：

```
deploy/
├── push-and-deploy.sh           # 本机 rsync + 远程 server-deploy
├── server-deploy.sh             # 服务器：build、up、db push、seed
├── restart-app.sh                 # 仅重启 app 容器（可手动 / cron）
├── install-scheduled-restart.sh  # 安装每天 03:00 定时重启
├── health-check.sh               # 健康巡检（站点/内存/导入）
├── ops-alert.sh                  # 企微紧急告警
├── install-health-check-cron.sh  # 安装每 10 分钟巡检 cron
├── setup-ssl.sh                 # Let's Encrypt + Nginx HTTPS
├── env.production.example
└── nginx/ali.orblead.com.conf
docker-compose.prod.yml
Dockerfile
```

### 15.7 运维备忘 — XLV 大表导入（2026-08-08）

本节记录微信小绿盒**运营原始表**导入曾出现的线上故障、根因与已落地修复，供后续排障与部署时参考。

#### 现象（用户侧）

| 阶段 | 表现 |
|---|---|
| 最初 | 上传失败 / 页面仅显示「上传失败」 |
| 随后 | `Unexpected token '<', "<html>..." is not valid JSON` |
| 中期 | `HTTP 502`、进度条卡在 **20%**、「网络波动，继续等待…」 |
| 后期 | 「检测到未完成的导入」一直转；或「服务重启导致导入中断」 |
| 最终 | 批量写入 + 内存扩容后，**导入成功**（十万行约 3～8 分钟） |

#### 根因（四层叠加）

1. **同步超时（已修）** — 早期 `/api/import/xlv` 同步处理整表，大文件触发网关/nginx 超时。
2. **鉴权返回 HTML（已修）** — 轮询 `/api/import/jobs/...` 时中间件 302 到登录页，前端 `json()` 解析 HTML 报错。
3. **性能与内存（已修）** — 原始表为「设备 SN × 统计日期」，行数可达十万级；旧逻辑逐行查库/删/插；1GB 容器 + Excel 全量解析易 OOM → 容器重启 → 任务死在 `PROCESSING`。
4. **部署与状态不同步（已修）** — 部署重启杀死后台任务，库中仍为 `PROCESSING`；`sessionStorage` 续轮询旧 `jobId` → 页面长期 20%；短时间多次上传堆积僵尸任务。

#### 已落地修复

| 类别 | 内容 |
|---|---|
| 架构 | 上传 `202 + jobId`，`HeavyImportJob` 后台执行；`import-upload-client.ts` 轮询 + 502 自动重试 |
| 鉴权 | `auth.config.ts`：`/api/*` 失败返回 JSON 401/403 |
| 性能 | `xlv-raw-bulk.ts`：快照每 500 行批量查/删/插；设备最新状态批量 SQL（对齐 N7） |
| 资源 | app 容器 **1.5G**，Node 堆 **1280MB**；Excel 解析降低内存选项 |
| 生命周期 | 启动时 `recoverOrphanedHeavyImportJobs`；3 分钟无进展判失败；新上传前清理超时僵尸任务 |
| 体验 | 分阶段进度文案；刷新时先探测任务状态，已失败则直接提示重传 |

#### 关键文件

```
src/app/api/import/xlv/route.ts
src/app/api/import/jobs/[id]/route.ts
src/services/import/heavy-import-job.ts
src/services/import/xlv-raw-bulk.ts
src/services/import/xlv-excel-importer.ts
src/lib/import-upload-client.ts
src/components/xlv/XlvImportPage.tsx
src/lib/auth.config.ts / auth-realm.ts
src/instrumentation.ts
docker-compose.prod.yml
```

#### 运维操作备忘

| 场景 | 建议 |
|---|---|
| 用户报导入卡在 20% | 查 `HeavyImportJob` 是否 `PROCESSING` 且 `updatedAt` 很久未变；多为 OOM 或部署中断，让用户**重新上传一次**（勿连点） |
| 计划部署 | **导入进行中勿部署**；部署会重启 app 并标记孤儿任务 `FAILED` |
| 部署后 | 等约 1 分钟再让用户上传；刷新导入页若见失败提示，重新选文件上传即可 |
| 查任务状态 | `SELECT id, status, progress, message, "errorMessage", "updatedAt" FROM "HeavyImportJob" WHERE kind='xlv' ORDER BY "createdAt" DESC LIMIT 5;` |
| 查容器 | `sudo docker logs leadspace-alipay-app --tail 50`；`sudo docker stats leadspace-alipay-app` |
| 仍慢或 OOM | 考虑升配（§15.6 F）；或独立 worker / 进一步流式解析（待办） |

#### 业务顺序（导入成功后）

① 运营原始表 → ② 组织名册 → 「人员归属核对」从名册同步 → ③ SN 归属表（按需）。

### 15.8 部署后检查

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
| **小绿盒 2** | ~~导入未匹配报告、未挂靠设备、relink、轻量归属~~（已完成，见 §6.2c `/xlv/admin/attribution`） |
| **小绿盒 3** | ~~沉睡回访、今日待办、回访情况、Excel 导出、唤醒统计~~（3A/3B/3C 已完成，见 §6.2c） |
| **小绿盒 4** | ~~平台分流、独立开号、队员月绩效、考核按收款日、交易趋势~~（已完成，见 §13） |
| **小绿盒 5 · 库存** | ~~入库/回拨机具/划拨下级/撤机二次确认、库存看板合规率、队员未铺芯片、XLV 性能优化~~；系统通知分区 + 撤机待确认 UX 修复（本次）；生产待部署后导历史移机明细（方案 B，不需 backfill 脚本） |
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

### 灵感备忘（2026-07-27 · 北海道 Vibe Coding 对照）

- **关单/跟进录入减负**：语音或乱序备注 → 自动填接通结果/叠加项/摘要，减轻详情页点选；**先记下，未排期**
- **外推提醒 + 深链（N7 优先）**：§16.1；P 站自动化本轮不做；联通外推暂缓；录入减负只备忘不排期

### 16.1 N7 外推提醒 + 深链 · 进度（香港续做）

**状态（2026-07-29）**

| 项 | 结论 |
|---|---|
| 范围 | 只做 N7；联通外推暂缓；P 站自动化不做 |
| 通道 | **企微**群机器人 Webhook（先群、再考虑个人；短信备选） |
| 阶段 | **只做 MVP-A**；MVP-B（定时催 P0）第二步 |
| 代码 | 已实现并推 GitHub `main` |
| 上线 | **先测再部署生产**；未配 `N7_OUTBOUND_WEBHOOK_URL` 时外推静默跳过 |

**深链**

| 场景 | URL |
|---|---|
| 设备详情 / 关单结果 | `https://ali.orblead.com/n7/devices/{sn}` |
| 今日待办 | `https://ali.orblead.com/n7` |
| 经理「队员已处理」 | `https://ali.orblead.com/n7/notifications` |

**MVP-A 行为**

1. V1 关单成功 → 现有站内 `N7Notification` **不变**
2. 旁路再推企微一条：markdown 文案（处理人/门店/结果）+ 设备详情链接
3. Webhook 未配或推送失败 → **只打日志**，不挡关单与站内通知

**代码落点**

| 文件 | 作用 |
|---|---|
| `src/services/n7/outbound-notifier.ts` | 组装 markdown、POST 企微 Webhook |
| `src/services/n7/notifications.ts` | `notifyManagerFollowUpDone` 写库后 `try/catch` 调外推 |
| `deploy/env.production.example` | `N7_OUTBOUND_WEBHOOK_URL`、`N7_PUBLIC_BASE_URL` |
| `docker-compose.prod.yml` | 把上述 env 传入 app 容器 |

**香港续测清单**

1. 企微群 → 群机器人 → 复制 Webhook  
2. 本地 `.env`（或生产待测机）：
   ```bash
   N7_OUTBOUND_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
   N7_PUBLIC_BASE_URL=https://ali.orblead.com
   ```
3. 可选：用脚本/临时调用 `notifyOutboundFollowUpDone` 先打一条到群  
4. 本地关一单：站内「队员已处理」有记录 + 群里有消息 + 链接可开  
5. 故意配错 URL：关单仍成功，日志有 `[n7-outbound]`  
6. 验收通过后再 `./deploy/push-and-deploy.sh`，并在服务器 `.env` 写入真实 Webhook  

**MVP-B（未做）**：定时扫 P0 未处理 → 催队员（可抄经理）→ 链到 `/n7` 或设备详情。

**验收（MVP-A）**

- [ ] 关单成功 → 站内提醒仍在 + 企微群收到含店名摘要 + 可点详情链接  
- [ ] Webhook 未配或失败 → 关单与站内通知不受影响  
- [ ] 未登录点深链 → 登录后落到该设备详情  

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
| N7 V1 关单 / 系统催办 | `N7FollowUpCloseForm`, `N7FollowUpStatusCell`, `n7-follow-up*`, `api/n7/devices/[sn]`, `api/n7/follow-up/photos`, `api/n7/notifications`, `N7NotificationsView` |
| N7 关单外推 | `outbound-notifier.ts`（企微 Webhook）；钩在 `notifyManagerFollowUpDone` 后 |
| N7 队员开号 / 去重 | `ManagerTeamPanel`, `api/admin/team`, `team-sales.ts`, `dedupe-team-sales.ts`, `backfill-sales-login.ts` |
| N7 设备挂靠 | `findN7SalesInIndexes`, `n7-excel-importer.ts`, `relink-sales-devices.ts` |
| 小绿盒沉睡/考核/待办 | `xlv-rules.ts`, `xlv-device-display.ts`, `services/xlv/assessment.ts`, `services/xlv/analytics.ts`, `services/xlv/today.ts`, `services/xlv/follow-up.ts` |
| 小绿盒关单回告经理 | `xlv-follow-up.ts`, `services/xlv/notifications.ts`, `api/xlv/notifications`, `XlvNotificationsView`, `xlv-notifications-client.ts` |
| 小绿盒导入 | `xlv-excel-parser.ts`, `xlv-excel-importer.ts`, `xlv-raw-bulk.ts`, `heavy-import-job.ts`, `import-upload-client.ts`；入口 `/xlv/admin/import`；**大表故障见 §15.7** |
| 权限/越权 | `permissions.ts`, `manager-scope.ts`, `business-lines.ts`, `n7-scope.ts`, `xlv-scope.ts` |
| 指标不对 | `business-rules.ts`, `analytics.ts`（小蓝环）/ `services/n7/analytics.ts`（N7）/ `services/xlv/analytics.ts`（小绿盒） |
| 导入失败 | `excel-parser.ts`, `excel-importer.ts`, `n7-excel-importer.ts`, `xlv-excel-*.ts`, `xlv-raw-bulk.ts`；小绿盒大表见 **§15.7** |
| 台账筛选 | `ledger-url.ts`, `LedgerView.tsx`, `buildLedgerWhere` |
| 日期默认值 | `ledger-date.ts` → `getCurrentMonthRange()` |
| UI 不一致 | `notion.tsx`, 对照 `/xlh` 或 `/xlh/ledger` 页面 |

---

*如有架构级变更，请同步更新本文档与 README.md。*
