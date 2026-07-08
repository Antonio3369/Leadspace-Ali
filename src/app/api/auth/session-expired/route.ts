import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";

export async function GET(request: Request) {
  const reason = new URL(request.url).searchParams.get("reason");
  const loginUrl = new URL("/login", request.url);

  if (reason === "disabled") {
    loginUrl.searchParams.set("disabled", "1");
  } else if (reason === "refresh") {
    loginUrl.searchParams.set("session", "refresh");
  }

  await signOut({ redirect: false });
  return NextResponse.redirect(loginUrl);
}
