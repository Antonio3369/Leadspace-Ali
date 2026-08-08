import { signOut } from "@/lib/auth";

interface SignOutButtonProps {
  className?: string;
  label?: string;
  /** 退出后跳转的登录页，默认支付宝域 /login */
  redirectTo?: string;
}

export function SignOutButton({
  className,
  label = "退出登录",
  redirectTo = "/login",
}: SignOutButtonProps) {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo });
      }}
    >
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
