import "server-only";
import type { GmailClient } from "./client";

export type ListPage = { ids: { id: string; threadId: string }[]; nextPageToken?: string };

export async function listPage(gmail: GmailClient, q: string, pageToken?: string | null): Promise<ListPage> {
  const res = await gmail.get<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>(
    "/messages",
    { q, maxResults: "500", includeSpamTrash: "false", ...(pageToken ? { pageToken } : {}) },
  );
  return { ids: res.messages ?? [], nextPageToken: res.nextPageToken };
}
