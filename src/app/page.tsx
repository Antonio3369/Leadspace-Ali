import { PlatformPicker } from "@/components/business/PlatformPicker";

export default function PublicHomePage() {
  return (
    <div
      id="app-scroll"
      className="h-full min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#f4f6f9] [-webkit-overflow-scrolling:touch]"
    >
      <PlatformPicker />
    </div>
  );
}
