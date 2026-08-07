import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { followUpPhotoPublicUrl } from "@/lib/xlv-follow-up";

const UPLOAD_ROOT =
  process.env.XLV_FOLLOW_UP_UPLOAD_DIR ||
  path.join(process.cwd(), "data", "xlv-follow-up");

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);
const MAX_BYTES = 8 * 1024 * 1024;

export function followUpUploadRoot() {
  return UPLOAD_ROOT;
}

export function ensureFollowUpUploadRoot() {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

export { followUpPhotoPublicUrl };

export function absolutePathForFollowUpPhoto(relativePath: string): string | null {
  const safe = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");
  if (!safe || safe.includes("\\")) return null;
  const abs = path.join(UPLOAD_ROOT, safe);
  const root = path.resolve(UPLOAD_ROOT);
  if (!abs.startsWith(root + path.sep) && abs !== root) return null;
  return abs;
}

export async function saveFollowUpPhoto(opts: {
  deviceSn: string;
  fileName: string;
  buffer: Buffer;
}): Promise<{ relativePath: string; url: string }> {
  if (opts.buffer.byteLength === 0) {
    throw new Error("图片为空");
  }
  if (opts.buffer.byteLength > MAX_BYTES) {
    throw new Error("单张图片不能超过 8MB");
  }

  const ext = path.extname(opts.fileName).toLowerCase() || ".jpg";
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error("仅支持 jpg / png / webp / heic");
  }

  const snSafe = opts.deviceSn.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const dir = path.join(UPLOAD_ROOT, snSafe);
  ensureFollowUpUploadRoot();
  fs.mkdirSync(dir, { recursive: true });

  const name = `${Date.now()}_${randomBytes(4).toString("hex")}${ext}`;
  const abs = path.join(dir, name);
  fs.writeFileSync(abs, opts.buffer);

  const relativePath = `${snSafe}/${name}`;
  return {
    relativePath,
    url: followUpPhotoPublicUrl(relativePath),
  };
}
