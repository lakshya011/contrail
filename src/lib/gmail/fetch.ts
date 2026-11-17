import "server-only";
import "@/lib/base64-polyfill"; // must load before unpdf/pdf.js (see that file)
import { convert } from "html-to-text";
import type { GmailClient } from "./client";

type Part = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: Part[];
};

export type FetchedEmail = {
  id: string;
  threadId: string;
  date: Date | null;
  from: string;
  subject: string;
  html: string;
  text: string; // plain text of body + PDF attachments
};

const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const MAX_PDF_BYTES = 5_000_000;

async function pdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

export async function fetchEmail(gmail: GmailClient, id: string): Promise<FetchedEmail> {
  const msg = await gmail.get<{ id: string; threadId: string; internalDate?: string; payload: Part }>(
    `/messages/${id}`,
    { format: "full" },
  );
  const headers = Object.fromEntries((msg.payload.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  let html = "", plain = "";
  const pdfs: { attachmentId?: string; data?: string; filename: string }[] = [];

  const walk = (p: Part) => {
    const mt = (p.mimeType ?? "").toLowerCase();
    if (mt === "text/html" && p.body?.data) html += b64url(p.body.data).toString("utf8");
    else if (mt === "text/plain" && p.body?.data && !p.filename) plain += b64url(p.body.data).toString("utf8");
    else if ((mt === "application/pdf" || p.filename?.toLowerCase().endsWith(".pdf")) && (p.body?.size ?? 0) < MAX_PDF_BYTES) {
      pdfs.push({ attachmentId: p.body?.attachmentId, data: p.body?.data, filename: p.filename ?? "attachment.pdf" });
    }
    p.parts?.forEach(walk);
  };
  walk(msg.payload);

  let text = html
    ? convert(html, { wordwrap: false, selectors: [{ selector: "img", format: "skip" }, { selector: "a", options: { ignoreHref: true } }] })
    : plain;

  for (const pdf of pdfs.slice(0, 3)) {
    try {
      const data = pdf.data ?? (await gmail.get<{ data: string }>(`/messages/${id}/attachments/${pdf.attachmentId}`)).data;
      const t = await pdfText(new Uint8Array(b64url(data)));
      if (t.trim()) text += `\n\n--- Attachment: ${pdf.filename} ---\n${t}`;
    } catch {
      // Password-protected or malformed PDFs are skipped.
    }
  }

  return {
    id: msg.id,
    threadId: msg.threadId,
    date: msg.internalDate ? new Date(Number(msg.internalDate)) : headers.date ? new Date(headers.date) : null,
    from: headers.from ?? "",
    subject: headers.subject ?? "",
    html,
    text: text.replace(/\n{3,}/g, "\n\n").trim(),
  };
}
