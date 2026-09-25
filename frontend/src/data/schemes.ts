import type {
  HealthcareScheme,
  SchemeCategory,
  SchemeEligibilityField,
  SchemeScope,
} from "../types/domain";

/*
 * Synthetic Demo Data
 * -------------------
 * The schemes below are REAL, publicly-documented Government of India /
 * Government of Madhya Pradesh healthcare schemes. Benefits, eligibility
 * rules, and application methods are based on official public sources
 * (see `official_information_url` and `info_status` on each record).
 *
 * The dataset itself (ids, timestamps, and the demo-eligibility form
 * definitions) is part of the Pulse AI synthetic demo dataset. Pulse AI
 * does not approve, sanction, or guarantee any government benefit — the
 * official government source is the final authority.
 */

export const SCHEMES_SYNTHETIC_LABEL = "Synthetic Demo Data";

export const SCHEME_CATEGORIES: SchemeCategory[] = [
  "Health Insurance",
  "Maternal/Child Health",
  "Senior Citizens",
  "Disease Support",
  "Disability",
  "General Healthcare",
];

export const SCHEME_SCOPES: SchemeScope[] = ["Central", "State"];

export const AGE_OPTIONS = [
  "Under 18",
  "18–25",
  "26–35",
  "36–45",
  "46–60",
  "Above 60",
];

export const INCOME_OPTIONS = [
  "BPL (below poverty line)",
  "Very low income (non-BPL)",
  "Middle income",
  "Higher income",
];

interface SchemeEntry {
  scheme_id: string;
  name: string;
  short_description: string;
  full_description: string;
  category: SchemeCategory;
  scope: SchemeScope;
  target_beneficiaries: string[];
  eligibility_rules: string[];
  age_requirement?: string;
  income_requirement?: string;
  location_requirement?: string;
  coverage: string;
  required_documents: string[];
  application_method: string;
  application_steps: string[];
  official_information_url: string;
  last_updated: string;
  demo_eligibility_fields: SchemeEligibilityField[];
  info_status: "verified" | "needs-confirmation";
}

function scheme(entry: SchemeEntry): HealthcareScheme {
  return {
    id: entry.scheme_id,
    name: entry.name,
    whoIsFor: entry.target_beneficiaries.join(", "),
    documents: [...entry.required_documents],
    applicationSteps: entry.application_steps,
    isDemo: true,
    scheme_id: entry.scheme_id,
    short_description: entry.short_description,
    full_description: entry.full_description,
    category: entry.category,
    scope: entry.scope,
    target_beneficiaries: entry.target_beneficiaries,
    eligibility_rules: entry.eligibility_rules,
    age_requirement: entry.age_requirement,
    income_requirement: entry.income_requirement,
    location_requirement: entry.location_requirement,
    coverage: entry.coverage,
    required_documents: entry.required_documents,
    application_method: entry.application_method,
    official_information_url: entry.official_information_url,
    status: "Active",
    last_updated: entry.last_updated,
    demo_eligibility_fields: entry.demo_eligibility_fields,
    info_status: entry.info_status,
  };
}

export const sampleSchemes: HealthcareScheme[] = [
  scheme({
    scheme_id: "pmjay",
    name: "Ayushman Bharat – Pradhan Mantri Jan Arogya Yojana (AB-PMJAY)",
    short_description:
      "Free health insurance cover up to ₹5 lakh per family per year for hospital care.",
    full_description:
      "AB-PMJAY provides cashless secondary and tertiary hospitalisation cover of up to ₹5,00,000 per family per year to eligible families. It covers more than 1,900 procedures, including hospitalisation, pre- and post-hospitalisation, and follows the beneficiary across India.",
    category: "Health Insurance",
    scope: "Central",
    target_beneficiaries: [
      "Eligible low-income households listed in the SECC 2011 deprivation list",
      "Identified vulnerable families (rural & urban)",
    ],
    eligibility_rules: [
      "Family must be listed in the SECC 2011 deprivation list (rural) or occupational criteria (urban)",
      "No fixed income ceiling for families already in the beneficiary list",
      "Beneficiary verification is done through the Ayushman/PM-JAY beneficiary database at admission",
    ],
    income_requirement:
      "No fixed income ceiling; families identified through the SECC 2011 beneficiary list.",
    location_requirement: "Available across India (Central scheme).",
    coverage:
      "Cashless hospitalisation up to ₹5,00,000 per family per year at empanelled public and private hospitals, including diagnostics, medicines, and follow-up care.",
    required_documents: [
      "Aadhaar",
      "Address/residence proof",
      "Income certificate (BPL)",
      "Bank account details",
    ],
    application_method:
      "Families in the beneficiary list can check eligibility on https://pmjay.gov.in or at an Ayushman Mitra help desk at any empanelled hospital / CSC. The beneficiary card is issued, and hospitals verify eligibility at the time of admission.",
    application_steps: [
      "Check whether your family is in the SECC/Ayushman beneficiary list at pmjay.gov.in",
      "Visit an Ayushman Mitra help desk at an empanelled hospital or a CSC",
      "Get the Ayushman/PM-JAY beneficiary card issued for the family",
      "Show the card (or Aadhaar) at the hospital for cashless treatment",
    ],
    official_information_url: "https://pmjay.gov.in",
    last_updated: "2026-05-01",
    demo_eligibility_fields: [
      {
        key: "state",
        label: "State of residence",
        type: "select",
        options: ["Madhya Pradesh", "Any state / Central", "Other state"],
        matchValues: ["Madhya Pradesh", "Any state / Central", "Other state"],
        note: "Central scheme — available in all States/UTs.",
      },
      {
        key: "secc",
        label: "Is your family listed in the SECC/Ayushman beneficiary list?",
        type: "boolean",
        options: ["Yes", "No"],
        matchValues: ["Yes"],
      },
      {
        key: "bpl",
        label: "BPL / deprivation category household",
        type: "boolean",
        options: ["Yes", "No"],
        matchValues: ["Yes"],
      },
      {
        key: "income",
        label: "Household income category",
        type: "select",
        options: INCOME_OPTIONS,
        matchValues: ["BPL (below poverty line)", "Very low income (non-BPL)"],
      },
    ],
    info_status: "verified",
  }),

  scheme({
    scheme_id: "pmmvy",
    name: "Pradhan Mantri Matru Vandana Yojana (PMMVY)",
    short_description:
      "Cash maternity benefit (₹5,000 for the first child; ₹6,000 for the second child if a girl).",
    full_description:
      "PMMVY provides partial compensation for wage loss to pregnant women and lactating mothers through cash transfers, encouraging early pregnancy registration, antenatal check-ups, institutional delivery, and immunisation. ₹5,000 is paid in two instalments for the first child, and ₹6,000 (single instalment) for the second child if it is a girl.",
    category: "Maternal/Child Health",
    scope: "Central",
    target_beneficiaries: [
      "Pregnant and lactating mothers from disadvantaged sections",
      "First living child (and second child if the second child is a girl)",
    ],
    eligibility_rules: [
      "Pregnant women and lactating mothers aged approx. 18 to 55 years",
      "For the first living child of the family (second child only if it is a girl)",
      "Must belong to a socially/economically disadvantaged category (e.g., BPL, SC/ST, PMJAY beneficiary, E-Shram, MGNREGA job card, or net family income below ₹8 lakh per year)",
      "Not in regular employment with the Central/State Government or PSUs",
      "Application within 270 days of childbirth",
    ],
    age_requirement: "18 to 55 years (approx.)",
    income_requirement:
      "Net family income below ₹8 lakh per year (or another listed disadvantaged category).",
    location_requirement: "Available across India (Central scheme).",
    coverage:
      "₹5,000 for the first child (₹3,000 after pregnancy registration + antenatal check-up, ₹2,000 after birth registration and 14 weeks of immunisation); ₹6,000 single instalment for the second child if it is a girl. Paid by Direct Benefit Transfer.",
    required_documents: [
      "Aadhaar",
      "MCP card",
      "Bank account details",
      "Income certificate (BPL)",
    ],
    application_method:
      "Register at the nearest Anganwadi Centre (through an Anganwadi/ASHA worker) within 270 days of childbirth, or apply online at the official PMMVY portal (https://pmmvy.wcd.gov.in).",
    application_steps: [
      "Register the pregnancy at the Anganwadi Centre (MCP card is filled)",
      "Complete antenatal check-ups to unlock the first instalment",
      "Register the birth; complete child immunisation by 14 weeks",
      "Receive instalments by Direct Benefit Transfer to the bank/post-office account",
    ],
    official_information_url: "https://pmmvy.wcd.gov.in",
    last_updated: "2026-05-01",
    demo_eligibility_fields: [
      {
        key: "age",
        label: "Age",
        type: "age-range",
        options: AGE_OPTIONS,
        ageMin: 18,
        ageMax: 55,
      },
      {
        key: "income",
        label: "Household income category",
        type: "select",
        options: INCOME_OPTIONS,
        matchValues: ["BPL (below poverty line)", "Very low income (non-BPL)"],
        note: "Net family income below ₹8 lakh per year (or other listed categories).",
      },
      {
        key: "employee",
        label: "Regular employment with Central/State Government or PSU?",
        type: "boolean",
        options: ["Yes", "No"],
        matchValues: ["No"],
      },
      {
        key: "first_child",
        label: "Is this for the first living child?",
        type: "boolean",
        options: ["Yes", "No"],
        matchValues: ["Yes"],
      },
    ],
    info_status: "verified",
  }),

  scheme({
    scheme_id: "jsy",
    name: "Janani Suraksha Yojana (JSY)",
    short_description:
      "Cash assistance for women who deliver in a government health institution.",
    full_description:
      "JSY is a safe-motherhood intervention that provides cash assistance to pregnant women who deliver in a government health institution, reducing maternal and infant mortality. Benefits differ between Low Performing and High Performing States.",
    category: "Maternal/Child Health",
    scope: "Central",
    target_beneficiaries: [
      "Pregnant women aged 19 years and above",
      "BPL / low-income families",
    ],
    eligibility_rules: [
      "Pregnant women aged 19 years or older",
      "Delivery must take place in a government health institution (or an accredited private institution where eligible)",
      "BPL/low-income families; in High Performing States, benefits are limited to eligible categories",
    ],
    age_requirement: "19 years and above",
    income_requirement: "BPL / low-income families.",
    location_requirement: "Available across India (Central scheme).",
    coverage:
      "Cash assistance after institutional delivery (for example approximately ₹1,400 for rural and ₹1,000 for urban deliveries in Low Performing States, and ₹700 in High Performing States).",
    required_documents: [
      "Aadhaar",
      "MCP card",
      "Bank account details",
      "Income certificate (BPL)",
    ],
    application_method:
      "Register the pregnancy with the government health institution / ASHA worker and deliver at the institution. The health worker verifies and files the claim; payment is made by Direct Benefit Transfer.",
    application_steps: [
      "Register pregnancy at the government health institution",
      "Deliver at the government health institution",
      "ASHA/health worker verifies and submits the claim",
      "Receive the cash assistance by Direct Benefit Transfer",
    ],
    official_information_url: "https://nhm.gov.in",
    last_updated: "2026-05-01",
    demo_eligibility_fields: [
      {
        key: "age",
        label: "Age (at the time of delivery)",
        type: "age-range",
        options: AGE_OPTIONS,
        ageMin: 19,
      },
      {
        key: "bpl",
        label: "BPL / low-income family",
        type: "boolean",
        options: ["Yes", "No"],
        matchValues: ["Yes"],
      },
      {
        key: "govt_delivery",
        label: "Delivery at a government health institution",
        type: "boolean",
        options: ["Yes", "No"],
        matchValues: ["Yes"],
      },
    ],
    info_status: "verified",
  }),

  scheme({
    scheme_id: "jssk",
    name: "Janani Shishu Suraksha Karyakram (JSSK)",
    short_description:
      "Free delivery and health services for pregnant women and sick newborns at public facilities.",
    full_description:
      "JSSK guarantees free entitlements for pregnant women and sick newborns (up to 1 year) at government health institutions — including free delivery (normal and C-section), drugs, diagnostics, blood, diet during the hospital stay, and free transport from home to facility and back.",
    category: "Maternal/Child Health",
    scope: "Central",
    target_beneficiaries: [
      "All pregnant women delivering at public health institutions",
      "Sick newborns and children up to 1 year of age",
    ],
    eligibility_rules: [
      "All pregnant women accessing government health institutions",
      "Sick newborns/children up to 1 year of age at public facilities",
      "No income or age criteria — entitlements apply at public institutions",
    ],
    location_requirement: "Available across India (Central scheme).",
    coverage:
      "Free normal and C-section delivery, free drugs, consumables, diagnostics, blood, and diet during the stay, plus free transport home for the mother and sick newborn at public health institutions.",
    required_documents: ["Aadhaar", "MCP card"],
    application_method:
      "No separate application is required. Entitlements are provided automatically when the mother/newborn accesses care at a government health institution.",
    application_steps: [
      "Visit a government health institution for delivery or newborn care",
      "Provide maternal details (MCP card / Aadhaar)",
      "Receive free services, diet, and transport entitlements",
    ],
    official_information_url: "https://nhm.gov.in",
    last_updated: "2026-05-01",
    demo_eligibility_fields: [
      {
        key: "state",
        label: "State of residence",
        type: "select",
        options: ["Madhya Pradesh", "Any state / Central", "Other state"],
        matchValues: ["Madhya Pradesh", "Any state / Central", "Other state"],
        note: "Central scheme — available in all States/UTs.",
      },
      {
        key: "govt_delivery",
        label: "Plan to deliver / seek newborn care at a government institution?",
        type: "boolean",
        options: ["Yes", "No"],
        matchValues: ["Yes"],
      },
    ],
    info_status: "verified",
  }),

  scheme({
    scheme_id: "cghs",
    name: "Central Government Health Scheme (CGHS)",
    short_description:
      "Comprehensive healthcare for Central Government employees, pensioners, and their dependants.",
    full_description:
      "CGHS provides health care to serving Central Government employees, pensioners, and dependent family members through contributions, covering OPD, diagnostics, medicines, and in-patient treatment at CGHS dispensaries and empanelled hospitals.",
    category: "General Healthcare",
    scope: "Central",
    target_beneficiaries: [
      "Central Government employees",
      "Central Government pensioners",
      "Dependent family members",
    ],
    eligibility_rules: [
      "Serving Central Government employee / pensioner (or dependent family member)",
      "Membership is arranged through the employee's organisation on a contribution basis",
      "Family members of a serving member are covered",
    ],
    location_requirement: "Available across India (Central scheme).",
    coverage:
      "OPD consultation, diagnostics, medicines, and in-patient treatment at CGHS dispensaries and empanelled hospitals under the applicable contribution/benefit structure.",
    required_documents: [
      "Aadhaar",
      "Employer/service proof",
      "Address/residence proof",
      "Photograph",
    ],
    application_method:
      "Apply through the parent organisation (for serving employees) or the nearest CGHS Pay & Accounts Office (for pensioners) to obtain the CGHS card.",
    application_steps: [
      "Obtain the CGHS application through your organisation / CGHS office",
      "Submit service details and the applicable contribution basis",
      "CGHS card is issued",
      "Use the card at CGHS dispensaries and empanelled hospitals",
    ],
    official_information_url: "https://cghs.gov.in",
    last_updated: "2026-05-01",
    demo_eligibility_fields: [
      {
        key: "state",
        label: "State of residence",
        type: "select",
        options: ["Madhya Pradesh", "Any state / Central", "Other state"],
        matchValues: ["Madhya Pradesh", "Any state / Central", "Other state"],
        note: "Central scheme — available in all States/UTs.",
      },
      {
        key: "central_govt_employee",
        label: "Central Government employee or pensioner",
        type: "boolean",
        options: ["Yes", "No"],
        matchValues: ["Yes"],
      },
    ],
    info_status: "verified",
  }),

  scheme({
    scheme_id: "esic",
    name: "Employees' State Insurance Scheme (ESIC)",
    short_description:
      "Medical and cash benefits for employees covered under the ESI Act.",
    full_description:
      "The ESI Scheme provides full medical care (with no upper expenditure ceiling) to insured persons and their dependant family members, along with sickness, maternity, disablement, and dependant cash benefits for employees in establishments covered under the Employees' State Insurance Act.",
    category: "Health Insurance",
    scope: "Central",
    target_beneficiaries: [
      "Employees in establishments covered under the ESI Act",
      "Dependant family members of insured persons",
    ],
    eligibility_rules: [
      "Employee of an establishment covered under the ESI Act",
      "Gross wages up to ₹21,000 per month (₹25,000 per month for persons with disability)",
      "Medical benefit starts from the day of entering insurable employment",
    ],
    income_requirement:
      "Gross wages up to ₹21,000 per month (₹25,000 for persons with disability).",
    location_requirement: "Available across India (Central scheme).",
    coverage:
      "Full medical care (OPD, medicines, specialist consultation, hospitalisation) for the insured person and family with no expenditure ceiling, plus sickness, maternity, disablement and dependant benefits as per the ESI Act.",
    required_documents: [
      "ESI IP card",
      "Employer/service proof",
      "Aadhaar",
      "Photograph",
    ],
    application_method:
      "Coverage begins when the employer registers you in a covered establishment under the ESI Act. The Insured Person then receives the ESI IP card and can use ESIC dispensaries and hospitals immediately.",
    application_steps: [
      "Employer registers employees with ESIC",
      "Insured Person receives the ESI IP card",
      "Use the IP card at ESIC dispensaries/hospitals",
      "Claim applicable cash benefits (sickness, maternity, etc.)",
    ],
    official_information_url: "https://www.esic.gov.in",
    last_updated: "2026-05-01",
    demo_eligibility_fields: [
      {
        key: "state",
        label: "State of residence",
        type: "select",
        options: ["Madhya Pradesh", "Any state / Central", "Other state"],
        matchValues: ["Madhya Pradesh", "Any state / Central", "Other state"],
        note: "Central scheme — available in all States/UTs.",
      },
      {
        key: "employee",
        label: "Employed in an establishment covered under the ESI Act",
        type: "boolean",
        options: ["Yes", "No"],
        matchValues: ["Yes"],
      },
      {
        key: "income_band",
        label: "Monthly gross wages",
        type: "select",
        options: [
          "Up to ₹21,000/month",
          "₹21,000–₹25,000/month",
          "Above ₹25,000/month",
        ],
        matchValues: ["Up to ₹21,000/month", "₹21,000–₹25,000/month"],
        note: "Up to ₹25,000/month for persons with disability.",
      },
    ],
    info_status: "verified",
  }),

  scheme({
    scheme_id: "sambal-mp",
    name: "Mukhyamantri Jan Kalyan (Sambal) Yojana — Madhya Pradesh",
    short_description:
      "Social security for unorganised-sector workers in Madhya Pradesh (accident, death, disability and maternity support).",
    full_description:
      "The Sambal Yojana gives social-security support to crores of unorganised-sector workers in Madhya Pradesh. It covers accidental death, permanent/partial disability, normal-death assistance, funeral assistance, and maternity benefit for women workers. Registration is free.",
    category: "Disease Support",
    scope: "State",
    target_beneficiaries: [
      "Unorganised-sector workers in Madhya Pradesh (e.g. daily wagers, agricultural labourers, street vendors, construction workers, domestic workers)",
    ],
    eligibility_rules: [
      "Permanent resident of Madhya Pradesh",
      "Unorganised-sector worker",
      "Age 18 to 60 years",
      "BPL or income below the prescribed limit",
      "Not in government or organised salaried employment",
      "Samagra ID (family/individual identity) required",
    ],
    age_requirement: "18 to 60 years",
    income_requirement: "BPL / low income (prescribed limit).",
    location_requirement: "Residents of Madhya Pradesh (State scheme).",
    coverage:
      "Accidental death ₹4,00,000; permanent disability ₹4,00,000; partial disability ₹2,00,000; normal death ₹2,00,000; funeral assistance ₹5,000; maternity benefit for women workers (per scheme norms). Registration is free.",
    required_documents: [
      "Aadhaar",
      "Samagra ID card",
      "Income certificate (BPL)",
      "Bank account details",
      "Photograph",
    ],
    application_method:
      "Register online at the official Sambal portal (https://sambal.mp.gov.in) using the Samagra ID. Claims are filed through the same portal with the Sambal/Shramik card.",
    application_steps: [
      "Create or use your Samagra ID",
      "Register as an unorganised-sector worker on sambal.mp.gov.in",
      "Verify your details and receive the Sambal/Shramik card",
      "File claims through the portal when needed",
    ],
    official_information_url: "https://sambal.mp.gov.in",
    last_updated: "2026-05-01",
    demo_eligibility_fields: [
      {
        key: "state",
        label: "State of residence",
        type: "select",
        options: ["Madhya Pradesh", "Any state / Central", "Other state"],
        matchValues: ["Madhya Pradesh"],
        note: "This is a Madhya Pradesh state scheme.",
      },
      {
        key: "unorganized_worker",
        label: "Unorganised-sector worker",
        type: "boolean",
        options: ["Yes", "No"],
        matchValues: ["Yes"],
      },
      {
        key: "age",
        label: "Age",
        type: "age-range",
        options: AGE_OPTIONS,
        ageMin: 18,
        ageMax: 60,
      },
      {
        key: "bpl",
        label: "BPL / prescribed income limit",
        type: "boolean",
        options: ["Yes", "No"],
        matchValues: ["Yes"],
      },
      {
        key: "samagra",
        label: "Samagra ID holder (MP)",
        type: "boolean",
        options: ["Yes", "No"],
        matchValues: ["Yes"],
      },
    ],
    info_status: "verified",
  }),

  scheme({
    scheme_id: "niramaya",
    name: "Niramaya Health Insurance Scheme (National Trust)",
    short_description:
      "Health insurance for persons with Autism, Cerebral Palsy, Intellectual and Multiple Disabilities.",
    full_description:
      "Niramaya provides affordable health insurance cover (up to ₹1,00,000 per person per year) to persons with disabilities covered under the National Trust Act, on a reimbursement basis. Cover includes OPD treatment, medicine, pathology and diagnostic tests, corrective surgeries, therapies, and transport.",
    category: "Disability",
    scope: "Central",
    target_beneficiaries: [
      "Persons with Autism",
      "Cerebral Palsy",
      "Intellectual Disability",
      "Multiple Disabilities (under the National Trust Act)",
    ],
    eligibility_rules: [
      "Person with a disability covered under the National Trust Act (Autism, Cerebral Palsy, Intellectual or Multiple Disabilities)",
      "Valid disability certificate / UDID required",
      "Available nationwide; nominal annual premium by category (e.g. ₹250 for BPL, ₹250/₹500 for APL families depending on income)",
    ],
    income_requirement:
      "None for eligibility; the annual premium depends on the family income category (BPL/APL).",
    location_requirement: "Available across India (Central scheme).",
    coverage:
      "Health insurance cover up to ₹1,00,000 per person per year on a reimbursement basis — OPD, hospitalisation, corrective surgeries, ongoing therapies, alternative medicine (AYUSH), dental care, and transport.",
    required_documents: [
      "Aadhaar",
      "Disability certificate (UDID)",
      "Address/residence proof",
      "Income certificate (BPL)",
    ],
    application_method:
      "Apply through an organisation registered with the National Trust, or directly on the Niramaya portal, using a valid disability certificate. The nominal premium is paid at enrolment.",
    application_steps: [
      "Obtain a disability certificate / UDID from the competent authority",
      "Apply through a National Trust-registered organisation or the Niramaya portal",
      "Pay the nominal annual premium by category",
      "Use the cover at approved/empanelled facilities (reimbursement-based)",
    ],
    official_information_url: "https://nationaltrust.nic.in",
    last_updated: "2026-05-01",
    demo_eligibility_fields: [
      {
        key: "state",
        label: "State of residence",
        type: "select",
        options: ["Madhya Pradesh", "Any state / Central", "Other state"],
        matchValues: ["Madhya Pradesh", "Any state / Central", "Other state"],
        note: "Central scheme — available in all States/UTs.",
      },
      {
        key: "disability",
        label: "Person with a qualifying disability (National Trust Act) with a valid certificate",
        type: "boolean",
        options: ["Yes", "No"],
        matchValues: ["Yes"],
      },
    ],
    info_status: "verified",
  }),

  scheme({
    scheme_id: "vayoshri",
    name: "Rashtriya Vayoshri Yojana (RVY)",
    short_description:
      "Free assisted-living devices for senior citizens (60+) belonging to the BPL category.",
    full_description:
      "RVY provides assisted-living devices free of cost to senior citizens aged 60 and above belonging to the BPL category who suffer from age-related infirmities such as low vision, hearing impairment, loss of teeth, or locomotor disability. Devices include walking sticks, walkers, wheelchairs, hearing aids, spectacles, and artificial dentures. It is implemented by ALIMCO through district assessment and distribution camps.",
    category: "Senior Citizens",
    scope: "Central",
    target_beneficiaries: [
      "Senior citizens aged 60 years and above",
      "BPL category (monthly income not more than ₹15,000)",
    ],
    eligibility_rules: [
      "Senior citizen aged 60 years or above",
      "BPL category with monthly income not more than ₹15,000",
      "Age-related infirmity (low vision, hearing impairment, loss of teeth, or locomotor disability)",
      "Aadhaar (or an acceptable identity document)",
      "Should not have received the same device free from the Government in the last 3 years",
    ],
    age_requirement: "60 years and above (devices for 80+ citizens are provided at the doorstep)",
    income_requirement:
      "BPL category; monthly income not more than ₹15,000.",
    location_requirement: "Available across India (Central scheme).",
    coverage:
      "Free assisted-living devices — walking sticks, elbow crutches, walkers, tripods/quadpods, hearing aids, wheelchairs, artificial dentures, and spectacles — distributed through assessment/distribution camps.",
    required_documents: [
      "Aadhaar",
      "Age proof",
      "Income certificate (BPL)",
      "Medical certificate",
    ],
    application_method:
      "Beneficiaries are identified through assessment camps organised by the district administration with ALIMCO. Contact the district social justice officer / senior citizen camp for your district; there is no separate online citizen application.",
    application_steps: [
      "Confirm eligibility through the district assessment camp",
      "Attend the camp with your identity and BPL documents",
      "A medical officer verifies the infirmity",
      "Devices are distributed free at the camp (doorstep for citizens aged 80+)",
    ],
    official_information_url: "https://socialjustice.gov.in",
    last_updated: "2026-05-01",
    demo_eligibility_fields: [
      {
        key: "age",
        label: "Age",
        type: "age-range",
        options: AGE_OPTIONS,
        ageMin: 60,
      },
      {
        key: "income_band",
        label: "Monthly income",
        type: "select",
        options: ["Up to ₹15,000/month", "Above ₹15,000/month"],
        matchValues: ["Up to ₹15,000/month"],
      },
      {
        key: "bpl",
        label: "BPL category",
        type: "boolean",
        options: ["Yes", "No"],
        matchValues: ["Yes"],
      },
    ],
    info_status: "verified",
  }),

  scheme({
    scheme_id: "pmbjp",
    name: "Pradhan Mantri Bhartiya Janaushadhi Pariyojana (PMBJP)",
    short_description:
      "Subsidised generic medicines at Jan Aushadhi Kendras across India.",
    full_description:
      "PMBJP makes quality generic medicines available at affordable prices through Jan Aushadhi Kendras. Generics are typically 50–90% cheaper than branded alternatives. There is no eligibility criterion — medicines are available to everyone with a prescription.",
    category: "General Healthcare",
    scope: "Central",
    target_beneficiaries: ["Everyone (open to all citizens)"],
    eligibility_rules: [
      "Open to everyone — no income, age, or location criteria",
      "No application form, card, or enrolment required",
      "Carry a doctor's prescription and visit any Jan Aushadhi Kendra",
    ],
    location_requirement: "Available across India (Central scheme).",
    coverage:
      "Quality generic medicines at subsidised rates (typically 50–90% cheaper than branded equivalents) at Jan Aushadhi Kendras across India.",
    required_documents: [],
    application_method:
      "No application is required. Visit any Jan Aushadhi Kendra with a doctor's prescription and purchase generic medicines at subsidised rates.",
    application_steps: [
      "Carry a doctor's prescription",
      "Visit a Jan Aushadhi Kendra",
      "Purchase generic medicines at subsidised rates",
    ],
    official_information_url: "https://janaushadhi.gov.in",
    last_updated: "2026-05-01",
    demo_eligibility_fields: [],
    info_status: "verified",
  }),
];

export function findSchemeBySchemeId(
  schemeId: string,
): HealthcareScheme | undefined {
  return sampleSchemes.find((schemeRecord) => schemeRecord.scheme_id === schemeId);
}