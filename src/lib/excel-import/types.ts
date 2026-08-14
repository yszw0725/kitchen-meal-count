export type MealType = "breakfast" | "lunch" | "dinner";
export type ExceptionType = "absent" | "present";

export type ImportError = {
  sheet: string;
  row: number;
  column: string;
  value: string;
  message: string;
};

export type ParsedMealException = {
  residentName: string;
  date: string; // ISO yyyy-mm-dd
  meal: MealType;
  type: ExceptionType;
  note: string | null;
};

export type ParsedDailyExtra = {
  date: string;
  meal: MealType;
  staffCount: number;
  visitorCount: number;
};

export type ParsedResident = {
  name: string;
  groupName: string;
  mealForm: string[];
  enrolled: boolean;
  note: string | null;
};

export type ParseSuccess = {
  ok: true;
  mealExceptions: ParsedMealException[];
  dailyExtras: ParsedDailyExtra[];
  residents: ParsedResident[];
};

export type ParseFailure = {
  ok: false;
  errors: ImportError[];
};

export type ParseResult = ParseSuccess | ParseFailure;
