"use client";

import { useEffect, useMemo, useState } from "react";
import { EnableSuccessModal } from "@/components/admin/EnableSuccessModal";
import { ADMIN_TARGET_RELOGIN_HINT, ENABLE_NEXT_STEPS } from "@/lib/account-lifecycle";
import { LIFECYCLE_LABELS, STATUS_LABELS } from "@/lib/constants";

interface PlatformIdentity {
  jobAccountName: string;
  personalPid: string;
}

interface TeamMember {
  id: string;
  username: string;
  name: string;
  status: string;
  accountLifecycle: string;
  suggestedUsername: string;
  identityCount: number;
  identities: PlatformIdentity[];
}

type ActionMode = "enable" | "reset" | null;
type TeamTab = "all" | "pending" | "disabled";

interface EnableSuccessState {
  name: string;
  username: string;
  password: string;
}

const TAB_LABELS: Record<TeamTab, string> = {
  all: "全部",
  pending: "待认证",
  disabled: "已停用",
};

export default function AdminTeamPage() {
  const [roster, setRoster] = useState<TeamMember[]>([]);
  const [teamName, setTeamName] = useState("");
  const [tab, setTab] = useState<TeamTab>("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [actionPassword, setActionPassword] = useState("123456");
  const [createForm, setCreateForm] = useState({ name: "", password: "123456" });
  const [creating, setCreating] = useState(false);
  const [enableSuccess, setEnableSuccess] = useState<EnableSuccessState | null>(null);
  const [expandedIdentityIds, setExpandedIdentityIds] = useState<Set<string>>(new Set());

  const tabCounts = useMemo(
    () => ({
      all: roster.length,
      pending: roster.filter((m) => m.accountLifecycle === "PENDING_ONBOARDING").length,
      disabled: roster.filter((m) => m.status === "DISABLED").length,
    }),
    [roster]
  );

  const filteredRoster = useMemo(() => {
    if (tab === "pending") {
      return roster.filter((m) => m.accountLifecycle === "PENDING_ONBOARDING");
    }
    if (tab === "disabled") {
      return roster.filter((m) => m.status === "DISABLED");
    }
    return roster;
  }, [roster, tab]);

  function clearAction() {
    setActionUserId(null);
    setActionMode(null);
    setActionPassword("123456");
  }

  async function load() {
    const res = await fetch("/api/admin/team");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "加载失败");
      return;
    }
    setRoster(data.roster ?? []);
    setTeamName(data.teamName ?? "");
  }

  useEffect(() => {
    load();
  }, []);

  async function handleEnable(member: TeamMember) {
    setError("");
    setMessage("");
    const res = await fetch(`/api/admin/users/${member.id}/enable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: actionPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "开通失败");
      return;
    }
    setEnableSuccess({
      name: member.name,
      username: data.user.username,
      password: actionPassword,
    });
    clearAction();
    load();
  }

  async function handleResetPassword(member: TeamMember) {
    setError("");
    setMessage("");
    const res = await fetch(`/api/admin/users/${member.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: actionPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "重置失败");
      return;
    }
    setMessage(
      `已重置 ${member.name}（${member.username}）的登录密码。${data.requiresRelogin ? ADMIN_TARGET_RELOGIN_HINT : ""}`
    );
    clearAction();
    load();
  }

  async function handleStatusChange(member: TeamMember, status: "ACTIVE" | "DISABLED") {
    setError("");
    setMessage("");
    const label = status === "DISABLED" ? "停用" : "启用";
    if (!window.confirm(`确定要${label} ${member.name} 的账号吗？`)) return;

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
    setMessage(
      `已${label} ${member.name}${data.requiresRelogin ? `。${ADMIN_TARGET_RELOGIN_HINT}` : ""}`
    );
    clearAction();
    load();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    setMessage("");

    const password = createForm.password;
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: createForm.name,
        username: "pending",
        password: createForm.password,
        role: "SALES",
      }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "创建失败");
      return;
    }
    setEnableSuccess({
      name: data.user.name,
      username: data.user.username,
      password,
    });
    setCreateForm({ name: "", password: "123456" });
    load();
  }

  function toggleIdentityExpand(memberId: string) {
    setExpandedIdentityIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  function renderIdentities(member: TeamMember) {
    if (member.identityCount === 0) {
      return <span className="text-gray-400">-</span>;
    }

    const expanded = expandedIdentityIds.has(member.id);
    const preview = member.identities.slice(0, expanded ? member.identities.length : 2);

    return (
      <div className="space-y-1 min-w-[140px]">
        <p className="text-xs text-gray-500">{member.identityCount} 个作业账号</p>
        <ul className="space-y-0.5">
          {preview.map((identity) => (
            <li key={`${identity.jobAccountName}-${identity.personalPid}`} className="text-xs">
              <span className="font-mono text-gray-800">{identity.jobAccountName}</span>
              {identity.personalPid && (
                <span className="text-gray-400 ml-1">({identity.personalPid})</span>
              )}
            </li>
          ))}
        </ul>
        {member.identityCount > 2 && (
          <button
            type="button"
            onClick={() => toggleIdentityExpand(member.id)}
            className="text-xs text-[#165DFF] hover:underline"
          >
            {expanded ? "收起" : `展开全部 ${member.identityCount} 个`}
          </button>
        )}
      </div>
    );
  }

  function renderActions(member: TeamMember) {
    const isTarget = actionUserId === member.id;
    const hasLogin = member.accountLifecycle !== "IMPORTED";

    if (isTarget && actionMode === "enable") {
      return (
        <div className="flex flex-col gap-2 min-w-[180px]">
          <p className="text-xs text-gray-500">
            建议登录名：<span className="font-mono">{member.suggestedUsername}</span>
          </p>
          <input
            type="password"
            value={actionPassword}
            onChange={(e) => setActionPassword(e.target.value)}
            className="border rounded px-2 py-1 text-xs"
            placeholder="初始密码"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleEnable(member)}
              className="text-xs text-white bg-[#165DFF] px-2 py-1 rounded"
            >
              确认开通
            </button>
            <button type="button" onClick={clearAction} className="text-xs text-gray-500">
              取消
            </button>
          </div>
        </div>
      );
    }

    if (isTarget && actionMode === "reset") {
      return (
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={actionPassword}
            onChange={(e) => setActionPassword(e.target.value)}
            className="border rounded px-2 py-1 text-xs w-24"
            placeholder="新密码"
          />
          <button
            type="button"
            onClick={() => handleResetPassword(member)}
            className="text-xs text-white bg-[#165DFF] px-2 py-1 rounded"
          >
            确认
          </button>
          <button type="button" onClick={clearAction} className="text-xs text-gray-500">
            取消
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {member.accountLifecycle === "IMPORTED" && tab !== "disabled" && (
          <button
            type="button"
            onClick={() => {
              setActionUserId(member.id);
              setActionMode("enable");
              setActionPassword("123456");
            }}
            className="text-xs text-[#165DFF] hover:underline"
          >
            开通账号
          </button>
        )}
        {hasLogin && member.status !== "RESIGNED" && tab !== "pending" && (
          <button
            type="button"
            onClick={() => {
              setActionUserId(member.id);
              setActionMode("reset");
              setActionPassword("123456");
            }}
            className="text-xs text-[#165DFF] hover:underline"
          >
            重置密码
          </button>
        )}
        {hasLogin && member.status === "ACTIVE" && tab !== "pending" && (
          <button
            type="button"
            onClick={() => handleStatusChange(member, "DISABLED")}
            className="text-xs text-red-600 hover:underline"
          >
            停用账号
          </button>
        )}
        {hasLogin && member.status === "DISABLED" && (
          <button
            type="button"
            onClick={() => handleStatusChange(member, "ACTIVE")}
            className="text-xs text-green-600 hover:underline"
          >
            启用账号
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EnableSuccessModal
        open={enableSuccess !== null}
        onClose={() => setEnableSuccess(null)}
        name={enableSuccess?.name ?? ""}
        username={enableSuccess?.username ?? ""}
        password={enableSuccess?.password ?? ""}
        nextSteps={ENABLE_NEXT_STEPS.sales}
      />

      <div>
        <h1 className="text-xl font-semibold text-gray-900">团队管理</h1>
        {teamName && <p className="text-sm text-gray-500 mt-1">{teamName}</p>}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-900 space-y-1">
        <p>
          Excel 导入的业务员默认为「未开通」。在此为其<strong>开通账号</strong>（自动生成拼音登录名 + 设置密码）。
        </p>
        <p>业务员首次登录须绑定<strong>作业账号 + 个人 PID</strong>，完成后方可查看业务数据。</p>
        <p>
          「待认证」为已开通但未完成身份绑定；「已停用」账号可在此<strong>启用</strong>。
        </p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 max-w-lg">
        <h2 className="text-sm font-medium text-gray-700 mb-4">新增业务员</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <input
            required
            placeholder="中文姓名"
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <input
            required
            type="password"
            placeholder="初始密码"
            value={createForm.password}
            onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="bg-[#165DFF] text-white px-4 py-2 rounded-lg text-sm disabled:opacity-60"
          >
            {creating ? "创建中…" : "创建并开通"}
          </button>
        </form>
      </div>

      {(error || message) && (
        <div
          className={`rounded-xl p-4 text-sm ${
            error ? "bg-red-50 text-red-700 border border-red-100" : "bg-green-50 text-green-700 border border-green-100"
          }`}
        >
          {error || message}
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200">
        {(Object.keys(TAB_LABELS) as TeamTab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              clearAction();
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? "border-[#165DFF] text-[#165DFF]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {TAB_LABELS[key]}
            <span className="ml-1.5 text-xs text-gray-400">({tabCounts[key]})</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-4 py-3">登录名</th>
              <th className="text-left px-4 py-3">姓名</th>
              <th className="text-left px-4 py-3">开通状态</th>
              <th className="text-left px-4 py-3">账号状态</th>
              <th className="text-left px-4 py-3">绑定作业账号</th>
              <th className="text-left px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredRoster.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  {tab === "pending"
                    ? "暂无待认证成员"
                    : tab === "disabled"
                      ? "暂无已停用成员"
                      : "暂无团队成员"}
                </td>
              </tr>
            ) : (
              filteredRoster.map((member) => (
                <tr key={member.id} className="border-t border-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {member.accountLifecycle === "IMPORTED" ? (
                      <span className="text-gray-400">{member.suggestedUsername}</span>
                    ) : (
                      member.username
                    )}
                  </td>
                  <td className="px-4 py-2.5">{member.name}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        member.accountLifecycle === "IMPORTED"
                          ? "text-amber-600"
                          : member.accountLifecycle === "PENDING_ONBOARDING"
                            ? "text-blue-600"
                            : "text-green-600"
                      }
                    >
                      {LIFECYCLE_LABELS[member.accountLifecycle] ?? member.accountLifecycle}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        member.status === "ACTIVE"
                          ? "text-green-600"
                          : member.status === "DISABLED"
                            ? "text-red-600"
                            : "text-gray-500"
                      }
                    >
                      {STATUS_LABELS[member.status] ?? member.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{renderIdentities(member)}</td>
                  <td className="px-4 py-2.5">{renderActions(member)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
