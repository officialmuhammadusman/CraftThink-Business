import { NextResponse } from "next/server";
import { moduleAccess } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  handleRoute,
  jsonOk,
  notFound,
  unauthorized,
} from "@/lib/api";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; commentId: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const access = await moduleAccess("TASKS");
    if (!access.ok) return access.reason === "unauthenticated" ? unauthorized() : forbidden();
    const user = access.user;
    const level = access.level;
    const comment = await prisma.taskComment.findUnique({
      where: { id: params.commentId },
      select: { id: true, taskId: true, authorId: true },
    });
    if (!comment || comment.taskId !== params.id)
      return notFound("Comment not found");
    // Deletion needs full task access or being the comment's author.
    if (level !== "ALL" && comment.authorId !== user.id)
      return forbidden("You cannot delete this comment");
    await prisma.taskComment.delete({ where: { id: comment.id } });
    await writeAudit(user.id, "TASK_COMMENT_DELETED", "Task", comment.taskId, {
      commentId: comment.id,
    });
    return jsonOk({ deleted: true });
  });
}
