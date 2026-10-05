import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code, language } = await req.json();
  const sandboxToken = process.env.SANDBOX_API_TOKEN;

  if (!sandboxToken) {
    return Response.json({
      success: true,
      output: "Sandbox nicht konfiguriert. Code wird client-seitig ausgeführt.",
      code,
      language,
    });
  }

  try {
    const response = await fetch("https://api.vercel.com/v2/sandbox/run", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sandboxToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        runtime: language === "python" ? "python3" : "node20",
        files: [
          {
            path: `code.${language === "html" ? "html" : language === "python" ? "py" : "js"}`,
            content: code,
          },
        ],
        ...(language !== "html" && {
          entrypoint: `code.${language === "python" ? "py" : "js"}`,
        }),
        timeout: 30000,
      }),
    });

    const result = await response.json();
    return Response.json({
      success: true,
      output: result.stdout || "",
      error: result.stderr || null,
      sandboxId: result.sandboxId || null,
    });
  } catch (err) {
    return Response.json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
