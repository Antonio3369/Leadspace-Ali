"use client";

import { useEffect, useMemo, useState } from "react";
import { EnableSuccessModal } from "@/components/admin/EnableSuccessModal";
import {
  NotionAlert,
  NotionButton,
  NotionCallout,
  NotionInput,
  NotionTabs,
  PageHeader,
  PageShell,
  notion,
} from "@/components/ui/notion";

interface TeamMember {
  id: string;
  name: string;
  username: string;
  status: string;
  accountLifecycle: string;
  hasLogin: boolean;
  identityCount: number;
}

type TeamTab = "active" | "disabled";

interface CredSuccess {
  name: string;
  username: string;
  password: string;
  title: string;
}

export function ManagerTeamPanel({
  backHref,
  title = "人员管理",
}: {
  backHref?: string;
  title?: string;
}) {
  const [roster, setRoster] = useState<TeamMember[]>([]);
  const [tab, setTab] = useState<TeamTab>("active");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [credSuccess, setCredSuccess] = useState<CredSuccess | null>(null);
  const [search, setSearch] = useState("");

  const tabCounts = useMemo(
    () => ({
      active: roster.filter((m) => m.status !== "DISABLED").length,
      disabled: roster.filter((m) => m.status === "DISABLED").length,
    }),
    [roster]
  );

  const filteredRoster = useMemo(() => {
    const byTab =
      tab === "disabled"
        ? roster.filter((m) => m.status === "DISABLED")
        : roster.filter((m) => m.status !== "DISABLED");
    const q = search.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.username.toLowerCase().includes(q)
    );
  }, [roster, tab, search]);

  async function load() {
    const res = await fetch("/api/admin/team");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "加载失败");
      return;
    }
    setRoster(data.roster ?? []);
    if (data.backfillHint) {
      setMessage(data.backfillHint);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setCreating(true);
    try {
      const res = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name: createName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "新建失败");
        return;
      }
      setCredSuccess({
        title: "新建帐号成功",
        name: data.user.name,
        username: data.user.username,
        password: data.user.password,
      });
      if (data.nameHint) setMessage(data.nameHint);
      setCreateName("");
      load();
    } finally {
      setCreating(false);
    }
  }

  async function handleReset(member: TeamMember) {
    setError("");
    setMessage("");
    const enabling = !member.hasLogin;
    const confirmMsg = enabling
      ? `为 ${member.name} 开通登录？初始密码 123456，首次登录须改密。`
      : `将 ${member.name} 的密码重置为 123456，并要求下次登录改密？`;
    if (!window.confirm(confirmMsg)) {
      return;
    }
    const res = await fetch("/api/admin/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", userId: member.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? (enabling ? "开通失败" : "重置失败"));
      return;
    }
    setCredSuccess({
      title: enabling ? "登录已开通" : "密码已重置",
      name: data.user.name,
      username: data.user.username,
      password: data.user.password,
    });
    load();
  }

  async function handleStatusChange(member: TeamMember, status: "ACTIVE" | "DISABLED") {
    setError("");
    setMessage("");
    const label = status === "DISABLED" ? "停用" : "启用";
    if (!window.confirm(`确定要${label} ${member.name}？`)) return;

    const res = await fetch(`/api/admin/users/${member.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? `${label}失败`);
      return;
    }
    setMessage(`已${label} ${member.name}`);
    load();
  }

  async function handleDelete(member: TeamMember) {
    setError("");
    setMessage("");
    const first = window.confirm(
      `确定要彻底删除队员「${member.name}」（登录名 ${member.username}）？\n\n设备等业务数据会保留，但不再归属该账号。此操作不可恢复。`
    );
    if (!first) return;
    const second = window.confirm(
      `请再次确认：彻底删除「${member.name}」？\n\n删除后无法找回该登录账号。`
    );
    if (!second) return;

    const res = await fetch("/api/admin/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", userId: member.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "删除失败");
      return;
    }
    const devices = Number(data.user?.deviceCount) || 0;
    setMessage(
      devices > 0
        ? `已彻底删除 ${data.user.name}；其名下 ${devices} 台设备已解除账号挂靠（数据仍保留）。`
        : `已彻底删除 ${data.user.name}`
    );
    load();
  }

  return (
    <PageShell>
      <EnableSuccessModal
        open={credSuccess !== null}
        onClose={() => setCredSuccess(null)}
        title={credSuccess?.title ?? "操作成功"}
        name={credSuccess?.name ?? ""}
        username={credSuccess?.username ?? ""}
        password={credSuccess?.password ?? ""}
        nextSteps="请告知对方登录名与密码；首次登录须修改密码。"
      />

      <PageHeader title={title} kicker="" backHref={backHref} showBack={Boolean(backHref)} />

      <NotionCallout>
        <p>
          按姓名为本队 N7 队员开号：登录名自动拼音，初始密码 <strong>123456</strong>
          ，首次登录须改密。默认仅开通 <strong>N7</strong>。管理员上传 N7 人员名单也会自动开通登录。
          「在职」只表示未停用；能否登录以「可登录」标记为准。
          本队完全同名双号：仅当一侧有数据、其余为空时自动停用空号；双侧都有数据则跳过；近音不同字不合并。
          要彻底删除须先<strong>停用</strong>，再到「已停用」里操作（须二次确认）。
        </p>
      </NotionCallout>

      <form
        onSubmit={handleCreate}
        className="flex flex-col sm:flex-row gap-2 sm:items-end max-w-md"
      >
        <label className="flex-1 space-y-1">
          <span className="text-xs text-[#64748b]">
            新增队员（请填
            <span className="text-sm font-semibold text-[#c41e3a]">汉字</span>
            姓名）
          </span>
          <input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="例如：张三"
            className={`${notion.input} w-full`}
            maxLength={20}
            autoComplete="off"
            required
          />
        </label>
        <NotionButton type="submit" disabled={creating || !createName.trim()}>
          {creating ? "新建中…" : "新建帐号"}
        </NotionButton>
      </form>

      {error && <NotionAlert tone="error">{error}</NotionAlert>}
      {message && <NotionAlert tone="success">{message}</NotionAlert>}

      <NotionTabs
        tabs={(["active", "disabled"] as TeamTab[]).map((key) => ({
          key,
          label: key === "active" ? "在职" : "已停用",
          count: tabCounts[key],
        }))}
        active={tab}
        onChange={setTab}
      />

      <NotionInput
        placeholder="搜索姓名 / 登录名"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:w-56"
        aria-label="搜索队员"
      />

      <div className={notion.tableScroll}>
        <table className="w-full text-sm min-w-[360px] table-fixed">
          <colgroup>
            <col className="w-[7rem]" />
            <col className="w-[8.5rem]" />
            <col className="w-[4.5rem]" />
            <col />
          </colgroup>
          <thead className={notion.thead}>
            <tr>
              <th className="text-left pl-4 pr-1 py-3 whitespace-nowrap">姓名</th>
              <th className="text-left pl-1 pr-3 py-3 whitespace-nowrap">登录名</th>
              <th className="text-left px-2 py-3 whitespace-nowrap">登录</th>
              <th className="text-left px-4 py-3 whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredRoster.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[#94a3b8]">
                  {search.trim()
                    ? "没有匹配的队员"
                    : tab === "disabled"
                      ? "暂无已停用成员"
                      : "暂无队员，请开号或上传人员名单"}
                </td>
              </tr>
            ) : (
              filteredRoster.map((member) => (
                <tr key={member.id} className={notion.row}>
                  <td className="pl-4 pr-1 py-2.5 whitespace-nowrap truncate">{member.name}</td>
                  <td className="pl-1 pr-3 py-2.5 font-mono text-xs whitespace-nowrap truncate">
                    {member.username}
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    <span
                      className={
                        member.hasLogin
                          ? "text-xs text-[#059669]"
                          : "text-xs text-[#b45309]"
                      }
                    >
                      {member.hasLogin ? "可登录" : "未开通"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {member.status !== "DISABLED" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleReset(member)}
                            className="text-xs text-[#2563eb] hover:underline"
                          >
                            {member.hasLogin ? "重置密码" : "开通登录"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(member, "DISABLED")}
                            className="text-xs text-red-600 hover:underline"
                          >
                            停用
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(member, "ACTIVE")}
                            className="text-xs text-green-600 hover:underline"
                          >
                            启用
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(member)}
                            className="text-xs text-[#94a3b8] hover:text-red-700 hover:underline"
                          >
                            彻底删除
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
