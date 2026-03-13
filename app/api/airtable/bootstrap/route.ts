import Airtable from "airtable";
import { NextResponse } from "next/server";
import {
  AIRTABLE_BASE_ID,
  AIRTABLE_CITY_TABLES,
  AIRTABLE_SHARED_TABLES,
  createAirtableBase,
} from "@/app/lib/airtable";
import { SUPPORTED_CITIES } from "@/app/lib/awardConfig";

export async function GET() {
  const pat = process.env.AIRTABLE_PAT;

  if (!pat) {
    return NextResponse.json({ error: "Missing AIRTABLE_PAT in environment." }, { status: 500 });
  }

  try {
    const base = createAirtableBase(pat);

    const cityRecords = await base(AIRTABLE_SHARED_TABLES.cities)
      .select({ view: "Grid view" })
      .all();

    const cityData = await Promise.all(
      SUPPORTED_CITIES.map(async (city) => {
        const tables = AIRTABLE_CITY_TABLES[city];
        const [awardRecords, refereeRecords, refereeFormRecords] =
          await Promise.all([
            base(tables.awards).select({ view: "Grid view" }).all(),
            base(tables.referees).select({ view: "Grid view" }).all(),
            base(tables.refereeForms).select({ view: "Grid view" }).all(),
          ]);

        return {
          city,
          tables,
          awardRecords,
          refereeRecords,
          refereeFormRecords,
        };
      }),
    ) as Array<{
      city: string;
      tables: {
        awards: string;
        nominations: string;
        referees: string;
        refereeForms: string;
      };
      awardRecords: readonly Airtable.Record<Airtable.FieldSet>[];
      refereeRecords: readonly Airtable.Record<Airtable.FieldSet>[];
      refereeFormRecords: readonly Airtable.Record<Airtable.FieldSet>[];
    }>;

    const cityIdByName = Object.fromEntries(
      cityRecords.map((record) => [
        String(record.get("City Name") || ""),
        record.id,
      ]),
    ) as Record<string, string>;

    const cities = cityRecords.map((record) => ({
      id: record.id,
      name: String(record.get("City Name") || ""),
    }));

    const awards = cityData.flatMap(({ city, awardRecords }) =>
      awardRecords.map((record) => {
        const linkedCityIds = (record.get("City") as string[] | undefined) || [];
        const impliedCityId = cityIdByName[city];

        return {
          id: record.id,
          name: String(record.get("Award Name") || ""),
          cityIds:
            linkedCityIds.length > 0
              ? linkedCityIds
              : impliedCityId
                ? [impliedCityId]
                : [],
          active: Boolean(record.get("Active Status")),
        };
      }),
    );

    const refereeFormsSubmitted = cityData.reduce((count, { refereeFormRecords }) => {
      return (
        count +
        refereeFormRecords.filter((record) => {
          const status = String(record.get("Submission Status") || "").toLowerCase();
          return status === "submitted";
        }).length
      );
    }, 0);

    const refereesCount = cityData.reduce(
      (count, { refereeRecords }) => count + refereeRecords.length,
      0,
    );

    const refereeFormsCount = cityData.reduce(
      (count, { refereeFormRecords }) => count + refereeFormRecords.length,
      0,
    );

    return NextResponse.json({
      baseId: AIRTABLE_BASE_ID,
      tables: {
        cities: AIRTABLE_SHARED_TABLES.cities,
        byCity: AIRTABLE_CITY_TABLES,
      },
      cities,
      awards,
      refereesCount,
      refereeFormsCount,
      refereeFormsSubmitted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch Airtable bootstrap data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
