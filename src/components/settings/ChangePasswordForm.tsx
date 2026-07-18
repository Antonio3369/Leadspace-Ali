"use client";

import { useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { NotionAlert, NotionButton } from "@/components/ui/notion";
import { NotionPasswordInput } from "@/components/ui/NotionPasswordInput";

interface ChangePasswordFormProps {
  forced?: boolean;
}

export function ChangePasswordForm({ forced = false }: ChangePasswordFormProps) {
  // 锁定首登模式，避免改密成功后父级重渲染把 forced 打成 false、再次要求填「当前密码」
  const [isForced] = useState(forced);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [doneHint, setDoneHint] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDoneHint("");

    if (!isForced && !currentPassword) {
      setError("请输入当前密码");
      return;
    }
    if (newPassword.length < 6) {
      setError("新密码至少 6 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: isForced ? undefined : currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "修改失败");
        return;
      }

      // 首登强制改密：用新密码静默重登，刷新 JWT，避免中间件仍认为须改密而再挡一次
      if (isForced || data.forced) {
        setDoneHint("密码已更新，正在进入系统…");
        const username = data.username as string | undefined;
        if (username) {
          const result = await signIn("credentials", {
            username,
            password: newPassword,
            redirect: false,
          });
          if (!result?.error) {
            window.location.href = "/";
            return;
          }
        }
        await signOut({ redirect: false });
        window.location.href = "/login?passwordChanged=1";
        return;
      }

      // 自助改密：退出后用新密码登录更稳妥
      setDoneHint("密码已更新，请使用新密码重新登录");
      await signOut({ redirect: false });
      window.location.href = "/login?passwordChanged=1";
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md">
      {isForced && !doneHint && (
        <div className="mb-4">
          <NotionAlert tone="warning">首次登录须设置新密码后方可继续使用</NotionAlert>
        </div>
      )}

      {doneHint ? (
        <NotionAlert tone="success">{doneHint}</NotionAlert>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-[14px] border border-[#eef2f7] bg-white p-5 shadow-sm space-y-4">
          {!isForced && (
            <div>
              <label className="block text-sm font-medium text-[#111827] mb-1.5">当前密码</label>
              <NotionPasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="请输入当前密码"
                className="w-full"
                autoComplete="current-password"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[#111827] mb-1.5">新密码</label>
            <NotionPasswordInput
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="至少 6 位"
              className="w-full"
              autoComplete="new-password"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#111827] mb-1.5">确认新密码</label>
            <NotionPasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入新密码"
              className="w-full"
              autoComplete="new-password"
              required
            />
          </div>

          {error && <NotionAlert tone="error">{error}</NotionAlert>}

          <NotionButton type="submit" disabled={loading} className="w-full">
            {loading ? "保存中..." : isForced ? "保存并继续" : "保存新密码"}
          </NotionButton>
        </form>
      )}
    </div>
  );
}
