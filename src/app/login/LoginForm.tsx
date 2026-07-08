"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const onboarded = searchParams.get("onboarded") === "1";
  const disabled = searchParams.get("disabled") === "1";
  const sessionRefresh = searchParams.get("session") === "refresh";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA]">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-[#165DFF]">
            Leadspace 支付宝业务数据管理
          </h1>
          <p className="text-sm text-gray-500 mt-2">请登录您的账号</p>
        </div>

        {onboarded && (
          <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg mb-4 text-center">
            实名认证已完成，请重新登录
          </p>
        )}
        {disabled && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4 text-center">
            账号已停用或离职，无法登录
          </p>
        )}
        {sessionRefresh && (
          <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg mb-4 text-center">
            账号状态已更新，请重新登录
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              账号
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#165DFF]/30 focus:border-[#165DFF]"
              placeholder="请输入账号"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#165DFF]/30 focus:border-[#165DFF]"
              placeholder="请输入密码"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#165DFF] text-white py-2.5 rounded-lg font-medium hover:bg-[#165DFF]/90 disabled:opacity-60 transition-colors"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>

        <p className="text-xs text-gray-400 mt-6 text-center">
          {process.env.NODE_ENV === "production"
            ? "经理与业务员需由经理开通账号后登录"
            : "开发环境：管理员 Antonio / 123456；经理与业务员需由经理开通账号后登录"}
        </p>
      </div>
    </div>
  );
}
