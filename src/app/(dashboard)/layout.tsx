import { redirect } from "next/navigation";
import { ensureLiveSession } from "@/lib/auth";
import { Navbar } from "@/components/layout/Navbar";
import { BusinessNotice } from "@/components/layout/BusinessNotice";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await ensureLiveSession();

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      <Navbar user={user} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <BusinessNotice />
        {children}
      </main>
    </div>
  );
}
