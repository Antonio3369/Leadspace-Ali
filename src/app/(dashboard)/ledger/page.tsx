import { Suspense } from "react";
import { LedgerView } from "@/components/ledger/LedgerView";

export default function LedgerPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-400 py-8">加载中...</p>}>
      <LedgerView />
    </Suspense>
  );
}
