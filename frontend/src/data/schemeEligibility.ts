import type {
  HealthcareScheme,
  SchemeEligibilityField,
} from "../types/domain";
import {
  isDocumentAvailable,
  demoCitizenProfile,
  type DemoCitizenProfile,
} from "./demoCitizen";

/*
 * Basic eligibility logic for the Government Schemes demo.
 *
 * This is a PROTOTYPE eligibility assessment based on a synthetic citizen
 * profile and structured scheme data. It never produces an official
 * eligibility determination — the official government source is the final
 * authority.
 */

export type FieldResult = "matched" | "not-met" | "unknown";

export type EligibilityOutcome = "eligible" | "not-eligible" | "more-info";

export const NOT_SURE_OPTION =
  "Not sure — more information needed";

export interface EligibilityFieldResult {
  field: SchemeEligibilityField;
  selected: string;
  result: FieldResult;
}

export interface EligibilityResult {
  fieldResults: EligibilityFieldResult[];
  outcome: EligibilityOutcome;
}

export interface SchemeMatchReasons {
  matched: string[];
  notMet: string[];
  unknown: string[];
  missingDocuments: string[];
}

export interface SchemeMatch {
  scheme: HealthcareScheme;
  outcome: EligibilityOutcome;
  reasons: SchemeMatchReasons;
  requiredDocumentsAvailable: number;
  requiredDocumentsTotal: number;
}

const PROFILE_ANSWERS: Record<string, string> = {
  state: demoCitizenProfile.state,
  secc: demoCitizenProfile.seccListed,
  bpl: demoCitizenProfile.bplCardHolder,
  income: demoCitizenProfile.incomeCategory,
  income_band: demoCitizenProfile.incomeBand,
  employee: demoCitizenProfile.employeeStatus,
  central_govt_employee: demoCitizenProfile.centralGovtEmployee,
  disability: demoCitizenProfile.disabilityStatus,
  first_child: demoCitizenProfile.firstLiveBirth,
  govt_delivery: demoCitizenProfile.govtInstitutionalDelivery,
  unorganized_worker: demoCitizenProfile.unorganizedWorker,
  samagra: demoCitizenProfile.samagraIdHolder,
};

/** Human-readable answer choices for a scheme field. */
export function fieldOptions(field: SchemeEligibilityField): string[] {
  return [...(field.options ?? []), NOT_SURE_OPTION];
}

function ageBucketForAge(
  age: number,
  options: string[],
): string {
  for (const option of options) {
    const match = option.match(/(\d+)\s*[–—-]\s*(\d+)/);

    if (match) {
      const low = Number(match[1]);
      const high = Number(match[2]);

      if (age >= low && age <= high) {
        return option;
      }
    }
  }

  if (age < 18) {
    return options[0] ?? "";
  }

  return options[options.length - 1] ?? "";
}

/** The value a scheme field is initially prefilled with from the demo profile. */
export function prefillFieldValue(
  field: SchemeEligibilityField,
  profile: DemoCitizenProfile = demoCitizenProfile,
): string {
  if (field.type === "age-range") {
    return ageBucketForAge(profile.age, field.options ?? []);
  }

  const profileValue = PROFILE_ANSWERS[field.key];

  if (profileValue && (field.options ?? []).includes(profileValue)) {
    return profileValue;
  }

  return (field.options ?? [])[0] ?? "";
}

/** Evaluate a single scheme field answer. */
export function evaluateField(
  field: SchemeEligibilityField,
  value: string,
): FieldResult {
  if (!value || value === NOT_SURE_OPTION) {
    return "unknown";
  }

  if (field.type === "age-range") {
    const match = value.match(/(\d+)\s*[–—-]\s*(\d+)/);

    if (!match) {
      return "unknown";
    }

    const bucketLow = Number(match[1]);
    const bucketHigh = Number(match[2]);
    const min = field.ageMin ?? 0;
    const max = field.ageMax ?? Number.POSITIVE_INFINITY;

    return bucketLow <= max && bucketHigh >= min ? "matched" : "not-met";
  }

  const accepted = (field.matchValues ?? []).map((item) => item.trim());

  return accepted.includes(value.trim()) ? "matched" : "not-met";
}

/** Evaluate all fields of a scheme with the provided answers. */
export function evaluateEligibility(
  scheme: HealthcareScheme,
  answers: Record<string, string>,
  profile: DemoCitizenProfile = demoCitizenProfile,
): EligibilityResult {
  if (scheme.demo_eligibility_fields.length === 0) {
    return {
      fieldResults: [],
      outcome: "eligible",
    };
  }

  const fieldResults: EligibilityFieldResult[] =
    scheme.demo_eligibility_fields.map((field) => {
      const value =
        answers[field.key] ?? prefillFieldValue(field, profile);

      return {
        field,
        selected: value,
        result: evaluateField(field, value),
      };
    });

  let outcome: EligibilityOutcome = "eligible";

  if (fieldResults.some((result) => result.result === "not-met")) {
    outcome = "not-eligible";
  } else if (fieldResults.some((result) => result.result === "unknown")) {
    outcome = "more-info";
  }

  return { fieldResults, outcome };
}

/** Default prefilled answers (from the synthetic demo citizen profile). */
export function prefilledAnswers(
  scheme: HealthcareScheme,
): Record<string, string> {
  const answers: Record<string, string> = {};

  for (const field of scheme.demo_eligibility_fields) {
    answers[field.key] = prefillFieldValue(field);
  }

  return answers;
}

/* ------------------------------------------------------------------ */
/* Document connection                                                 */
/* ------------------------------------------------------------------ */

function reasonLines(
  scheme: HealthcareScheme,
  result: EligibilityResult,
): SchemeMatchReasons {
  const matched: string[] = [];
  const notMet: string[] = [];
  const unknown: string[] = [];

  for (const { field, result: fieldOutcome } of result.fieldResults) {
    if (fieldOutcome === "matched") {
      matched.push(field.label);
    } else if (fieldOutcome === "not-met") {
      notMet.push(field.label);
    } else {
      unknown.push(field.label);
    }
  }

  const missingDocuments = scheme.required_documents.filter(
    (name) => !isDocumentAvailable(name),
  );

  return { matched, notMet, unknown, missingDocuments };
}

/**
 * Compare the synthetic demo citizen profile against every scheme and
 * return "potentially relevant" schemes. Neutral language only — this is
 * not an official eligibility determination.
 */
export function matchSchemesForCitizen(
  schemes: HealthcareScheme[],
  profile: DemoCitizenProfile = demoCitizenProfile,
): SchemeMatch[] {
  const matches: SchemeMatch[] = schemes.map((scheme) => {
    const answers = prefilledAnswers(scheme);

    const result = evaluateEligibility(scheme, answers, profile);

    const reasons = reasonLines(scheme, result);

    return {
      scheme,
      outcome: result.outcome,
      reasons,
      requiredDocumentsAvailable:
        scheme.required_documents.length - reasons.missingDocuments.length,
      requiredDocumentsTotal: scheme.required_documents.length,
    };
  });

  const rank: Record<EligibilityOutcome, number> = {
    eligible: 0,
    "more-info": 1,
    "not-eligible": 2,
  };

  return matches.sort((a, b) => {
    const rankDiff = rank[a.outcome] - rank[b.outcome];

    if (rankDiff !== 0) {
      return rankDiff;
    }

    return (
      a.reasons.missingDocuments.length -
      b.reasons.missingDocuments.length
    );
  });
}