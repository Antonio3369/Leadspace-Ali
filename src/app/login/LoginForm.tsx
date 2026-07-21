"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { NotionAlert, NotionButton, NotionInput } from "@/components/ui/notion";
import { NotionPasswordInput } from "@/components/ui/NotionPasswordInput";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // 进页时锁住提示，避免清理 query 后闪一下就消失
  const [banner] = useState(() => {
    if (searchParams.get("disabled") === "1") return "disabled" as const;
    if (searchParams.get("onboarded") === "1") return "onboarded" as const;
    if (searchParams.get("passwordChanged") === "1") return "passwordChanged" as const;
    if (searchParams.get("session") === "refresh") return "session" as const;
    return null;
  });

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (
      params.has("disabled") ||
      params.has("session") ||
      params.has("passwordChanged") ||
      params.has("onboarded")
    ) {
      params.delete("disabled");
      params.delete("session");
      params.delete("passwordChanged");
      params.delete("onboarded");
      const qs = params.toString();
      router.replace(qs ? `/login?${qs}` : "/login");
    }
  }, [router, searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const checkRes = await fetch("/api/auth/check-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const checkData = await checkRes.json();

      if (!checkData.ok) {
        setError(checkData.message ?? "账号或密码错误，或账号已停用");
        setLoading(false);
        return;
      }

      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("账号或密码错误");
        setLoading(false);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("登录失败，请稍后重试");
      setLoading(false);
    }
  }

  return (
    <div
      id="app-scroll"
      className="h-full min-h-0 flex-1 overflow-y-auto overflow-x-hidden flex items-center justify-center bg-[#f4f6f9] px-4 py-10 [-webkit-overflow-scrolling:touch]"
    >
      <div className="w-full max-w-[400px] min-w-0">
        <div className="mb-6 space-y-1 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#eff6ff] text-[#2563eb] text-lg font-bold mb-2">
            L
          </div>
          <p className="text-[0.78rem] font-semibold tracking-wide uppercase text-[#94a3b8]">
            Leadspace.Alipay
          </p>
          <h1 className="text-2xl font-bold text-[#111827] tracking-tight">数据管理</h1>
          <p className="text-sm text-[#64748b]">请登录您的账号</p>
        </div>

        <div className="rounded-[14px] border border-[#eef2f7] bg-white shadow-sm p-6 sm:p-8 space-y-4">
          {banner === "disabled" && (
            <NotionAlert tone="error">账号已停用，请联系管理员</NotionAlert>
          )}
          {banner === "onboarded" && (
            <NotionAlert tone="success">实名认证已完成，请重新登录</NotionAlert>
          )}
          {banner === "session" && (
            <NotionAlert tone="warning">账号状态已更新，请重新登录</NotionAlert>
          )}
          {banner === "passwordChanged" && (
            <NotionAlert tone="success">密码已更新，请使用新密码登录</NotionAlert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#111827] mb-1.5">账号</label>
              <NotionInput
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入账号"
                className="w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#111827] mb-1.5">密码</label>
              <NotionPasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="w-full"
                required
                autoComplete="current-password"
              />
            </div>

            {error && <NotionAlert tone="error">{error}</NotionAlert>}

            <NotionButton type="submit" disabled={loading} className="w-full">
              {loading ? "登录中..." : "登录"}
            </NotionButton>
          </form>
        </div>

        <p className="text-xs text-[#94a3b8] mt-5 text-center leading-relaxed">
          {process.env.NODE_ENV === "production"
            ? "仅经理与事业部负责人可登录；业务员为数据账号"
            : "开发环境：admin / 123456；业务员账号不支持登录"}
        </p>
      </div>
    </div>
  );
}
