import Airtable from "airtable";
import { NextResponse } from "next/server";
import { AWARD_DEFINITIONS, isAwardCategory, normalizePhone } from "@/app/lib/awardConfig";
import {
  AIRTABLE_CITY_TABLES,
  createAirtableBase,
  getCityTableSet,
  normalizeCityName,
} from "@/app/lib/airtable";
import { getNominationRecordContacts } from "@/app/lib/nominationRecord";

type ValidationPayload = {
  city?: string;
  awardCategory?: string;
  nomineeEmail?: string;
  nomineePhone?: string;
  businessName?: string;
  businessEmail?: string;
};

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function extractField(record: Airtable.Record<Airtable.FieldSet>, candidates: string[]) {
  for (const fieldName of candidates) {
    const value = record.get(fieldName);
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        return value.join(", ");
      }
      return String(value);
    }
  }
  return "";
}

export async function POST(request: Request) {
  const pat = process.env.AIRTABLE_PAT;

  if (!pat) {
    return NextResponse.json({ ok: false, error: "Missing AIRTABLE_PAT in environment." }, { status: 500 });
  }

  let payload: ValidationPayload;

  try {
    payload = (await request.json()) as ValidationPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const awardCategory = payload.awardCategory?.trim() || "";
  const city = payload.city?.trim() || "";
  const resolvedCity = city ? normalizeCityName(city) : null;

  if (!isAwardCategory(awardCategory)) {
    return NextResponse.json({ ok: false, error: "Award category is required." }, { status: 400 });
  }

  if (city && !resolvedCity) {
    return NextResponse.json({ ok: false, error: "Unsupported city." }, { status: 400 });
  }

  const isBusiness = AWARD_DEFINITIONS[awardCategory].isBusiness;
  const nomineeEmail = payload.nomineeEmail?.trim() || "";
  const nomineePhone = payload.nomineePhone?.trim() || "";
  const businessName = payload.businessName?.trim() || "";
  const businessEmail = payload.businessEmail?.trim() || "";

  if (isBusiness) {
    if (!businessName || !businessEmail) {
      return NextResponse.json(
        { ok: false, error: "Business name and business email are required for duplicate checks." },
        { status: 400 },
      );
    }
  } else if (!nomineeEmail && !nomineePhone) {
    return NextResponse.json(
      { ok: false, error: "Nominee email or phone is required for duplicate checks." },
      { status: 400 },
    );
  }

  try {
    const base = createAirtableBase(pat);
    const tableGroups = resolvedCity
      ? [getCityTableSet(resolvedCity)].filter(
          (tables): tables is NonNullable<ReturnType<typeof getCityTableSet>> => Boolean(tables),
        )
      : Object.values(AIRTABLE_CITY_TABLES);

    const dataGroups = await Promise.all(
      tableGroups.map(async (tables) => {
        const [awardRecords, nominationRecords] = await Promise.all([
          base(tables.awards).select({ view: "Grid view" }).all(),
          base(tables.nominations).select({ view: "Grid view" }).all(),
        ]);

        return { awardRecords, nominationRecords };
      }),
    );

    const records = dataGroups.flatMap((group) => group.nominationRecords);
    const matchingAwardIds = new Set(
      dataGroups.flatMap((group) =>
        group.awardRecords
          .filter((record) => normalizeText(String(record.get("Award Name") || "")) === normalizeText(awardCategory))
          .map((record) => record.id),
      ),
    );

    const categoryKey = normalizeText(awardCategory);
    const duplicate = records.find((record) => {
      const workflowStatus = normalizeText(
        extractField(record, ["Nomination Workflow Status", "Nomination Status"]),
      );
      if (workflowStatus === "duplicate rejected" || workflowStatus === "disqualified") {
        return false;
      }

      const recordAwardIds = (record.get("Award") as string[] | undefined) || [];
      const recordCategory = normalizeText(extractField(record, ["Award Name (Lookup)"]));
      const categoryMatches =
        recordCategory.includes(categoryKey) ||
        recordAwardIds.some((id) => matchingAwardIds.has(id));
      if (!categoryMatches) {
        return false;
      }

      const recordContacts = getNominationRecordContacts(record);

      if (isBusiness) {
        return (
          normalizeText(businessName) === normalizeText(recordContacts.businessName) &&
          normalizeText(businessEmail) === normalizeText(recordContacts.businessEmail)
        );
      }

      const recordNomineeEmail = normalizeText(recordContacts.nomineeEmail);
      const recordNomineePhone = normalizePhone(recordContacts.nomineePhone);

      const duplicateByEmail = nomineeEmail
        ? normalizeText(nomineeEmail) === recordNomineeEmail
        : false;
      const duplicateByPhone = nomineePhone
        ? normalizePhone(nomineePhone) === recordNomineePhone
        : false;

      return duplicateByEmail || duplicateByPhone;
    });

    if (duplicate) {
      return NextResponse.json(
        {
          ok: false,
          error: "This nominee has already been submitted for this category.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to validate nomination against Airtable.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
