import Airtable from "airtable";

type NominationFormResponses = {
  nominator?: {
    fullName?: string;
    phone?: string;
    email?: string;
    relationship?: string;
    relationshipOther?: string;
  };
  nominee?: {
    fullName?: string;
    phone?: string;
    email?: string;
    gender?: string;
    dateOfBirth?: string;
  };
  business?: {
    name?: string;
    ownerManagerName?: string;
    phone?: string;
    email?: string;
    websiteLink?: string;
    socialMediaLinks?: string;
  };
};

function normalizeValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseNominationFormResponses(
  record: Airtable.Record<Airtable.FieldSet>,
) {
  const rawValue = record.get("Nomination Form Responses");
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as NominationFormResponses;
  } catch {
    return null;
  }
}

export function getNominationRecordContacts(
  record: Airtable.Record<Airtable.FieldSet>,
) {
  const payload = parseNominationFormResponses(record);

  return {
    nominatorEmail: normalizeValue(payload?.nominator?.email),
    nomineeEmail: normalizeValue(payload?.nominee?.email),
    nomineePhone: normalizeValue(payload?.nominee?.phone),
    businessName: normalizeValue(payload?.business?.name),
    businessEmail: normalizeValue(payload?.business?.email),
  };
}
