import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { UPLOAD_DIR } from "@/app/lib/expenses";

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  const parts = params.path ?? [];
  const requestedPath = path.normalize(path.join(UPLOAD_DIR, ...parts));

  if (!requestedPath.startsWith(UPLOAD_DIR)) {
    return NextResponse.json({ message: "Dateipfad nicht erlaubt." }, { status: 403 });
  }

  try {
    const file = await fs.readFile(requestedPath);
    const filename = path.basename(requestedPath);

    return new NextResponse(file, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, must-revalidate"
      }
    });
  } catch {
    return NextResponse.json({ message: "Datei nicht gefunden." }, { status: 404 });
  }
}
