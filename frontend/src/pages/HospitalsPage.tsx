import { useEffect, useMemo, useState } from "react";
import { sampleFacilities } from "../data/facilities";
import { useLanguage } from "../context/LanguageContext";
import { useSimpleMode } from "../context/SimpleModeContext";
import HealthcareCard from "../components/HealthcareCard";
import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import type { FacilityType } from "../types/domain";
import type { TranslationKey } from "../data/translations";

const AVAILABILITY_FILTERS = ["All", "Open", "Busy", "High Demand"] as const;

const AVAILABILITY_KEYS: Record<
  (typeof AVAILABILITY_FILTERS)[number],
  TranslationKey
> = {
  All: "hospital.all",
  Open: "hospital.open",
  Busy: "hospital.busy",
  "High Demand": "hospital.highDemand",
};

const FACILITY_TYPE_KEYS: Record<FacilityType, TranslationKey> = {
  "Public Hospital": "facility.publicHospital",
  "District Hospital": "facility.districtHospital",
  "Community Health Centre": "facility.communityHealthCentre",
  "Primary Health Centre": "facility.primaryHealthCentre",
  Dispensary: "facility.dispensary",
};

const LOCATION_OPTIONS: Array<{ value: string; labelKey: TranslationKey }> = [
  { value: "Any location", labelKey: "hospital.anyLocation" },
  { value: "Demo City", labelKey: "hospital.demoCity" },
  { value: "Demo District", labelKey: "hospital.demoDistrict" },
];

export default function HospitalsPage() {
  const { t } = useLanguage();
  const { tx } = useSimpleMode();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<FacilityType | "All">("All");
  const [availabilityFilter, setAvailabilityFilter] =
    useState<(typeof AVAILABILITY_FILTERS)[number]>("All");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = window.setTimeout(() => setLoading(false), 700);
    return () => window.clearTimeout(id);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sampleFacilities.filter((facility) => {
      const matchesQuery =
        q.length === 0 ||
        facility.name.toLowerCase().includes(q) ||
        facility.location.toLowerCase().includes(q) ||
        facility.services.some((s) => s.toLowerCase().includes(q));
      const matchesType = typeFilter === "All" || facility.facilityType === typeFilter;
      const matchesAvailability =
        availabilityFilter === "All" || facility.availability === availabilityFilter;
      return matchesQuery && matchesType && matchesAvailability;
    });
  }, [query, typeFilter, availabilityFilter]);

  const facilityTypes = useMemo(() => {
    const types = new Set<FacilityType>();
    sampleFacilities.forEach((facility) => types.add(facility.facilityType));
    return Array.from(types);
  }, []);

  const heading = tx("action.hospitals", "action.hospitals.simple");

  return (
    <div className="container page">
      <header className="page__header">
        <h1>{heading}</h1>
        <p>{t("hospital.subtitle")}</p>
      </header>

      <label className="search">
        <span className="sr-only">{t("hospital.search")}</span>
        <input
          type="search"
          placeholder={t("hospital.search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <div className="filters" role="group" aria-label="Filter healthcare services">
        <label className="filter">
          <span>{t("hospital.location")}</span>
          <select defaultValue="Any location" aria-label="Filter by location">
            {LOCATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>

        <label className="filter">
          <span>{t("hospital.facilityType")}</span>
          <select
            value={typeFilter}
            onChange={(event) =>
              setTypeFilter(event.target.value as FacilityType | "All")
            }
            aria-label="Filter by facility type"
          >
            <option value="All">{t("hospital.allTypes")}</option>
            {facilityTypes.map((type) => (
              <option key={type} value={type}>
                {t(FACILITY_TYPE_KEYS[type])}
              </option>
            ))}
          </select>
        </label>

        <label className="filter">
          <span>{t("hospital.availability")}</span>
          <select
            value={availabilityFilter}
            onChange={(event) =>
              setAvailabilityFilter(
                event.target.value as (typeof AVAILABILITY_FILTERS)[number],
              )
            }
            aria-label="Filter by availability"
          >
            {AVAILABILITY_FILTERS.map((availability) => (
              <option key={availability} value={availability}>
                {t(AVAILABILITY_KEYS[availability])}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <LoadingState label={t("hospital.loading")} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={t("hospital.noResults")}
          description={t("hospital.noResultsDesc")}
        />
      ) : (
        <div className="card-grid">
          {filtered.map((facility) => (
            <HealthcareCard key={facility.id} facility={facility} />
          ))}
        </div>
      )}
    </div>
  );
}