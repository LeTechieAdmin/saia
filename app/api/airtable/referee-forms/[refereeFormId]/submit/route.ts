import Airtable from "airtable";
import { NextResponse } from "next/server";

const BASE_ID = process.env.AIRTABLE_BASE_ID || "appRaso1tDQvVu3Ry";
const REFEREE_FORMS_TABLE_ID = "tbl7nZgFnv39FoOt7";

type SubmitPayload = {
  nomineeName?: string;
  refereeName?: string;
  awardName?: string;
  answers?: Array<{ question: string; answer: string }>;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ refereeFormId: string }> },
) {
  const pat = process.env.AIRTABLE_PAT;

  if (!pat) {
    return NextResponse.json({ ok: false, error: "Missing AIRTABLE_PAT in environment." }, { status: 500 });
  }

  let payload: SubmitPayload;

  try {
    payload = (await request.json()) as SubmitPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const nomineeName = payload.nomineeName?.trim() || "";
  const refereeName = payload.refereeName?.trim() || "";
  const awardName = payload.awardName?.trim() || "Award";
  const answers = payload.answers || [];

  if (!nomineeName || !refereeName || answers.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Nominee, referee, and all question responses are required." },
      { status: 400 },
    );
  }

  const hasEmptyAnswer = answers.some(
    (entry) => !entry.question?.trim() || !entry.answer?.trim(),
  );

  if (hasEmptyAnswer) {
    return NextResponse.json(
      { ok: false, error: "All award-specific questions must be answered." },
      { status: 400 },
    );
  }

  const formStatement = [
    `Referee: ${refereeName}`,
    `Nominee: ${nomineeName}`,
    `Award: ${awardName}`,
    "",
    ...answers.map((entry, index) => `Q${index + 1}. ${entry.question}\nA${index + 1}. ${entry.answer}`),
  ].join("\n\n");

  try {
    const { refereeFormId } = await context.params;
    const base = new Airtable({ apiKey: pat }).base(BASE_ID);
    const existingRecord = await base(REFEREE_FORMS_TABLE_ID).find(refereeFormId);
    const existingStatus = String(existingRecord.get("Submission Status") || "").toLowerCase();

    if (existingStatus === "submitted") {
      return NextResponse.json(
        { ok: false, error: "This referee form has already been submitted and is now locked." },
        { status: 409 },
      );
    }

    await base(REFEREE_FORMS_TABLE_ID).update(refereeFormId, {
      "Form Statement": formStatement,
      "Submission Status": "Submitted",
      "Date Submitted": new Date().toISOString().slice(0, 10),
      Name: `${refereeName} - ${nomineeName}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to submit referee form to Airtable.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
