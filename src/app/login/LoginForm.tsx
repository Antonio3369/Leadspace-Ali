"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { NotionAlert, NotionButton, NotionInput } from "@/components/ui/notion";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const onboarded = searchParams.get("onboarded") === "1";
  const sessionRefresh = searchParams.get("session") === "refresh";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.has("disabled") || params.has("session")) {
      params.delete("disabled");
      params.delete("session");
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
    <div className="min-h-screen flex items-center justify-center bg-[#f4f6f9] px-4 py-10">
      <div className="w-full max-w-[400px]">
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
          {onboarded && (
            <NotionAlert tone="success">实名认证已完成，请重新登录</NotionAlert>
          )}
          {sessionRefresh && (
            <NotionAlert tone="warning">账号状态已更新，请重新登录</NotionAlert>
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
              <NotionInput
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="w-full"
                required
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
            : "开发环境：Antonio / 123456；业务员账号不支持登录"}
        </p>
      </div>
    </div>
  );
}
