import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonOk,
  notFound,
  unauthorized,
} from "@/lib/api";
import { isPrivileged } from "../../../../companies/_scope";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; commentId: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireAuth();
    if (!user) return unauthorized();
    const comment = await prisma.taskComment.findUnique({
      where: { id: params.commentId },
      select: { id: true, taskId: true, authorId: true },
    });
    if (!comment || comment.taskId !== params.id)
      return notFound("Comment not found");
    if (!isPrivileged(user) && comment.authorId !== user.id)
      return forbidden("You cannot delete this comment");
    await prisma.taskComment.delete({ where: { id: comment.id } });
    await writeAudit(user.id, "TASK_COMMENT_DELETED", "Task", comment.taskId, {
      commentId: comment.id,
    });
    return jsonOk({ deleted: true });
  });
}
