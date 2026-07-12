import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f6f9]" />}>
      <LoginForm />
    </Suspense>
  );
}
