export type AnnouncementRow = {
  id: string;
  content: string;
  created_at: string;
  poster_name: string;
};

export function formatAnnouncementDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
