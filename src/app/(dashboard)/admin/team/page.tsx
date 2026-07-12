"use client";

import { useEffect, useMemo, useState } from "react";
import { STATUS_LABELS } from "@/lib/constants";
import {
  NotionAlert,
  NotionCallout,
  NotionTabs,
  PageHeader,
  PageShell,
  notion,
} from "@/components/ui/notion";

interface PlatformIdentity {
  jobAccountName: string;
  personalPid: string;
}

interface TeamMember {
  id: string;
  name: string;
  status: string;
  identityCount: number;
  identities: PlatformIdentity[];
}

type TeamTab = "all" | "disabled";

const TAB_LABELS: Record<TeamTab, string> = {
  all: "全部",
  disabled: "已停用",
};

export default function AdminTeamPage() {
  const [roster, setRoster] = useState<TeamMember[]>([]);
  const [tab, setTab] = useState<TeamTab>("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [expandedIdentityIds, setExpandedIdentityIds] = useState<Set<string>>(new Set());

  const tabCounts = useMemo(
    () => ({
      all: roster.length,
      disabled: roster.filter((m) => m.status === "DISABLED").length,
    }),
    [roster]
  );

  const filteredRoster = useMemo(() => {
    if (tab === "disabled") {
      return roster.filter((m) => m.status === "DISABLED");
    }
    return roster;
  }, [roster, tab]);

  async function load() {
    const res = await fetch("/api/admin/team");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "加载失败");
      return;
    }
    setRoster(data.roster ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleStatusChange(member: TeamMember, status: "ACTIVE" | "DISABLED") {
    setError("");
    setMessage("");
    const label = status === "DISABLED" ? "停用" : "启用";
    if (!window.confirm(`确定要${label} ${member.name} 的数据账号吗？`)) return;

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
      return <span className="text-[#94a3b8]">-</span>;
    }

    const expanded = expandedIdentityIds.has(member.id);
    const preview = member.identities.slice(0, expanded ? member.identities.length : 2);

    return (
      <div className="space-y-1 min-w-[140px]">
        <p className="text-xs text-[#64748b]">{member.identityCount} 个作业账号</p>
        <ul className="space-y-0.5">
          {preview.map((identity) => (
            <li key={`${identity.jobAccountName}-${identity.personalPid}`} className="text-xs">
              <span className="font-mono text-[#111827]">{identity.jobAccountName}</span>
              {identity.personalPid && (
                <span className="text-[#94a3b8] ml-1">({identity.personalPid})</span>
              )}
            </li>
          ))}
        </ul>
        {member.identityCount > 2 && (
          <button
            type="button"
            onClick={() => toggleIdentityExpand(member.id)}
            className="text-xs text-[#2563eb] hover:underline"
          >
            {expanded ? "收起" : `展开全部 ${member.identityCount} 个`}
          </button>
        )}
      </div>
    );
  }

  function renderActions(member: TeamMember) {
    if (member.status === "RESIGNED") {
      return <span className="text-xs text-[#94a3b8]">已离职</span>;
    }

    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {member.status === "ACTIVE" && (
          <button
            type="button"
            onClick={() => handleStatusChange(member, "DISABLED")}
            className="text-xs text-red-600 hover:underline"
          >
            停用
          </button>
        )}
        {member.status === "DISABLED" && (
          <button
            type="button"
            onClick={() => handleStatusChange(member, "ACTIVE")}
            className="text-xs text-green-600 hover:underline"
          >
            启用
          </button>
        )}
      </div>
    );
  }

  return (
    <PageShell>
      <PageHeader title="团队管理" kicker="" />

      <NotionCallout>
        <p>
          业务员为<strong>纯数据账号</strong>，由人员名单 Excel 导入，用于商户归属与业绩统计，<strong>不支持登录</strong>。
        </p>
        <p>在此可查看作业账号与 PID 绑定，或对离职/停用人员标记数据状态。</p>
      </NotionCallout>

      {error && <NotionAlert tone="error">{error}</NotionAlert>}
      {message && <NotionAlert tone="success">{message}</NotionAlert>}

      <NotionTabs
        tabs={(Object.keys(TAB_LABELS) as TeamTab[]).map((key) => ({
          key,
          label: TAB_LABELS[key],
          count: tabCounts[key],
        }))}
        active={tab}
        onChange={setTab}
      />

      <div className={notion.tableWrap}>
        <table className="w-full text-sm min-w-[640px]">
          <thead className={notion.thead}>
            <tr>
              <th className="text-left px-4 py-3">姓名</th>
              <th className="text-left px-4 py-3">数据状态</th>
              <th className="text-left px-4 py-3">账号状态</th>
              <th className="text-left px-4 py-3">绑定作业账号</th>
              <th className="text-left px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredRoster.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[#94a3b8]">
                  {tab === "disabled" ? "暂无已停用成员" : "暂无团队成员"}
                </td>
              </tr>
            ) : (
              filteredRoster.map((member) => (
                <tr key={member.id} className={notion.row}>
                  <td className="px-4 py-2.5">{member.name}</td>
                  <td className="px-4 py-2.5 text-green-600">数据账号</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        member.status === "ACTIVE"
                          ? "text-green-600"
                          : member.status === "DISABLED"
                            ? "text-red-600"
                            : "text-[#64748b]"
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
    </PageShell>
  );
}
