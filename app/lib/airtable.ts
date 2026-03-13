import Airtable from "airtable";
import { SUPPORTED_CITIES } from "@/app/lib/awardConfig";

export const AIRTABLE_BASE_ID =
  process.env.AIRTABLE_BASE_ID || "appRaso1tDQvVu3Ry";

export const AIRTABLE_SHARED_TABLES = {
  cities: process.env.AIRTABLE_CITIES_TABLE || "tbl8lzty1gF6b9ox7",
} as const;

export type SupportedCity = (typeof SUPPORTED_CITIES)[number];

export type CityTableSet = {
  awards: string;
  nominations: string;
  referees: string;
  refereeForms: string;
};

export const AIRTABLE_CITY_TABLES: Record<SupportedCity, CityTableSet> = {
  Calgary: {
    awards: process.env.AIRTABLE_CALGARY_AWARDS_TABLE || "Calgary_Awards",
    nominations:
      process.env.AIRTABLE_CALGARY_NOMINATIONS_TABLE || "Calgary_Nominations",
    referees:
      process.env.AIRTABLE_CALGARY_REFEREES_TABLE || "Calgary_Referees",
    refereeForms:
      process.env.AIRTABLE_CALGARY_REFEREE_FORMS_TABLE ||
      "Calgary_Referee_Forms",
  },
  Edmonton: {
    awards: process.env.AIRTABLE_EDMONTON_AWARDS_TABLE || "Edmonton_Awards",
    nominations:
      process.env.AIRTABLE_EDMONTON_NOMINATIONS_TABLE ||
      "Edmonton_Nominations",
    referees:
      process.env.AIRTABLE_EDMONTON_REFEREES_TABLE || "Edmonton_Referees",
    refereeForms:
      process.env.AIRTABLE_EDMONTON_REFEREE_FORMS_TABLE ||
      "Edmonton_Referee_Forms",
  },
};

function isAirtableNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    statusCode?: number;
    error?: string;
    message?: string;
  };

  return (
    candidate.statusCode === 404 ||
    candidate.error === "NOT_FOUND" ||
    /not found/i.test(candidate.message || "")
  );
}

export function createAirtableBase(apiKey: string) {
  return new Airtable({ apiKey }).base(AIRTABLE_BASE_ID);
}

export function normalizeCityName(value: string): SupportedCity | null {
  const normalized = value.trim().toLowerCase();

  return (
    SUPPORTED_CITIES.find((city) => city.toLowerCase() === normalized) || null
  );
}

export function getCityTableSet(city: string) {
  const normalizedCity = normalizeCityName(city);
  return normalizedCity ? AIRTABLE_CITY_TABLES[normalizedCity] : null;
}

export async function findRefereeFormLocation(
  apiKey: string,
  refereeFormId: string,
) {
  const base = createAirtableBase(apiKey);

  const matches = await Promise.all(
    SUPPORTED_CITIES.map(async (city) => {
      const tables = AIRTABLE_CITY_TABLES[city];

      try {
        const refereeForm = await base(tables.refereeForms).find(refereeFormId);
        return { base, city, tables, refereeForm };
      } catch (error) {
        if (!isAirtableNotFoundError(error)) {
          throw error;
        }
      }

      return null;
    }),
  );

  return matches.find(
    (match): match is NonNullable<(typeof matches)[number]> => match !== null,
  );
}
