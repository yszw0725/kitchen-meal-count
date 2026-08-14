import type { ParsedResident } from "./types";

export type RosterDiffNewResident = {
  name: string;
  groupName: string;
};

export type RosterDiffStatusChange = {
  name: string;
  from: "在籍" | "退所";
  to: "在籍" | "退所";
};

export type RosterDiff = {
  newResidents: RosterDiffNewResident[];
  statusChanges: RosterDiffStatusChange[];
};

export function computeRosterDiff(
  dbResidents: Array<{ name: string; enrolled: boolean }>,
  sheetResidents: ParsedResident[],
): RosterDiff {
  const dbByName = new Map(dbResidents.map((r) => [r.name, r]));
  const newResidents: RosterDiffNewResident[] = [];
  const statusChanges: RosterDiffStatusChange[] = [];

  for (const r of sheetResidents) {
    const existing = dbByName.get(r.name);
    if (!existing) {
      newResidents.push({ name: r.name, groupName: r.groupName });
    } else if (existing.enrolled !== r.enrolled) {
      statusChanges.push({
        name: r.name,
        from: existing.enrolled ? "在籍" : "退所",
        to: r.enrolled ? "在籍" : "退所",
      });
    }
  }

  return { newResidents, statusChanges };
}

export type KitchenOverrideConflict = {
  id: string;
  residentName: string;
  meal: "breakfast" | "lunch" | "dinner";
  type: "absent" | "present";
  createdAt: string;
};
