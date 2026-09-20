import type { HealthcareScheme } from "../types/domain";

export const sampleSchemes: HealthcareScheme[] = [
  {
    id: "demo-scheme-1",
    name: "Sample Health Coverage Scheme",
    whoIsFor: "Demo: low-income families in a demo district",
    documents: [
      "Aadhaar (demo)",
      "Address proof (demo)",
      "Income certificate (demo)",
    ],
    applicationSteps: [
      "Go to the nearest demo centre with your documents.",
      "Fill the form (demo form).",
      "Collect the acknowledgement slip (demo).",
      "Use the slip at the listed demo facilities.",
    ],
    isDemo: true,
  },
  {
    id: "demo-scheme-2",
    name: "Demo Maternal Care Scheme",
    whoIsFor: "Demo: pregnant women in a demo area",
    documents: [
      "Aadhaar (demo)",
      "Maternal health card (demo)",
    ],
    applicationSteps: [
      "Register at the nearest demo health centre.",
      "Attend the demo check-up schedule.",
      "Receive support as per demo rules.",
    ],
    isDemo: true,
  },
  {
    id: "demo-scheme-3",
    name: "Example Senior Citizen Scheme",
    whoIsFor: "Demo: senior citizens in a demo region",
    documents: [
      "Age proof (demo)",
      "Address proof (demo)",
      "Recent photo (demo)",
    ],
    applicationSteps: [
      "Visit the demo office with the required documents.",
      "Fill the demo application form.",
      "Collect the demo card.",
    ],
    isDemo: true,
  },
  {
    id: "demo-scheme-4",
    name: "Sample School Health Scheme",
    whoIsFor: "Demo: children in demo government schools",
    documents: [
      "School enrolment proof (demo)",
      "Birth certificate (demo)",
    ],
    applicationSteps: [
      "School staff help with enrolment (demo).",
      "Health check-ups happen at school (demo).",
      "Parents receive a demo health card.",
    ],
    isDemo: true,
  },
];