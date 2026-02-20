import Airtable from "airtable";
import { NextResponse } from "next/server";

const BASE_ID = process.env.AIRTABLE_BASE_ID || "appRaso1tDQvVu3Ry";
const TABLE_IDS = {
  awards: "tblEYOCQmY6XdhC86",
  nominations: "tblYVo7XWq6BVo9LY",
  referees: "tbl2SV7PuUpSNa7dL",
  refereeForms: "tbl7nZgFnv39FoOt7",
  cities: "tbl8lzty1gF6b9ox7",
} as const;

export async function GET() {
  const pat = process.env.AIRTABLE_PAT;

  if (!pat) {
    return NextResponse.json({ error: "Missing AIRTABLE_PAT in environment." }, { status: 500 });
  }

  try {
    const base = new Airtable({ apiKey: pat }).base(BASE_ID);

    const [cityRecords, awardRecords, refereeRecords, refereeFormRecords] =
      await Promise.all([
        base(TABLE_IDS.cities).select({ view: "Grid view" }).all(),
        base(TABLE_IDS.awards).select({ view: "Grid view" }).all(),
        base(TABLE_IDS.referees).select({ view: "Grid view" }).all(),
        base(TABLE_IDS.refereeForms).select({ view: "Grid view" }).all(),
      ]);

    const cities = cityRecords.map((record) => ({
      id: record.id,
      name: String(record.get("City Name") || ""),
    }));

    const awards = awardRecords.map((record) => ({
      id: record.id,
      name: String(record.get("Award Name") || ""),
      cityIds: (record.get("City") as string[] | undefined) || [],
      active: Boolean(record.get("Active Status")),
    }));

    const refereeFormsSubmitted = refereeFormRecords.filter((record) => {
      const status = String(record.get("Submission Status") || "").toLowerCase();
      return status === "submitted";
    }).length;

    return NextResponse.json({
      baseId: BASE_ID,
      tables: TABLE_IDS,
      cities,
      awards,
      refereesCount: refereeRecords.length,
      refereeFormsCount: refereeFormRecords.length,
      refereeFormsSubmitted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch Airtable bootstrap data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
