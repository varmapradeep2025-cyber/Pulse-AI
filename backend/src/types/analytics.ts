export interface AnalyticsUser {
  id: string;
  email?: string;
  isStaff: boolean;
  hospitalIds: number[];
  allHospitals: boolean;
}
