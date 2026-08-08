"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readResponseJson } from "@/lib/fetch-json";
import { xlvPath } from "@/lib/business-lines";
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

type AccountTab = "active" | "disabled";

interface MemberAccountRow {
  id: string;
  username: string;
  name: string;
  managerName: string;
  operatorName: string;
  status: string;
  hasLogin: boolean;
}

interface CredSuccess {
  title: string;
  name: string;
  username: string;
  password: string;
}

export function XlvManagerTeamPanel({ backHref }: { backHref?: string }) {
  const [accounts, setAccounts] = useState<MemberAccountRow[]>([]);
  const [tab, setTab] = useState<AccountTab>("active");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [rosterRows, setRosterRows] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [credSuccess, setCredSuccess] = useState<CredSuccess | null>(null);

  const tabCounts = useMemo(
    () => ({
      active: accounts.filter((a) => a.status !== "DISABLED").length,
      disabled: accounts.filter((a) => a.status === "DISABLED").length,
    }),
    [accounts]
  );

  const filtered = useMemo(() => {
    const byTab =
      tab === "disabled"
        ? accounts.filter((a) => a.status === "DISABLED")
        : accounts.filter((a) => a.status !== "DISABLED");
    const q = search.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.username.toLowerCase().includes(q) ||
        a.operatorName.toLowerCase().includes(q)
    );
  }, [accounts, tab, search]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/xlv/team");
      const json = await readResponseJson<{
        error?: string;
        accounts?: MemberAccountRow[];
        rosterRows?: number;
        backfillHint?: string;
      }>(res, "加载队员");
      if (!res.ok) throw new Error(json.error || "加载失败");
      setAccounts(json.accounts ?? []);
      setRosterRows(Number(json.rosterRows) || 0);
      if (json.backfillHint) setMessage(json.backfillHint);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleReset(account: MemberAccountRow) {
    setError("");
    setMessage("");
    const enabling = !account.hasLogin;
    const confirmMsg = enabling
      ? `为 ${account.name} 开通登录？初始密码 123456，首次登录须改密。`
      : `将 ${account.name} 的密码重置为 123456，并要求下次登录改密？`;
    if (!window.confirm(confirmMsg)) return;

    const res = await fetch("/api/xlv/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", accountId: account.id }),
    });
    const data = await readResponseJson<{
      error?: string;
      user?: { name: string; username: string; password: string };
    }>(res, enabling ? "开通登录" : "重置密码");
    if (!res.ok) {
      setError(data.error ?? (enabling ? "开通失败" : "重置失败"));
      return;
    }
    if (!data.user) {
      setError(enabling ? "开通失败" : "重置失败");
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

  async function handleStatus(account: MemberAccountRow, status: "ACTIVE" | "DISABLED") {
    setError("");
    setMessage("");
    const label = status === "DISABLED" ? "停用" : "启用";
    if (!window.confirm(`确定要${label} ${account.name}？`)) return;

    const res = await fetch("/api/xlv/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", accountId: account.id, status }),
    });
    const data = await readResponseJson<{ error?: string }>(res, `${label}账号`);
    if (!res.ok) {
      setError(data.error ?? `${label}失败`);
      return;
    }
    setMessage(`已${label} ${account.name}`);
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
        nextSteps="请告知队员登录名与密码；首次登录须修改密码。"
      />

      <PageHeader
        title="队员管理"
        kicker="微信小绿盒"
        backHref={backHref}
        showBack={Boolean(backHref)}
        meta={
          <p className="text-sm text-[#64748b]">
            管理本队队员登录：重置密码、停用或启用。组织名册导入后会自动开号。
          </p>
        }
      />

      <NotionCallout>
        <p>
          登录名为姓名拼音（小绿盒内唯一，与支付宝 N7 账号无关）。初始密码{" "}
          <strong>123456</strong>，首次登录须改密。
        </p>
      </NotionCallout>

      {error ? <NotionAlert tone="error">{error}</NotionAlert> : null}
      {message ? <NotionAlert tone="success">{message}</NotionAlert> : null}

      <NotionTabs
        tabs={(["active", "disabled"] as AccountTab[]).map((key) => ({
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
        className="w-full sm:w-64"
        aria-label="搜索队员"
      />

      {loading ? (
        <p className="text-sm text-[#94a3b8] py-8 text-center">加载中…</p>
      ) : (
        <div className={notion.tableScroll}>
          <table className="w-full text-sm min-w-[420px] table-fixed">
            <colgroup>
              <col className="w-[6rem]" />
              <col className="w-[7rem]" />
              <col className="w-[4.5rem]" />
              <col className="w-[8rem]" />
            </colgroup>
            <thead className={notion.thead}>
              <tr>
                <th className="text-left pl-4 pr-1 py-3 whitespace-nowrap">姓名</th>
                <th className="text-left px-2 py-3 whitespace-nowrap">登录名</th>
                <th className="text-left px-2 py-3 whitespace-nowrap">登录</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[#94a3b8]">
                    {search.trim()
                      ? "没有匹配的队员"
                      : tab === "disabled"
                        ? "暂无已停用队员"
                        : rosterRows > 0
                          ? "名册有本队队员，正在补开账号…请刷新"
                          : "暂无队员，请确认组织名册已导入"}
                  </td>
                </tr>
              ) : (
                filtered.map((account) => (
                  <tr key={account.id} className={notion.row}>
                    <td className="pl-4 pr-1 py-2.5 truncate">{account.name}</td>
                    <td className="px-2 py-2.5 font-mono text-xs truncate">
                      {account.username}
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <span
                        className={
                          account.hasLogin
                            ? "text-xs text-[#059669]"
                            : "text-xs text-[#b45309]"
                        }
                      >
                        {account.hasLogin ? "可登录" : "未开通"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {account.status !== "DISABLED" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleReset(account)}
                              className="text-xs text-[#2563eb] hover:underline"
                            >
                              {account.hasLogin ? "重置密码" : "开通登录"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatus(account, "DISABLED")}
                              className="text-xs text-red-600 hover:underline"
                            >
                              停用
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStatus(account, "ACTIVE")}
                            className="text-xs text-green-600 hover:underline"
                          >
                            启用
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {backHref ? (
        <p className="text-xs text-[#94a3b8]">
          <Link href={backHref} className="text-[#2563eb] hover:underline">
            ← 返回我的
          </Link>
        </p>
      ) : null}
    </PageShell>
  );
}
