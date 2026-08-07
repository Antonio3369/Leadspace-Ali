import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { canImportExcel } from "@/lib/permissions";
import { canAccessXlvWorkspace } from "@/services/xlv/xlv-scope";
import {
  getXlvAttributionLookup,
  getXlvAttributionReport,
  getXlvUnattachedDevices,
  updateXlvDeviceAttribution,
} from "@/services/xlv/attribution";
import { syncXlvAttributionFromRoster } from "@/services/xlv/relink-sales-devices";

function assertXlvAdmin(user: Awaited<ReturnType<typeof requireSessionUser>>) {
  if (!canAccessXlvWorkspace(user)) {
    return NextResponse.json({ error: "未开通微信小绿盒业务线" }, { status: 403 });
  }
  if (!canImportExcel(user.role)) {
    return NextResponse.json({ error: "仅管理员可管理人员归属" }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const denied = assertXlvAdmin(user);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");

    if (view === "lookup") {
      return NextResponse.json(await getXlvAttributionLookup());
    }

    if (view === "devices") {
      const missing = searchParams.get("missing");
      const parsedMissing =
        missing === "manager" || missing === "operator" || missing === "any"
          ? missing
          : "any";
      const result = await getXlvUnattachedDevices({
        q: searchParams.get("q") ?? undefined,
        missing: parsedMissing,
        limit: Number(searchParams.get("limit") ?? "50"),
        offset: Number(searchParams.get("offset") ?? "0"),
      });
      return NextResponse.json(result);
    }

    return NextResponse.json(await getXlvAttributionReport());
  } catch (err) {
    const message = err instanceof Error ? err.message : "加载失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const denied = assertXlvAdmin(user);
    if (denied) return denied;

    const body = (await request.json()) as { action?: string };
    if (body.action !== "relink") {
      return NextResponse.json({ error: "未知操作" }, { status: 400 });
    }

    const result = await syncXlvAttributionFromRoster();
    const report = await getXlvAttributionReport();
    return NextResponse.json({ result, report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "操作失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    const denied = assertXlvAdmin(user);
    if (denied) return denied;

    const body = (await request.json()) as {
      deviceSn?: string;
      managerName?: string;
      operatorName?: string;
    };

    if (!body.deviceSn?.trim()) {
      return NextResponse.json({ error: "缺少设备 SN" }, { status: 400 });
    }

    const device = await updateXlvDeviceAttribution(body.deviceSn.trim(), {
      managerName: body.managerName,
      operatorName: body.operatorName,
    });

    return NextResponse.json({ device });
  } catch (err) {
    const message = err instanceof Error ? err.message : "保存失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
