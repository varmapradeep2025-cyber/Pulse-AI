import type { HealthcareFacility } from "../types/domain";
import type { TranslationKey } from "../data/translations";
import { syntheticHospitals } from "./hospitals";

/*
 * Synthetic Demo assistant matching.
 *
 * This module maps a plain-language user message to:
 *   1. A basic urgency level (LOW / MODERATE / HIGH)
 *   2. A suggested healthcare department
 *   3. Matching hospitals from the synthetic hospital dataset
 *
 * IMPORTANT:
 *   This is NOT a medical diagnosis, triage, or eligibility scoring tool.
 *   It only surfaces healthcare-facility options for the demo.
 *   DO NOT present the output as medical advice.
 */

export type UrgencyLevel = "LOW" | "MODERATE" | "HIGH";

/**
 * Localizes a translated reply template. `params` are the factual values that
 * are injected verbatim (hospital names, cities, bed counts, urgency, etc.)
 * and are never translated.
 */
export type AssistantLocalizer = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export interface HospitalMatchResult {
  urgency: UrgencyLevel;
  suggestedDepartments: string[];
  matchedHospitals: HealthcareFacility[];
}

const HIGH_URGENCY_TERMS = [
  "chest pain",
  "heart",
  "heart attack",
  "breathing",
  "choking",
  "not breathing",
  "unconscious",
  "severe",
  "bleeding",
  "accident",
  "injury",
  "stroke",
  "seizure",
  "emergency",
  "crushing pain",
];

const MODERATE_URGENCY_TERMS = [
  "fever",
  "cough",
  "cold",
  "headache",
  "vomiting",
  "diarrhea",
  "weakness",
  "burn",
  "fracture",
  "broken",
  "pregnancy",
  "pregnant",
  "labour",
  "infection",
  "pain",
  "sugar",
];

const LOW_URGENCY_TERMS = [
  "checkup",
  "vaccination",
  "vaccine",
  "medicine",
  "prescription",
  "refill",
  "appointment",
  "routine",
  "test",
  "report",
  "consultation",
  "documents",
];

const DEPARTMENT_RULES: Array<{
  terms: string[];
  departments: string[];
}> = [
  {
    terms: ["chest pain", "heart", "heart attack", "palpitation"],
    departments: ["Cardiology", "Emergency"],
  },
  {
    terms: [
      "breathing",
      "choking",
      "not breathing",
      "unconscious",
      "accident",
      "injury",
      "bleeding",
      "severe",
      "stroke",
      "seizure",
      "emergency",
      "crushing pain",
    ],
    departments: ["Emergency"],
  },
  {
    terms: [
      "fever",
      "cough",
      "cold",
      "headache",
      "infection",
      "weakness",
      "vomiting",
      "diarrhea",
    ],
    departments: ["General Medicine"],
  },
  {
    terms: ["pregnant", "pregnancy", "labour", "maternal"],
    departments: ["Obstetrics & Gynaecology", "Maternal & Child Health"],
  },
  {
    terms: ["fracture", "broken", "joint", "sprain"],
    departments: ["Orthopedics"],
  },
  {
    terms: ["burn"],
    departments: ["Emergency", "General Surgery"],
  },
  {
    terms: ["test", "report", "diagnostic", "sugar", "blood"],
    departments: ["Diagnostics"],
  },
  {
    terms: ["vaccination", "vaccine", "child"],
    departments: ["Vaccination"],
  },
  {
    terms: ["medicine", "prescription", "refill", "pharmacy"],
    departments: ["General Medicine"],
  },
];

export function resolveUrgency(text: string): UrgencyLevel {
  const lower = text.toLowerCase();

  if (HIGH_URGENCY_TERMS.some((term) => lower.includes(term))) {
    return "HIGH";
  }

  if (MODERATE_URGENCY_TERMS.some((term) => lower.includes(term))) {
    return "MODERATE";
  }

  if (LOW_URGENCY_TERMS.some((term) => lower.includes(term))) {
    return "LOW";
  }

  return "LOW";
}

export function resolveDepartments(text: string): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];

  for (const rule of DEPARTMENT_RULES) {
    if (rule.terms.some((term) => lower.includes(term))) {
      for (const department of rule.departments) {
        if (!matched.includes(department)) {
          matched.push(department);
        }
      }
    }
  }

  if (matched.length === 0) {
    return ["General Medicine"];
  }

  return matched;
}

function hospitalSupportsDepartments(
  hospital: HealthcareFacility,
  departments: string[],
): boolean {
  const departmentNames = hospital.departments.map((department) =>
    department.toLowerCase(),
  );

  return departments.some((department) =>
    departmentNames.includes(department.toLowerCase()),
  );
}

export function matchHospitalNeeds(text: string): HospitalMatchResult {
  const urgency = resolveUrgency(text);
  const suggestedDepartments = resolveDepartments(text);

  const needsEmergency = suggestedDepartments.includes("Emergency");

  const matchedHospitals = syntheticHospitals
    .filter((hospital) => {
      const supportsDepartment = hospitalSupportsDepartments(
        hospital,
        suggestedDepartments,
      );

      if (needsEmergency) {
        return supportsDepartment && hospital.emergency_available;
      }

      return supportsDepartment;
    })
    .sort((a, b) => {
      /*
       * Prefer hospitals that cover more of the suggested departments,
       * then the ones with more beds available.
       */
      const coverage = (hospital: HealthcareFacility) =>
        suggestedDepartments.filter((department) =>
          hospital.departments.some(
            (name) => name.toLowerCase() === department.toLowerCase(),
          ),
        ).length;

      const coverageDifference = coverage(b) - coverage(a);

      if (coverageDifference !== 0) {
        return coverageDifference;
      }

      return b.available_beds - a.available_beds;
    })
    .slice(0, 5);

  return {
    urgency,
    suggestedDepartments,
    matchedHospitals,
  };
}

/*
 * Maps the English department and urgency values used by the demo dataset and
 * matching rules to translation keys, so the reply can be written entirely in
 * the selected language. Values not present here fall back to the original
 * dataset value (hospital names, cities, counts are never translated).
 */
const DEPARTMENT_KEYS: Record<string, TranslationKey> = {
  "general medicine": "department.generalMedicine",
  "general consultation": "department.generalConsultation",
  cardiology: "department.cardiology",
  emergency: "department.emergency",
  "general surgery": "department.generalSurgery",
  "obstetrics & gynaecology": "department.obstetricsGynaecology",
  pediatrics: "department.pediatrics",
  neonatology: "department.neonatology",
  "maternal & child health": "department.maternalChildHealth",
  vaccination: "department.vaccination",
  diagnostics: "department.diagnostics",
  laboratory: "department.laboratory",
  pathology: "department.pathology",
  radiology: "department.radiology",
  dermatology: "department.dermatology",
  pharmacy: "department.pharmacy",
  orthopedics: "department.orthopedics",
};

const URGENCY_KEYS: Record<UrgencyLevel, TranslationKey> = {
  LOW: "urgency.low",
  MODERATE: "urgency.moderate",
  HIGH: "urgency.high",
};

function localizeDepartment(
  name: string,
  localize: AssistantLocalizer,
): string {
  const key = DEPARTMENT_KEYS[name.trim().toLowerCase()];
  return key ? localize(key) : name;
}

function localizeUrgency(
  value: UrgencyLevel,
  localize: AssistantLocalizer,
): string {
  return localize(URGENCY_KEYS[value]);
}

export function formatMatchReply(
  result: HospitalMatchResult,
  localize: AssistantLocalizer,
): string {
  const lines: string[] = [];

  lines.push(
    localize("assistant.reply.urgency", {
      urgency: localizeUrgency(result.urgency, localize),
    }),
  );
  lines.push(
    localize("assistant.reply.suggestedDepartment", {
      departments: result.suggestedDepartments
        .map((department) => localizeDepartment(department, localize))
        .join(" / "),
    }),
  );
  lines.push("");

  if (result.matchedHospitals.length === 0) {
    lines.push(localize("assistant.reply.noMatch"));
  } else {
    lines.push(localize("assistant.reply.matchHeader"));
    lines.push("");

    for (const hospital of result.matchedHospitals) {
      const coveredDepartments = result.suggestedDepartments
        .filter((department) =>
          hospital.departments.some(
            (name) => name.toLowerCase() === department.toLowerCase(),
          ),
        )
        .map((department) => localizeDepartment(department, localize))
        .join(", ");

      const emergencyFlag = hospital.emergency_available
        ? localize("assistant.reply.emergencyAvailable")
        : localize("assistant.reply.emergencyUnavailable");

      lines.push(
        localize("assistant.reply.hospitalLine", {
          name: hospital.hospital_name,
          city: hospital.city,
          departments: coveredDepartments,
          emergency: emergencyFlag,
          beds: hospital.available_beds,
        }),
      );
    }
  }

  lines.push("");
  lines.push(localize("assistant.reply.safety"));

  return lines.join("\n");
}