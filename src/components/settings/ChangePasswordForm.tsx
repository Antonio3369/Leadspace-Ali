"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { NotionAlert, NotionButton, NotionInput } from "@/components/ui/notion";

interface ChangePasswordFormProps {
  forced?: boolean;
}

export function ChangePasswordForm({ forced = false }: ChangePasswordFormProps) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!forced && !currentPassword) {
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
          currentPassword: forced ? undefined : currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "修改失败");
        return;
      }

      if (forced) {
        await signOut({ redirect: false });
        router.push("/login?session=refresh");
        router.refresh();
        return;
      }

      setSuccess("密码已更新，请使用新密码下次登录");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md">
      {forced && (
        <div className="mb-4">
          <NotionAlert tone="warning">首次登录须设置新密码后方可继续使用</NotionAlert>
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-[14px] border border-[#eef2f7] bg-white p-5 shadow-sm space-y-4">
        {!forced && (
          <div>
            <label className="block text-sm font-medium text-[#111827] mb-1.5">当前密码</label>
            <NotionInput
              type="password"
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
          <NotionInput
            type="password"
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
          <NotionInput
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="再次输入新密码"
            className="w-full"
            autoComplete="new-password"
            required
          />
        </div>

        {error && <NotionAlert tone="error">{error}</NotionAlert>}
        {success && <NotionAlert tone="success">{success}</NotionAlert>}

        <NotionButton type="submit" disabled={loading} className="w-full">
          {loading ? "保存中..." : forced ? "保存并继续" : "保存新密码"}
        </NotionButton>
      </form>
    </div>
  );
}
