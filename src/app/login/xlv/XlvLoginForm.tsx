"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { xlvPath } from "@/lib/business-lines";
import { NotionAlert, NotionButton, NotionInput } from "@/components/ui/notion";
import { NotionPasswordInput } from "@/components/ui/NotionPasswordInput";

export default function XlvLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? xlvPath();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.has("disabled")) {
      params.delete("disabled");
      const qs = params.toString();
      router.replace(qs ? `/login/xlv?${qs}` : "/login/xlv");
    }
  }, [router, searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const checkRes = await fetch("/api/auth/check-xlv-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const checkData = await checkRes.json();
      if (!checkData.ok) {
        setError(checkData.message ?? "账号或密码错误");
        setLoading(false);
        return;
      }

      const result = await signIn("xlv", {
        username,
        password,
        rememberMe: rememberMe ? "true" : "false",
        redirect: false,
      });

      if (result?.error) {
        setError("账号或密码错误");
        setLoading(false);
        return;
      }

      const next =
        callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
          ? callbackUrl
          : xlvPath();
      window.location.assign(next);
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
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#dcfce7] text-[#16a34a] text-lg font-bold mb-2">
            微
          </div>
          <h1 className="text-2xl font-bold text-[#111827] tracking-tight">小绿盒登录</h1>
        </div>

        <div className="rounded-[14px] border border-[#eef2f7] bg-white shadow-sm p-6 sm:p-8 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#111827] mb-1.5">账号</label>
              <NotionInput
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="拼音登录名"
                className="w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#111827] mb-1.5">密码</label>
              <NotionPasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="初始密码 123456"
                className="w-full"
                required
                autoComplete="current-password"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-[#64748b] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-[#cbd5e1]"
              />
              记住我，30 天内免登录
            </label>

            {error && <NotionAlert tone="error">{error}</NotionAlert>}

            <NotionButton type="submit" disabled={loading} className="w-full">
              {loading ? "登录中..." : "登录"}
            </NotionButton>
          </form>
        </div>

        <p className="text-xs text-[#94a3b8] mt-5 text-center leading-relaxed">
          <Link href="/" className="text-[#16a34a] hover:underline">
            ← 返回平台选择
          </Link>
        </p>
      </div>
    </div>
  );
}
