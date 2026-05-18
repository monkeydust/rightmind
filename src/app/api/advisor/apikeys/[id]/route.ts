import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const resolvedParams = await params;
    const keyId = resolvedParams.id;

    // Verify ownership before deleting
    const key = await prisma.apiKey.findUnique({
      where: { id: keyId },
    });

    if (!key || key.userId !== session.user.id) {
      return Response.json({ error: "Not found or unauthorized" }, { status: 404 });
    }

    await prisma.apiKey.delete({
      where: { id: keyId },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to revoke API key:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
