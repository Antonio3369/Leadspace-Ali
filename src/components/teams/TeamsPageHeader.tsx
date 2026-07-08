import { Suspense } from "react";
import { TeamsMonthPicker } from "@/components/teams/TeamsMonthPicker";

interface TeamsPageHeaderProps {
  month: string;
  monthLabel: string;
}

function TeamsPageHeaderInner({ month, monthLabel }: TeamsPageHeaderProps) {
  return <TeamsMonthPicker month={month} monthLabel={monthLabel} />;
}

export function TeamsPageHeader(props: TeamsPageHeaderProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-gray-900">团队排行</h1>
        </div>
      }
    >
      <TeamsPageHeaderInner {...props} />
    </Suspense>
  );
}
