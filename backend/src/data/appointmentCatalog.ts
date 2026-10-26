import type { AppointmentHospital } from "../types/appointments.js";

/*
 * Fictional appointment catalog for the Pulse AI demo.
 * It mirrors the synthetic hospital IDs used by the citizen portal but does
 * not represent real hospital departments, doctor rosters or availability.
 */
export const APPOINTMENT_DEMO_HOSPITALS: readonly AppointmentHospital[] = [
  {
    id: "H001",
    name: "Pulse Care Multispecialty Hospital",
    city: "Gwalior",
    departments: [
      {
        id: "general-medicine",
        name: "General Medicine",
        doctors: [
          {
            id: "H001-GM-01",
            name: "Dr. Asha Verma",
            approvalRequired: false,
            availableWeekdays: [1, 2, 3, 4, 5],
          },
          {
            id: "H001-GM-02",
            name: "Dr. Nikhil Rao",
            approvalRequired: false,
            availableWeekdays: [1, 3, 5, 6],
          },
        ],
      },
      {
        id: "cardiology",
        name: "Cardiology",
        doctors: [
          {
            id: "H001-CA-01",
            name: "Dr. Meera Kulkarni",
            approvalRequired: true,
            availableWeekdays: [2, 4],
          },
        ],
      },
      {
        id: "pediatrics",
        name: "Pediatrics",
        doctors: [
          {
            id: "H001-PE-01",
            name: "Dr. Sameer Jain",
            approvalRequired: false,
            availableWeekdays: [1, 2, 3, 4, 5, 6],
          },
        ],
      },
    ],
  },
  {
    id: "H002",
    name: "Central District Hospital",
    city: "Indore",
    departments: [
      {
        id: "general-medicine",
        name: "General Medicine",
        doctors: [
          {
            id: "H002-GM-01",
            name: "Dr. Kavita Menon",
            approvalRequired: true,
            availableWeekdays: [1, 2, 3, 4, 5],
          },
        ],
      },
      {
        id: "general-surgery",
        name: "General Surgery",
        doctors: [
          {
            id: "H002-GS-01",
            name: "Dr. Rohan Deshmukh",
            approvalRequired: true,
            availableWeekdays: [1, 3, 5],
          },
        ],
      },
    ],
  },
  {
    id: "H003",
    name: "Seva Community Health Centre",
    city: "Bhopal",
    departments: [
      {
        id: "general-medicine",
        name: "General Medicine",
        doctors: [
          {
            id: "H003-GM-01",
            name: "Dr. Anita Sharma",
            approvalRequired: false,
            availableWeekdays: [1, 2, 3, 4, 5, 6],
          },
        ],
      },
      {
        id: "maternal-child-health",
        name: "Maternal & Child Health",
        doctors: [
          {
            id: "H003-MC-01",
            name: "Dr. Priya Nair",
            approvalRequired: false,
            availableWeekdays: [1, 2, 3, 4, 5],
          },
        ],
      },
    ],
  },
  {
    id: "H004",
    name: "Aarogya Diagnostics & Care Centre",
    city: "Jabalpur",
    departments: [
      {
        id: "general-medicine",
        name: "General Medicine",
        doctors: [
          {
            id: "H004-GM-01",
            name: "Dr. Vivek Patel",
            approvalRequired: false,
            availableWeekdays: [1, 2, 3, 4, 5, 6],
          },
        ],
      },
      {
        id: "diagnostics",
        name: "Diagnostics",
        doctors: [
          {
            id: "H004-DI-01",
            name: "Dr. Neha Bansal",
            approvalRequired: false,
            availableWeekdays: [1, 2, 3, 4, 5],
          },
        ],
      },
    ],
  },
  {
    id: "H005",
    name: "Janani Maternal & Child Care Hospital",
    city: "Ujjain",
    departments: [
      {
        id: "obstetrics-gynaecology",
        name: "Obstetrics & Gynaecology",
        doctors: [
          {
            id: "H005-OG-01",
            name: "Dr. Farah Khan",
            approvalRequired: true,
            availableWeekdays: [1, 2, 3, 4, 5],
          },
        ],
      },
      {
        id: "pediatrics",
        name: "Pediatrics",
        doctors: [
          {
            id: "H005-PE-01",
            name: "Dr. Arjun Singh",
            approvalRequired: false,
            availableWeekdays: [1, 2, 3, 4, 5, 6],
          },
        ],
      },
    ],
  },
];

export function findDemoHospital(
  hospitalId: string,
): AppointmentHospital | undefined {
  return APPOINTMENT_DEMO_HOSPITALS.find(
    (hospital) => hospital.id === hospitalId,
  );
}
