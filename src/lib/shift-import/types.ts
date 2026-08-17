export type ImportError = {
  row: number;
  column: string;
  value: string;
  message: string;
};

export type ParsedStaff = {
  name: string;
  sortOrder: number;
};

export type ParsedShiftEntry = {
  date: string; // ISO yyyy-mm-dd
  staffName: string;
  code: string;
};

export type ParsedDateEvent = {
  date: string; // ISO yyyy-mm-dd
  note: string;
};

export type ParseSuccess = {
  ok: true;
  staff: ParsedStaff[];
  entries: ParsedShiftEntry[];
  dateEvents: ParsedDateEvent[];
};

export type ParseFailure = {
  ok: false;
  errors: ImportError[];
};

export type ParseResult = ParseSuccess | ParseFailure;
