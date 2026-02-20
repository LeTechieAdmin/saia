import Airtable from "airtable";
import { NextResponse } from "next/server";

const BASE_ID = process.env.AIRTABLE_BASE_ID || "appRaso1tDQvVu3Ry";
const NOMINATIONS_TABLE_ID = "tblYVo7XWq6BVo9LY";

type ValidationPayload = {
  city?: string;
  awardCategory?: string;
  nominationDeadline?: string;
  nomineeName?: string;
  nomineeEmail?: string;
  nomineePhone?: string;
  nomineeSummary?: string;
};

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function extractField(record: Airtable.Record<Airtable.FieldSet>, candidates: string[]) {
  for (const fieldName of candidates) {
    const value = record.get(fieldName);
    if (value !== undefined && value !== null) {
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

  const required = {
    city: payload.city?.trim() || "",
    awardCategory: payload.awardCategory?.trim() || "",
    nominationDeadline: payload.nominationDeadline?.trim() || "",
    nomineeName: payload.nomineeName?.trim() || "",
    nomineeEmail: payload.nomineeEmail?.trim() || "",
    nomineePhone: payload.nomineePhone?.trim() || "",
    nomineeSummary: payload.nomineeSummary?.trim() || "",
  };

  const missing = Object.entries(required)
    .filter(([, value]) => value.length === 0)
    .map(([key]) => key);

  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "All inputs are required.",
        missingFields: missing,
      },
      { status: 400 },
    );
  }

  const targetName = normalizeText(required.nomineeName);
  const targetEmail = normalizeText(required.nomineeEmail);
  const targetPhone = normalizePhone(required.nomineePhone);

  try {
    const base = new Airtable({ apiKey: pat }).base(BASE_ID);
    const records = await base(NOMINATIONS_TABLE_ID).select({ view: "Grid view" }).all();

    const duplicate = records.find((record) => {
      const recordNomineeName = normalizeText(
        extractField(record, ["Nominee Name", "Name", "Nominee"]),
      );
      const recordNomineeEmail = normalizeText(
        extractField(record, ["Nominee Email", "Email", "Email Address"]),
      );
      const recordNomineePhone = normalizePhone(
        extractField(record, ["Nominee Phone", "Phone", "Phone Number"]),
      );

      const duplicateByName = targetName.length > 0 && recordNomineeName === targetName;
      const duplicateByEmail =
        targetEmail.length > 0 && recordNomineeEmail.length > 0 && recordNomineeEmail === targetEmail;
      const duplicateByPhone =
        targetPhone.length > 0 && recordNomineePhone.length > 0 && recordNomineePhone === targetPhone;

      return duplicateByName || duplicateByEmail || duplicateByPhone;
    });

    if (duplicate) {
      const existingNomineeName = extractField(duplicate, ["Nominee Name", "Name", "Nominee"]) || "Unknown Nominee";
      const awardLookup =
        extractField(duplicate, ["Award Name (Lookup)", "Award", "Award Category"]) || "Unknown Award";
      const cityLookup =
        extractField(duplicate, ["City Name (Lookup)", "City", "City Name"]) || "Unknown City";

      return NextResponse.json(
        {
          ok: false,
          error:
            `Duplicate nominee found by email, phone, or name. Existing nomination: ${existingNomineeName} (${awardLookup}, ${cityLookup}). ` +
            "One nominee can only be nominated once and only for one award.",
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
