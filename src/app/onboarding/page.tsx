import { redirect } from "next/navigation";
import { ensureLiveSession, signOut } from "@/lib/auth";
import {
  needsOnboarding,
  onboardingDescription,
  onboardingTitle,
} from "@/lib/account-lifecycle";
import { ROLE_LABELS } from "@/lib/constants";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";

export default async function OnboardingPage() {
  const user = await ensureLiveSession();

  if (!needsOnboarding(user.accountLifecycle)) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <span className="font-semibold text-[#165DFF]">Leadspace 数据管理</span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">
            退出登录
          </button>
        </form>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg bg-white rounded-xl shadow-sm border border-gray-100 p-8 space-y-5">
          <div>
            <p className="text-xs text-[#165DFF] font-medium mb-1">首次登录</p>
            <h1 className="text-xl font-semibold text-gray-900">{onboardingTitle(user.role)}</h1>
            <p className="text-sm text-gray-500 mt-2">
              {user.name}（{ROLE_LABELS[user.role] ?? user.role}）
            </p>
          </div>

          <p className="text-sm text-gray-600 leading-relaxed">{onboardingDescription(user.role)}</p>

          <OnboardingForm role={user.role} />
        </div>
      </main>
    </div>
  );
}
