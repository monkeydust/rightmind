/**
 * Shared helpers for building file-aware messages across all orchestrators.
 *
 * When a file is attached, we build multimodal content arrays using
 * OpenRouter's file/image_url content types. For PDFs specifically,
 * we extract the text locally to avoid reliance on OpenRouter's PDF
 * parser (which fails on some files).
 */

import type { FileAttachment, ContentPart } from "./types";
import { resolveModel } from "./llm";

// Cache extracted PDF text so we only parse once per job
const pdfTextCache = new Map<string, string>();

/**
 * Extract text from a base64-encoded PDF.
 * Uses pdf-parse to handle the extraction locally, avoiding
 * OpenRouter's unreliable PDF parsing.
 */
async function extractPdfText(fileData: string, fileName: string): Promise<string> {
  // Check cache first (keyed by filename + first 50 chars of data)
  const cacheKey = `${fileName}:${fileData.slice(0, 50)}`;
  if (pdfTextCache.has(cacheKey)) {
    return pdfTextCache.get(cacheKey)!;
  }

  try {
    // Strip the data URL prefix to get raw base64
    const base64 = fileData.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    // Dynamic import to avoid issues with pdf-parse's test file loading
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();

    const text = result.text?.trim();
    if (!text) {
      throw new Error("No text extracted from PDF");
    }

    console.log(`[PDF] Extracted ${text.length} chars from "${fileName}" (${result.total} pages)`);
    pdfTextCache.set(cacheKey, text);
    return text;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[PDF] Failed to extract text from "${fileName}":`, err);
    throw new Error(
      `Could not read the PDF "${fileName}". Reason: ${errorMessage}. ` +
      `It may be scanned/image-based or corrupted. ` +
      `Try converting it to a text-based PDF or pasting the content directly into the challenge.`
    );
  }
}

/**
 * Build a user message content value that optionally includes a file attachment.
 *
 * - No file: returns the plain text string (backward compatible)
 * - With image: returns a ContentPart[] array with image_url
 * - With PDF: extracts text locally and appends it to the challenge text
 */
export async function buildUserContent(
  text: string,
  file?: FileAttachment
): Promise<string | ContentPart[]> {
  if (!file) return text;

  // Images: send as multimodal content
  if (file.mimeType.startsWith("image/")) {
    const parts: ContentPart[] = [
      { type: "text", text },
      {
        type: "image_url",
        image_url: { url: file.fileData },
      },
    ];
    return parts;
  }

  // PDFs: extract text locally and include inline
  if (file.mimeType === "application/pdf") {
    const pdfText = await extractPdfText(file.fileData, file.fileName);
    return `${text}\n\n---\n\n# Attached Document: ${file.fileName}\n\n${pdfText}`;
  }

  // Other file types: try sending via OpenRouter's file content type (fallback)
  const parts: ContentPart[] = [
    { type: "text", text },
    {
      type: "file",
      file: { filename: file.fileName, file_data: file.fileData },
    },
  ];
  return parts;
}

/**
 * Resolve the model for a given agent, swapping text-only models
 * for vision-capable alternatives when a file is attached.
 */
export function resolveAgentModel(model: string, file?: FileAttachment): string {
  return resolveModel(model, !!file);
}
