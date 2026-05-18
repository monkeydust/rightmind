import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { generateApiKey } from "@/lib/api-keys";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const keys = await prisma.apiKey.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    return Response.json({ keys });
  } catch (error) {
    console.error("Failed to fetch API keys:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { name } = await request.json();
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return Response.json({ error: "Invalid key name" }, { status: 400 });
    }

    const { plainKey, keyHash, prefix } = generateApiKey();

    const newKey = await prisma.apiKey.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        keyHash,
        prefix,
      },
    });

    // We only return the plainKey ONCE. It is never retrievable again.
    return Response.json({
      id: newKey.id,
      name: newKey.name,
      prefix: newKey.prefix,
      plainKey, 
      createdAt: newKey.createdAt,
    });
  } catch (error) {
    console.error("Failed to create API key:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
