import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const IMAGE_RE = /\.(jpg|jpeg|png|webp|gif|bmp)$/i;

async function ocrImage(buf: Buffer, mimeType: string): Promise<string> {
  const apiKey = process.env.OPENAI_COMPAT_API_KEY;
  const baseUrl = process.env.OPENAI_COMPAT_BASE_URL ?? "https://api.groq.com/openai";
  if (!apiKey) return "";

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${buf.toString("base64")}` },
            },
            {
              type: "text",
              text: "Extract all text from this document image. Return only the raw text content, preserving structure where possible. No commentary.",
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) return "";
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

function mimeFromName(name: string): string {
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const results: Array<{ name: string; text: string }> = [];

  for (const [, value] of Array.from(formData.entries())) {
    if (!(value instanceof File)) continue;
    const file = value;
    const buf = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    let text = "";

    try {
      if (name.endsWith(".pdf")) {
        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        // Disable worker and font warnings for Node.js server environment
        pdfjsLib.GlobalWorkerOptions.workerSrc = "";
        const doc = await pdfjsLib.getDocument({
          data: new Uint8Array(buf),
          useWorkerFetch: false,
          useSystemFonts: true,
          verbosity: 0,
        } as Parameters<typeof pdfjsLib.getDocument>[0]).promise;
        const pages: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          pages.push(content.items.map((it) => ("str" in it ? (it.str as string) : "")).join(" "));
        }
        text = pages.join("\n").trim();
      } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer: buf });
        text = result.value?.trim() ?? "";
      } else if (IMAGE_RE.test(name)) {
        text = await ocrImage(buf, mimeFromName(name));
        if (!text) text = `[Image: ${file.name}, ${Math.round(file.size / 1024)} KB — set OPENAI_COMPAT_API_KEY to enable OCR]`;
      } else {
        const raw = buf.toString("utf-8").replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "").trim();
        text = raw.length > 80 ? raw : `[File: ${file.name}, ${Math.round(file.size / 1024)} KB]`;
      }
    } catch (err) {
      console.error(`[extract-text] failed for ${file.name}:`, err);
      text = `[Could not extract text from ${file.name}]`;
    }

    results.push({ name: file.name, text: text || `[Empty or unreadable: ${file.name}]` });
  }

  return NextResponse.json({ results });
}
