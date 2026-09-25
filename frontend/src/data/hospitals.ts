import type { HealthcareFacility } from "../types/domain";

/*
 * Synthetic Demo Data
 * -------------------
 * The hospitals below are FICTIONAL records generated for the Pulse AI
 * hackathon demo. They are based on realistic Indian public-healthcare
 * facility patterns but are NOT real hospitals, real capacity figures,
 * or real contact numbers. Do not use them for real navigation or care.
 */

export const SYNTHETIC_DATA_LABEL = "Synthetic Demo Data";

export const syntheticHospitals: HealthcareFacility[] = [
  {
    id: "H001",
    name: "Pulse Care Multispecialty Hospital",
    location: "Gwalior, Madhya Pradesh",
    facilityType: "Public Hospital",
    services: ["OPD", "Emergency", "Diagnostics", "Lab tests", "X-Ray", "Pharmacy"],
    openingHours: "24 hours, all days",
    availability: "Open",
    isDemo: true,

    hospital_id: "H001",
    hospital_name: "Pulse Care Multispecialty Hospital",
    city: "Gwalior",
    state: "Madhya Pradesh",
    address: "Pulse Road, Lashkar, Gwalior, Madhya Pradesh 474001",
    latitude: 26.2183,
    longitude: 78.1828,
    hospital_type: "Multi-Specialty",
    emergency_available: true,
    phone: "+91 751 244 5678",
    departments: [
      "Emergency",
      "Cardiology",
      "General Medicine",
      "Orthopedics",
      "Pediatrics",
      "Diagnostic & Laboratory",
    ],
    bed_capacity: 300,
    available_beds: 47,
    ICU_beds: 40,
    available_ICU_beds: 6,
    specialties: ["Cardiology", "Orthopedics", "General Medicine", "Pediatrics"],
    status: "Open",
  },
  {
    id: "H002",
    name: "Central District Hospital",
    location: "Indore, Madhya Pradesh",
    facilityType: "District Hospital",
    services: ["OPD", "Emergency", "Pharmacy", "Vaccination"],
    openingHours: "24 hours, all days",
    availability: "Busy",
    isDemo: true,

    hospital_id: "H002",
    hospital_name: "Central District Hospital",
    city: "Indore",
    state: "Madhya Pradesh",
    address: "Janpath Marg, Vijay Nagar, Indore, Madhya Pradesh 452010",
    latitude: 22.7196,
    longitude: 75.8577,
    hospital_type: "Government District Hospital",
    emergency_available: true,
    phone: "+91 731 288 4455",
    departments: [
      "Emergency",
      "General Medicine",
      "General Surgery",
      "Pediatrics",
      "ENT",
      "Dermatology",
    ],
    bed_capacity: 450,
    available_beds: 62,
    ICU_beds: 55,
    available_ICU_beds: 12,
    specialties: ["General Surgery", "Emergency & Trauma", "Internal Medicine"],
    status: "Busy",
  },
  {
    id: "H003",
    name: "Seva Community Health Centre",
    location: "Bhopal, Madhya Pradesh",
    facilityType: "Community Health Centre",
    services: ["OPD", "Maternal care", "Vaccination"],
    openingHours: "8:00 AM – 8:00 PM, Mon–Sat",
    availability: "Open",
    isDemo: true,

    hospital_id: "H003",
    hospital_name: "Seva Community Health Centre",
    city: "Bhopal",
    state: "Madhya Pradesh",
    address: "Seva Nagar, Arera Colony, Bhopal, Madhya Pradesh 462016",
    latitude: 23.2599,
    longitude: 77.4126,
    hospital_type: "Community Health Centre",
    emergency_available: false,
    phone: "+91 755 266 3344",
    departments: [
      "General Medicine",
      "Maternal & Child Health",
      "Vaccination",
      "Minor Surgery",
    ],
    bed_capacity: 60,
    available_beds: 15,
    ICU_beds: 4,
    available_ICU_beds: 0,
    specialties: ["Community Health", "Maternal & Child Health"],
    status: "Open",
  },
  {
    id: "H004",
    name: "Aarogya Diagnostics & Care Centre",
    location: "Jabalpur, Madhya Pradesh",
    facilityType: "Dispensary",
    services: ["OPD", "Diagnostics", "Lab tests", "X-Ray", "Pharmacy"],
    openingHours: "7:00 AM – 9:00 PM, all days",
    availability: "High Demand",
    isDemo: true,

    hospital_id: "H004",
    hospital_name: "Aarogya Diagnostics & Care Centre",
    city: "Jabalpur",
    state: "Madhya Pradesh",
    address: "Civil Lines Road, Gorakhpur Colony, Jabalpur, Madhya Pradesh 482001",
    latitude: 23.1815,
    longitude: 79.9864,
    hospital_type: "Diagnostic & Care Centre",
    emergency_available: false,
    phone: "+91 761 400 1122",
    departments: ["Diagnostics", "Laboratory", "Pharmacy", "General Consultation"],
    bed_capacity: 20,
    available_beds: 8,
    ICU_beds: 0,
    available_ICU_beds: 0,
    specialties: ["Pathology", "Radiology", "Preventive Care"],
    status: "High Demand",
  },
  {
    id: "H005",
    name: "Janani Maternal & Child Care Hospital",
    location: "Ujjain, Madhya Pradesh",
    facilityType: "Primary Health Centre",
    services: ["OPD", "Emergency", "Maternal care", "Vaccination"],
    openingHours: "24 hours, all days",
    availability: "Busy",
    isDemo: true,

    hospital_id: "H005",
    hospital_name: "Janani Maternal & Child Care Hospital",
    city: "Ujjain",
    state: "Madhya Pradesh",
    address: "Bhopal Road, Nai Sadak, Ujjain, Madhya Pradesh 456001",
    latitude: 23.1793,
    longitude: 75.7849,
    hospital_type: "Maternal & Child Care",
    emergency_available: true,
    phone: "+91 734 255 9810",
    departments: [
      "Emergency",
      "Obstetrics & Gynaecology",
      "Pediatrics",
      "Neonatal Care",
      "Vaccination",
    ],
    bed_capacity: 120,
    available_beds: 24,
    ICU_beds: 18,
    available_ICU_beds: 5,
    specialties: ["Obstetrics", "Neonatology", "Pediatrics"],
    status: "Busy",
  },
];

export function getHospitalById(
  hospitalId: string | undefined,
): HealthcareFacility | undefined {
  if (!hospitalId) {
    return undefined;
  }

  return syntheticHospitals.find(
    (hospital) => hospital.hospital_id === hospitalId,
  );
}

export function getHospitalName(
  hospitalId: string | undefined,
): string {
  const hospital = getHospitalById(hospitalId);

  return hospital
    ? hospital.hospital_name
    : hospitalId ?? "Unknown hospital";
}