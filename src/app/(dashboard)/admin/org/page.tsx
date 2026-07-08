"use client";

import { useEffect, useMemo, useState } from "react";
import { EnableSuccessModal } from "@/components/admin/EnableSuccessModal";
import { ADMIN_TARGET_RELOGIN_HINT, ENABLE_NEXT_STEPS } from "@/lib/account-lifecycle";
import { LIFECYCLE_LABELS, ROLE_LABELS, STATUS_LABELS } from "@/lib/constants";

interface UserRow {
  id: string;
  username: string;
  name: string;
  role: string;
  status: string;
  accountLifecycle: string;
  team: { name: string } | null;
  manager: { name: string } | null;
}

type ActionMode = "enable" | "reset" | null;
type OrgTab = "all" | "pending" | "disabled";

interface EnableSuccessState {
  name: string;
  username: string;
  password: string;
}

const TAB_LABELS: Record<OrgTab, string> = {
  all: "全部",
  pending: "待认证",
  disabled: "已停用",
};

export default function AdminOrgPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [tab, setTab] = useState<OrgTab>("all");
  const [form, setForm] = useState({
    username: "",
    password: "123456",
    name: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [actionPassword, setActionPassword] = useState("123456");
  const [enableSuccess, setEnableSuccess] = useState<EnableSuccessState | null>(null);

  const managers = useMemo(() => users.filter((user) => user.role === "MANAGER"), [users]);

  const tabCounts = useMemo(
    () => ({
      all: managers.length,
      pending: managers.filter((user) => user.accountLifecycle === "PENDING_ONBOARDING").length,
      disabled: managers.filter((user) => user.status === "DISABLED").length,
    }),
    [managers]
  );

  const filteredUsers = useMemo(() => {
    if (tab === "pending") {
      return users.filter(
        (user) => user.role === "MANAGER" && user.accountLifecycle === "PENDING_ONBOARDING"
      );
    }
    if (tab === "disabled") {
      return users.filter((user) => user.role === "MANAGER" && user.status === "DISABLED");
    }
    return users;
  }, [users, tab]);

  function clearAction() {
    setActionUserId(null);
    setActionMode(null);
    setActionPassword("123456");
  }

  function startAction(userId: string, mode: ActionMode) {
    setActionUserId(userId);
    setActionMode(mode);
    setActionPassword("123456");
    setError("");
  }

  async function load() {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(data.users ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        role: "MANAGER",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "创建失败");
      return;
    }
    setEnableSuccess({
      name: data.user.name,
      username: data.user.username,
      password: form.password,
    });
    setForm({ username: "", password: "123456", name: "" });
    load();
  }

  async function handleEnable(user: UserRow) {
    setError("");
    setMessage("");
    const res = await fetch(`/api/admin/users/${user.id}/enable`, {
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
      name: user.name,
      username: data.user.username,
      password: actionPassword,
    });
    clearAction();
    load();
  }

  async function handleCompleteOnboarding(user: UserRow) {
    setError("");
    setMessage("");
    if (
      !window.confirm(
        `确定激活 ${user.name}（${user.username}）吗？无需填写手机/邮箱，对方可立即使用经理端。`
      )
    ) {
      return;
    }

    const res = await fetch(`/api/admin/users/${user.id}/complete-onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "激活失败");
      return;
    }
    setMessage(
      `已激活 ${user.name}（${user.username}），对方可正常使用经理端。${ADMIN_TARGET_RELOGIN_HINT}`
    );
    clearAction();
    load();
  }

  async function handleResetPassword(user: UserRow) {
    setError("");
    setMessage("");
    const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: actionPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "重置失败");
      return;
    }
    setMessage(`已重置 ${user.name}（${user.username}）的登录密码。${ADMIN_TARGET_RELOGIN_HINT}`);
    clearAction();
    load();
  }

  async function handleStatusChange(user: UserRow, status: "ACTIVE" | "DISABLED") {
    setError("");
    setMessage("");
    const label = status === "DISABLED" ? "停用" : "启用";
    if (!window.confirm(`确定要${label} ${user.name}（${user.username}）的账号吗？`)) return;

    const res = await fetch(`/api/admin/users/${user.id}/status`, {
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
      `已${label} ${user.name}（${user.username}）。${data.requiresRelogin ? ADMIN_TARGET_RELOGIN_HINT : ""}`
    );
    clearAction();
    load();
  }

  function renderManagerActions(user: UserRow, currentTab: OrgTab) {
    const isActionTarget = actionUserId === user.id;
    const hasLogin = user.accountLifecycle !== "IMPORTED";

    if (isActionTarget && actionMode === "enable") {
      return (
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={actionPassword}
            onChange={(e) => setActionPassword(e.target.value)}
            className="border rounded px-2 py-1 text-xs w-24"
            placeholder="密码"
          />
          <button
            type="button"
            onClick={() => handleEnable(user)}
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

    if (isActionTarget && actionMode === "reset") {
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
            onClick={() => handleResetPassword(user)}
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
        {user.accountLifecycle === "IMPORTED" && currentTab !== "disabled" && (
          <button
            type="button"
            onClick={() => startAction(user.id, "enable")}
            className="text-xs text-[#165DFF] hover:underline"
          >
            开通账号
          </button>
        )}
        {user.accountLifecycle === "PENDING_ONBOARDING" && (
          <button
            type="button"
            onClick={() => handleCompleteOnboarding(user)}
            className="text-xs text-[#165DFF] hover:underline"
          >
            完成认证
          </button>
        )}
        {hasLogin && user.status !== "RESIGNED" && currentTab !== "pending" && (
          <button
            type="button"
            onClick={() => startAction(user.id, "reset")}
            className="text-xs text-[#165DFF] hover:underline"
          >
            重置密码
          </button>
        )}
        {hasLogin && user.status === "ACTIVE" && currentTab !== "pending" && (
          <button
            type="button"
            onClick={() => handleStatusChange(user, "DISABLED")}
            className="text-xs text-red-600 hover:underline"
          >
            停用账号
          </button>
        )}
        {hasLogin && user.status === "DISABLED" && (
          <button
            type="button"
            onClick={() => handleStatusChange(user, "ACTIVE")}
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
        nextSteps={ENABLE_NEXT_STEPS.manager}
      />

      <h1 className="text-xl font-semibold text-gray-900">组织人员管理</h1>

      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-900 space-y-1">
        <p>
          Excel 导入的经理默认为「未开通」。管理员<strong>开通账号</strong>时设置密码即可，开通后状态为「已认证」，可立即登录经理端。
        </p>
        <p>
          「待认证」为历史经理账号；「已停用」账号可在此<strong>启用</strong>。重置密码、停用/启用后，{ADMIN_TARGET_RELOGIN_HINT}
        </p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 max-w-lg">
        <h2 className="text-sm font-medium text-gray-700 mb-4">创建区域经理</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <input
            required
            placeholder="登录名"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="姓名"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <input
            required
            type="password"
            placeholder="密码"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-[#165DFF] text-white px-4 py-2 rounded-lg text-sm">
            创建
          </button>
        </form>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        {message && <p className="text-green-600 text-sm mt-2">{message}</p>}
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(Object.keys(TAB_LABELS) as OrgTab[]).map((key) => (
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
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-4 py-3">登录名</th>
              <th className="text-left px-4 py-3">姓名</th>
              <th className="text-left px-4 py-3">角色</th>
              <th className="text-left px-4 py-3">开通状态</th>
              <th className="text-left px-4 py-3">账号状态</th>
              <th className="text-left px-4 py-3">团队</th>
              <th className="text-left px-4 py-3">上级</th>
              <th className="text-left px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  {tab === "pending"
                    ? "暂无待认证经理"
                    : tab === "disabled"
                      ? "暂无已停用经理"
                      : "暂无人员数据"}
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => (
              <tr key={u.id} className="border-t border-gray-50">
                <td className="px-4 py-2.5 font-mono text-xs">{u.username}</td>
                <td className="px-4 py-2.5">{u.name}</td>
                <td className="px-4 py-2.5">{ROLE_LABELS[u.role] ?? u.role}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      u.accountLifecycle === "IMPORTED"
                        ? "text-amber-600"
                        : u.accountLifecycle === "PENDING_ONBOARDING"
                          ? "text-blue-600"
                          : "text-green-600"
                    }
                  >
                    {LIFECYCLE_LABELS[u.accountLifecycle] ?? u.accountLifecycle}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      u.status === "ACTIVE"
                        ? "text-green-600"
                        : u.status === "DISABLED"
                          ? "text-red-600"
                          : "text-gray-500"
                    }
                  >
                    {STATUS_LABELS[u.status] ?? u.status}
                  </span>
                </td>
                <td className="px-4 py-2.5">{u.team?.name ?? "-"}</td>
                <td className="px-4 py-2.5">{u.manager?.name ?? "-"}</td>
                <td className="px-4 py-2.5">
                  {u.role === "MANAGER" ? renderManagerActions(u, tab) : "-"}
                </td>
              </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
