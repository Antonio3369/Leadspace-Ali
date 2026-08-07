import { redirect } from "next/navigation";
import { xlvPath } from "@/lib/business-lines";

export default function XlvTodayRedirectPage() {
  redirect(xlvPath());
}
