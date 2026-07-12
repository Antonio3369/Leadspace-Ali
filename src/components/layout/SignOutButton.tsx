import { signOut } from "@/lib/auth";

interface SignOutButtonProps {
  className?: string;
  label?: string;
}

export function SignOutButton({ className, label = "退出登录" }: SignOutButtonProps) {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
