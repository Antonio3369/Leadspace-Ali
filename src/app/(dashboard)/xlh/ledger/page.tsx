import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth";
import { LedgerView } from "@/components/ledger/LedgerView";

export default async function LedgerPage() {
  const user = await getSessionUser();
  const showTeamColumn = user?.role === "DIRECTOR";
  const showManagerFilter = user?.role === "DIRECTOR";
  const showSalesUserFilter = user?.role === "MANAGER";

  return (
    <Suspense fallback={<p className="text-sm text-gray-400 py-8">加载中...</p>}>
      <LedgerView
        showTeamColumn={showTeamColumn}
        showManagerFilter={showManagerFilter}
        showSalesUserFilter={showSalesUserFilter}
      />
    </Suspense>
  );
}
