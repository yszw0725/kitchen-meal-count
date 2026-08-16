export type DocumentCategory = "weekly_menu" | "work_schedule" | "purchase_order";

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "weekly_menu",
  "work_schedule",
  "purchase_order",
];

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  weekly_menu: "週間献立表",
  work_schedule: "勤務表",
  purchase_order: "発注書",
};

export type DocumentRow = {
  category: DocumentCategory;
  storage_path: string;
  original_filename: string;
  uploaded_at: string;
};
