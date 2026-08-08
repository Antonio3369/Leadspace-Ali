import { Suspense } from "react";
import XlvLoginForm from "./XlvLoginForm";

export default function XlvLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f6f9]" />}>
      <XlvLoginForm />
    </Suspense>
  );
}
