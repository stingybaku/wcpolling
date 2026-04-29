import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { badRequest, getCurrentUser, unauthorized } from "@/app/api/helpers";

const allowedTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

function getAbsoluteAvatarPath(relativePath: string) {
  return path.join(process.cwd(), "public", relativePath);
}

async function removeLocalAvatar(image?: string | null) {
  if (!image || !image.startsWith("/uploads/avatars/")) return;

  try {
    await unlink(getAbsoluteAvatarPath(image));
  } catch {
    // Ignore cleanup failures for missing files.
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const formData = await request.formData();
  const file = formData.get("avatar");

  if (!(file instanceof File)) {
    return badRequest("Avatar file is required");
  }

  const extension = allowedTypes.get(file.type);
  if (!extension) {
    return badRequest("Only JPG, PNG, and WEBP images are allowed");
  }

  if (file.size > 2 * 1024 * 1024) {
    return badRequest("Avatar must be 2MB or smaller");
  }

  const avatarsDir = path.join(process.cwd(), "public", "uploads", "avatars");
  await mkdir(avatarsDir, { recursive: true });

  const filename = `${user.id}-${randomUUID()}${extension}`;
  const relativePath = `/uploads/avatars/${filename}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(path.join(avatarsDir, filename), buffer);
  await removeLocalAvatar(user.image);

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { image: relativePath },
    select: { id: true, email: true, name: true, role: true, image: true },
  });

  return new Response(JSON.stringify({ profile: updatedUser }), { status: 200 });
}
