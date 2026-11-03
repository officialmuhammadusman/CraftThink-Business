import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonOk,
  notFound,
  unauthorized,
} from "@/lib/api";
import { writeAudit } from "@/lib/audit";

/** DELETE /api/saved-views/[id] — own views only; never another user's. */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await getSessionUser();
    if (!user) return unauthorized();
    const item = await prisma.savedView.findUnique({
      where: { id: params.id },
      select: { id: true, userId: true, module: true, name: true },
    });
    if (!item) return notFound("Saved view not found");
    if (item.userId !== user.id) return forbidden("That view belongs to another user");
    await prisma.savedView.delete({ where: { id: item.id } });
    await writeAudit(user.id, "SAVED_VIEW_DELETED", "SavedView", item.id, {
      module: item.module,
      name: item.name,
    });
    return jsonOk({ deleted: true });
  });
}
