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
        meta={
          user.mustChangePassword
            ? "首次登录须设置新密码后方可继续使用"
            : "登录账号共用一套密码，改后小蓝环与 N7 均生效"
        }
        backHref={user.mustChangePassword ? undefined : "/"}
        backLabel="← 返回"
      />
      <ChangePasswordForm forced={user.mustChangePassword} />
    </PageShell>
  );
}
