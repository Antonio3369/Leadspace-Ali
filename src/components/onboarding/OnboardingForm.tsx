"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import type { UserRole } from "@/generated/prisma/client";

interface IdentityRow {
  jobAccountName: string;
  personalPid: string;
}

interface OnboardingFormProps {
  role: UserRole;
}

export function OnboardingForm({ role }: OnboardingFormProps) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [identities, setIdentities] = useState<IdentityRow[]>([
    { jobAccountName: "", personalPid: "" },
  ]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile?.phone) setPhone(data.profile.phone);
        if (data.profile?.email) setEmail(data.profile.email);
        if (data.identities?.length) {
          setIdentities(data.identities);
        }
        setPrefilled(true);
      })
      .catch(() => setPrefilled(true));
  }, []);

  function updateIdentity(index: number, field: keyof IdentityRow, value: string) {
    setIdentities((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function addIdentity() {
    setIdentities((rows) => [...rows, { jobAccountName: "", personalPid: "" }]);
  }

  function removeIdentity(index: number) {
    setIdentities((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const payload =
      role === "MANAGER"
        ? { phone, email }
        : role === "SALES"
          ? { identities }
          : {};

    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "提交失败");
      return;
    }

    await signOut({ redirect: false });
    window.location.href = data.redirectTo ?? "/login?onboarded=1";
  }

  if (!prefilled) {
    return <p className="text-sm text-gray-500">加载中…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {role === "MANAGER" && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">手机号码</label>
            <input
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="用于接收业务预警通知"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">邮箱地址</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="用于接收业务预警通知"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </>
      )}

      {role === "SALES" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            请绑定您在支付宝后台的作业账号与个人 PID，用于匹配 P 站业务数据。可绑定多个作业账号。
          </p>
          {identities.map((row, index) => (
            <div
              key={index}
              className="border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50/50"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">身份 {index + 1}</span>
                {identities.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeIdentity(index)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    删除
                  </button>
                )}
              </div>
              <input
                required
                value={row.jobAccountName}
                onChange={(e) => updateIdentity(index, "jobAccountName", e.target.value)}
                placeholder="作业账号（P 站「员工名称」）"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
              />
              <input
                required
                value={row.personalPid}
                onChange={(e) => updateIdentity(index, "personalPid", e.target.value)}
                placeholder="个人 PID"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={addIdentity}
            className="text-sm text-[#165DFF] hover:underline"
          >
            + 添加作业账号
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[#165DFF] text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
      >
        {loading ? "提交中…" : "完成认证并进入系统"}
      </button>
    </form>
  );
}
