"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type NominationFormState = {
  city: string;
  awardCategory: string;
  nominationDeadline: string;
  nomineeName: string;
  nomineeEmail: string;
  nomineePhone: string;
  nomineeSummary: string;
};

type RefereeContact = {
  name: string;
  email: string;
  phone: string;
  relation: string;
};

type RefereeResponse = {
  yearsKnown: string;
  impactExample: string;
  qualificationStatement: string;
};

type RefereeStatus = "not_started" | "pending" | "submitted";

type AwardOption = {
  id: string;
  name: string;
  cityIds: string[];
  active: boolean;
};

type AirtableBootstrap = {
  baseId: string;
  tables: {
    awards: string;
    nominations: string;
    referees: string;
    refereeForms: string;
    cities: string;
  };
  cities: Array<{ id: string; name: string }>;
  awards: Array<{ id: string; name: string; cityIds: string[]; active: boolean }>;
  refereesCount: number;
  refereeFormsCount: number;
  refereeFormsSubmitted: number;
};

const fallbackAwards = [
  "Community Leadership",
  "Business Excellence",
  "Arts and Culture",
  "Health and Wellness",
  "Youth Inspiration",
  "Lifetime Contribution",
].map((name) => ({
  id: name,
  name,
  cityIds: [],
  active: true,
}));

const relationOptions = [
  "Colleague",
  "Mentor",
  "Community Member",
  "Friend",
  "Family Member",
  "Other",
];

const emptyReferee: RefereeContact = {
  name: "",
  email: "",
  phone: "",
  relation: "",
};

const emptyRefereeResponse: RefereeResponse = {
  yearsKnown: "",
  impactExample: "",
  qualificationStatement: "",
};

function getReminderDates(deadline: string) {
  if (!deadline) {
    return [];
  }

  const dueDate = new Date(`${deadline}T12:00:00`);
  if (Number.isNaN(dueDate.getTime())) {
    return [];
  }

  const reminders: Date[] = [];

  for (let week = 1; week <= 4; week += 1) {
    const start = new Date(dueDate);
    start.setDate(start.getDate() - week * 7);
    const day = start.getDay();
    const offsetToWednesday = (3 - day + 7) % 7;
    const reminder = new Date(start);
    reminder.setDate(start.getDate() + offsetToWednesday);
    reminder.setHours(8, 0, 0, 0);

    if (reminder < dueDate) {
      reminders.push(reminder);
    }
  }

  return reminders.sort((a, b) => a.getTime() - b.getTime());
}

function formatReminderDate(date: Date) {
  return date.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function NominationsFrontend() {
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState("");
  const [airtableSnapshot, setAirtableSnapshot] = useState<{
    baseId: string;
    refereesCount: number;
    refereeFormsCount: number;
    refereeFormsSubmitted: number;
  } | null>(null);

  const [cityOptions, setCityOptions] = useState<Array<{ id: string; name: string }>>([
    { id: "calgary", name: "Calgary" },
    { id: "edmonton", name: "Edmonton" },
  ]);
  const [awardOptions, setAwardOptions] = useState<AwardOption[]>(fallbackAwards);

  const [nominationForm, setNominationForm] = useState<NominationFormState>({
    city: "",
    awardCategory: "",
    nominationDeadline: "",
    nomineeName: "",
    nomineeEmail: "",
    nomineePhone: "",
    nomineeSummary: "",
  });
  const [nominationError, setNominationError] = useState("");
  const [nominationSubmitted, setNominationSubmitted] = useState(false);
  const [nominationSubmitting, setNominationSubmitting] = useState(false);

  const [referees, setReferees] = useState<RefereeContact[]>([
    { ...emptyReferee },
    { ...emptyReferee },
  ]);
  const [refereeError, setRefereeError] = useState("");
  const [refereesSubmitted, setRefereesSubmitted] = useState(false);

  const [invitationsSent, setInvitationsSent] = useState(false);
  const [activeRefereeForm, setActiveRefereeForm] = useState<number | null>(null);
  const [refereeStatuses, setRefereeStatuses] = useState<RefereeStatus[]>([
    "not_started",
    "not_started",
  ]);
  const [refereeResponses, setRefereeResponses] = useState<RefereeResponse[]>([
    { ...emptyRefereeResponse },
    { ...emptyRefereeResponse },
  ]);
  const [refereeResponseError, setRefereeResponseError] = useState("");

  const cityIdByName = useMemo(() => {
    return Object.fromEntries(cityOptions.map((city) => [city.name, city.id]));
  }, [cityOptions]);

  const filteredAwards = useMemo(() => {
    const selectedCityId = cityIdByName[nominationForm.city] || "";
    return awardOptions.filter((award) => {
      if (!award.active) {
        return false;
      }
      if (!selectedCityId || award.cityIds.length === 0) {
        return true;
      }
      return award.cityIds.includes(selectedCityId);
    });
  }, [awardOptions, cityIdByName, nominationForm.city]);

  useEffect(() => {
    async function loadBootstrap() {
      try {
        setBootstrapLoading(true);
        const response = await fetch("/api/airtable/bootstrap", { cache: "no-store" });
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload?.error || "Failed to load Airtable data.");
        }

        const payload = (await response.json()) as AirtableBootstrap;

        if (payload.cities.length > 0) {
          setCityOptions(payload.cities.filter((city) => city.name.trim().length > 0));
        }

        if (payload.awards.length > 0) {
          setAwardOptions(payload.awards.filter((award) => award.name.trim().length > 0));
        }

        setAirtableSnapshot({
          baseId: payload.baseId,
          refereesCount: payload.refereesCount,
          refereeFormsCount: payload.refereeFormsCount,
          refereeFormsSubmitted: payload.refereeFormsSubmitted,
        });

        setBootstrapError("");
      } catch (error) {
        setBootstrapError(error instanceof Error ? error.message : "Failed to load Airtable data.");
      } finally {
        setBootstrapLoading(false);
      }
    }

    loadBootstrap();
  }, []);

  useEffect(() => {
    if (!nominationForm.awardCategory) {
      return;
    }

    const exists = filteredAwards.some((award) => award.name === nominationForm.awardCategory);
    if (!exists) {
      setNominationForm((current) => ({ ...current, awardCategory: "" }));
    }
  }, [filteredAwards, nominationForm.awardCategory]);

  const reminderDates = useMemo(
    () => getReminderDates(nominationForm.nominationDeadline),
    [nominationForm.nominationDeadline],
  );

  const isComplete = refereeStatuses.every((status) => status === "submitted");

  async function submitNomination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNominationError("");

    const values = Object.values(nominationForm).map((value) => value.trim());
    const hasEmpty = values.some((value) => value.length === 0);

    if (hasEmpty) {
      setNominationError("All nomination fields are required.");
      return;
    }

    try {
      setNominationSubmitting(true);
      const response = await fetch("/api/airtable/nominations/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nominationForm),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        setNominationError(payload.error || "Nomination validation failed.");
        return;
      }

      setNominationSubmitted(true);
    } catch (error) {
      setNominationError(
        error instanceof Error ? error.message : "Nomination validation failed.",
      );
    } finally {
      setNominationSubmitting(false);
    }
  }

  function submitReferees(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRefereeError("");

    const hasMissing = referees.some((referee) =>
      Object.values(referee).some((value) => value.trim().length === 0),
    );

    if (hasMissing) {
      setRefereeError("All referee contact fields are required.");
      return;
    }

    const familyMemberIndex = referees.findIndex(
      (referee) => referee.relation === "Family Member",
    );

    if (familyMemberIndex >= 0) {
      setRefereeError(
        `Referee ${familyMemberIndex + 1} is marked as Family Member and does not qualify. Please provide another referee.`,
      );
      return;
    }

    setRefereesSubmitted(true);
  }

  function sendInvitations() {
    setInvitationsSent(true);
    setRefereeStatuses(["pending", "pending"]);
  }

  function submitRefereeResponse(index: number, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRefereeResponseError("");

    const response = refereeResponses[index];
    const hasMissing = Object.values(response).some((value) => value.trim().length === 0);

    if (hasMissing) {
      setRefereeResponseError("All referee response fields are required.");
      return;
    }

    setRefereeStatuses((current) =>
      current.map((status, i) => (i === index ? "submitted" : status)),
    );
    setActiveRefereeForm(null);
  }

  return (
    <main className="nominations-page">
      <div className="hero-bg" />
      <section className="hero-card">
        <p className="kicker">South Asian Inspirational Awards</p>
        <h1>Nomination & Referee Workflow</h1>
        <p>
          Frontend prototype for Calgary and Edmonton nominations. Airtable/email
          steps are represented in UI only.
        </p>
      </section>

      <section className="panel">
        <h2>1. Nominee Submission</h2>
        <p className="supporting-text">
          Select city and award category, then submit nominee details. Duplicate
          protection checks Airtable-loaded nominations.
        </p>

        {bootstrapLoading && <p className="supporting-text">Loading Airtable data...</p>}
        {bootstrapError && <p className="error-text">Airtable load failed: {bootstrapError}</p>}
        {airtableSnapshot && (
          <p className="supporting-text muted">
            Airtable base: {airtableSnapshot.baseId}. Existing referees: {airtableSnapshot.refereesCount}.
            Referee forms: {airtableSnapshot.refereeFormsSubmitted}/{airtableSnapshot.refereeFormsCount} submitted.
          </p>
        )}

        <form onSubmit={submitNomination} className="form-grid">
          <div className="field-group">
            <span className="field-label">City</span>
            <div className="radio-row">
              {cityOptions.map((city) => (
                <label key={city.id}>
                  <input
                    type="radio"
                    name="city"
                    checked={nominationForm.city === city.name}
                    onChange={() =>
                      setNominationForm((current) => ({
                        ...current,
                        city: city.name,
                        awardCategory: "",
                      }))
                    }
                  />
                  {city.name}
                </label>
              ))}
            </div>
          </div>

          <label>
            Award category
            <select
              value={nominationForm.awardCategory}
              onChange={(event) =>
                setNominationForm((current) => ({
                  ...current,
                  awardCategory: event.target.value,
                }))
              }
            >
              <option value="">Select category</option>
              {filteredAwards.map((category) => (
                <option key={category.id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Referral deadline
            <input
              type="date"
              value={nominationForm.nominationDeadline}
              onChange={(event) =>
                setNominationForm((current) => ({
                  ...current,
                  nominationDeadline: event.target.value,
                }))
              }
            />
          </label>

          <label>
            Nominee full name
            <input
              type="text"
              value={nominationForm.nomineeName}
              onChange={(event) =>
                setNominationForm((current) => ({
                  ...current,
                  nomineeName: event.target.value,
                }))
              }
              placeholder="Full name"
            />
          </label>

          <label>
            Nominee email
            <input
              type="email"
              value={nominationForm.nomineeEmail}
              onChange={(event) =>
                setNominationForm((current) => ({
                  ...current,
                  nomineeEmail: event.target.value,
                }))
              }
              placeholder="name@example.com"
            />
          </label>

          <label>
            Nominee phone
            <input
              type="tel"
              value={nominationForm.nomineePhone}
              onChange={(event) =>
                setNominationForm((current) => ({
                  ...current,
                  nomineePhone: event.target.value,
                }))
              }
              placeholder="###-###-####"
            />
          </label>

          <label className="full-row">
            Why is this nominee inspirational?
            <textarea
              rows={4}
              value={nominationForm.nomineeSummary}
              onChange={(event) =>
                setNominationForm((current) => ({
                  ...current,
                  nomineeSummary: event.target.value,
                }))
              }
              placeholder="Share impact and contribution"
            />
          </label>

          {nominationError && <p className="error-text">{nominationError}</p>}

          <button type="submit" className="primary-btn" disabled={nominationSubmitting}>
            {nominationSubmitting ? "Validating..." : "Save Nominee Details"}
          </button>
        </form>

        {nominationSubmitted && (
          <p className="success-text">
            Nominee details validated and captured (frontend simulation of Airtable
            record).
          </p>
        )}
      </section>

      <section className="panel">
        <h2>2. Referee Contact Details</h2>
        <p className="supporting-text">
          Collect two referees. Family members are disqualified and must be
          replaced.
        </p>

        <form onSubmit={submitReferees} className="form-grid">
          {referees.map((referee, index) => (
            <div key={`referee-contact-${index}`} className="referee-block">
              <h3>Referee {index + 1}</h3>
              <label>
                Full name
                <input
                  type="text"
                  value={referee.name}
                  onChange={(event) =>
                    setReferees((current) =>
                      current.map((item, i) =>
                        i === index ? { ...item, name: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={referee.email}
                  onChange={(event) =>
                    setReferees((current) =>
                      current.map((item, i) =>
                        i === index ? { ...item, email: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Phone
                <input
                  type="tel"
                  value={referee.phone}
                  onChange={(event) =>
                    setReferees((current) =>
                      current.map((item, i) =>
                        i === index ? { ...item, phone: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Relation to nominee
                <select
                  value={referee.relation}
                  onChange={(event) =>
                    setReferees((current) =>
                      current.map((item, i) =>
                        i === index ? { ...item, relation: event.target.value } : item,
                      ),
                    )
                  }
                >
                  <option value="">Select relation</option>
                  {relationOptions.map((relation) => (
                    <option key={relation} value={relation}>
                      {relation}
                    </option>
                  ))}
                </select>
              </label>
              {referee.relation === "Family Member" && (
                <p className="error-text inline-error">
                  Family members do not qualify as referees. Please enter a
                  different referee.
                </p>
              )}
            </div>
          ))}

          {refereeError && <p className="error-text">{refereeError}</p>}

          <button type="submit" className="primary-btn" disabled={!nominationSubmitted}>
            Save Referees
          </button>
        </form>

        {nominationSubmitted && !refereesSubmitted && (
          <p className="supporting-text muted">
            Save nominee details first, then submit referee contacts.
          </p>
        )}
      </section>

      <section className="panel">
        <h2>3. Invitations and Referral Forms</h2>
        <p className="supporting-text">
          Referee forms adapt to the selected award and stay in reminder workflow
          until submitted.
        </p>
        <p className="supporting-text muted">
          Invitation links should point to <code>/referee/{"{RefereeFormRecordId}"}</code> so the
          page loads award-specific questions plus default referee/nominee names from Airtable.
        </p>

        <div className="timeline">
          <p>
            Reminder cadence: every Wednesday between 8:00 AM and 10:00 AM, from
            1 to 4 weeks before deadline.
          </p>
          {reminderDates.length > 0 ? (
            <ul>
              {reminderDates.map((date) => (
                <li key={date.toISOString()}>{formatReminderDate(date)} (8:00 - 10:00 AM)</li>
              ))}
            </ul>
          ) : (
            <p className="muted">Set a deadline above to preview reminder dates.</p>
          )}
        </div>

        <button
          type="button"
          className="primary-btn"
          disabled={!refereesSubmitted}
          onClick={sendInvitations}
        >
          Send Invitation Emails (UI Simulation)
        </button>

        <div className="referee-status-grid">
          {referees.map((referee, index) => (
            <article key={`referee-status-${index}`} className="status-card">
              <h3>Referee {index + 1}</h3>
              <p>{referee.name || "Awaiting details"}</p>
              <p className="status-pill">Status: {refereeStatuses[index].replace("_", " ")}</p>
              <button
                type="button"
                className="outline-btn"
                disabled={!invitationsSent || refereeStatuses[index] === "submitted"}
                onClick={() => setActiveRefereeForm(index)}
              >
                Open Referee Form
              </button>
            </article>
          ))}
        </div>

        {activeRefereeForm !== null && (
          <form
            onSubmit={(event) => submitRefereeResponse(activeRefereeForm, event)}
            className="form-grid referee-response"
          >
            <h3>
              Referee {activeRefereeForm + 1} referral form ({nominationForm.awardCategory || "Award"})
            </h3>

            <label>
              How many years have you known the nominee?
              <input
                type="text"
                value={refereeResponses[activeRefereeForm].yearsKnown}
                onChange={(event) =>
                  setRefereeResponses((current) =>
                    current.map((response, i) =>
                      i === activeRefereeForm
                        ? { ...response, yearsKnown: event.target.value }
                        : response,
                    ),
                  )
                }
              />
            </label>

            <label>
              Describe one specific impact related to {nominationForm.awardCategory || "the award"}
              <textarea
                rows={4}
                value={refereeResponses[activeRefereeForm].impactExample}
                onChange={(event) =>
                  setRefereeResponses((current) =>
                    current.map((response, i) =>
                      i === activeRefereeForm
                        ? { ...response, impactExample: event.target.value }
                        : response,
                    ),
                  )
                }
              />
            </label>

            <label>
              Why is this nominee qualified for this award?
              <textarea
                rows={4}
                value={refereeResponses[activeRefereeForm].qualificationStatement}
                onChange={(event) =>
                  setRefereeResponses((current) =>
                    current.map((response, i) =>
                      i === activeRefereeForm
                        ? {
                            ...response,
                            qualificationStatement: event.target.value,
                          }
                        : response,
                    ),
                  )
                }
              />
            </label>

            {refereeResponseError && <p className="error-text">{refereeResponseError}</p>}

            <button type="submit" className="primary-btn">
              Submit Referral
            </button>
          </form>
        )}

        {isComplete && (
          <div className="success-box">
            <h3>All Referrals Completed</h3>
            <p>
              Confirmation emails marked as sent (frontend simulation). Final
              completion is now tracked for this nomination.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
