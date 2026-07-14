import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { PageHeader, PageShell } from "@/components/ui/notion";

export default async function SettingsPasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <PageShell>
      <PageHeader
        title="修改密码"
        kicker=""
        meta="更新您的登录密码"
      />
      <ChangePasswordForm forced={user.mustChangePassword} />
    </PageShell>
  );
}
