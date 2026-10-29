import { useEffect, useMemo, useState } from "react";
import { syntheticHospitals } from "../data/hospitals";
import { useLanguage } from "../context/LanguageContext";
import { useSimpleMode } from "../context/SimpleModeContext";
import HealthcareCard from "../components/HealthcareCard";
import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import type { FacilityType } from "../types/domain";
import type { TranslationKey } from "../data/translations";

const AVAILABILITY_FILTERS = [
  "All",
  "Open",
  "Busy",
  "High Demand",
] as const;

const AVAILABILITY_KEYS: Record<
  (typeof AVAILABILITY_FILTERS)[number],
  TranslationKey
> = {
  All: "hospital.all",
  Open: "hospital.open",
  Busy: "hospital.busy",
  "High Demand": "hospital.highDemand",
};

const FACILITY_TYPE_KEYS: Record<
  FacilityType,
  TranslationKey
> = {
  "Public Hospital": "facility.publicHospital",
  "District Hospital": "facility.districtHospital",
  "Community Health Centre":
    "facility.communityHealthCentre",
  "Primary Health Centre":
    "facility.primaryHealthCentre",
  Dispensary: "facility.dispensary",
};

const LOCATION_OPTIONS: Array<{
  value: string;
  label: string;
}> = [
  {
    value: "Any location",
    label: "Any location",
  },
  {
    value: "Gwalior",
    label: "Gwalior",
  },
  {
    value: "Indore",
    label: "Indore",
  },
  {
    value: "Bhopal",
    label: "Bhopal",
  },
  {
    value: "Jabalpur",
    label: "Jabalpur",
  },
  {
    value: "Ujjain",
    label: "Ujjain",
  },
];

/*
 * Healthcare needs supported by the prototype.
 *
 * These are service-based matches, not medical diagnoses.
 */
const HEALTHCARE_NEEDS = [
  {
    value: "All",
    label: "All healthcare needs",
  },
  {
    value: "General illness",
    label: "Fever / General illness",
  },
  {
    value: "Emergency",
    label: "Injury / Emergency",
  },
  {
    value: "Maternal care",
    label: "Pregnancy / Maternal care",
  },
  {
    value: "Vaccination",
    label: "Vaccination",
  },
  {
    value: "Diagnostics",
    label: "Lab tests / Diagnostics",
  },
  {
    value: "Pharmacy",
    label: "Medicine / Pharmacy",
  },
] as const;

export default function HospitalsPage() {
  const { t } = useLanguage();
  const { tx } = useSimpleMode();

  const [query, setQuery] = useState("");

  const [healthcareNeed, setHealthcareNeed] =
    useState("All");

  const [locationFilter, setLocationFilter] =
    useState("Any location");

  const [typeFilter, setTypeFilter] =
    useState<FacilityType | "All">("All");

  const [availabilityFilter, setAvailabilityFilter] =
    useState<
      (typeof AVAILABILITY_FILTERS)[number]
    >("All");

  const [loading, setLoading] =
    useState(true);

  /*
   * Demo loading state
   */
  useEffect(() => {
    const id = window.setTimeout(
      () => setLoading(false),
      700,
    );

    return () => {
      window.clearTimeout(id);
    };
  }, []);

  /*
   * Filter and match healthcare facilities.
   */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return syntheticHospitals.filter(
      (facility) => {
        /*
         * 1. Search matching
         */
        const matchesQuery =
          q.length === 0 ||
          facility.name
            .toLowerCase()
            .includes(q) ||
          facility.location
            .toLowerCase()
            .includes(q) ||
          facility.services.some((service) =>
            service
              .toLowerCase()
              .includes(q),
          );

        /*
         * 2. Healthcare need matching
         *
         * General illness → OPD
         * Emergency → Emergency
         * Maternal care → Maternal care
         * Vaccination → Vaccination
         * Diagnostics → Diagnostics / Lab tests / X-Ray
         * Pharmacy → Pharmacy
         */
        const matchesHealthcareNeed =
          healthcareNeed === "All" ||
          (healthcareNeed ===
            "General illness" &&
            facility.services.some(
              (service) =>
                service.toLowerCase() ===
                "opd",
            )) ||
          (healthcareNeed ===
            "Emergency" &&
            facility.services.some(
              (service) =>
                service.toLowerCase() ===
                "emergency",
            )) ||
          (healthcareNeed ===
            "Maternal care" &&
            facility.services.some(
              (service) =>
                service.toLowerCase() ===
                "maternal care",
            )) ||
          (healthcareNeed ===
            "Vaccination" &&
            facility.services.some(
              (service) =>
                service.toLowerCase() ===
                "vaccination",
            )) ||
          (healthcareNeed ===
            "Diagnostics" &&
            facility.services.some(
              (service) => {
                const normalized =
                  service.toLowerCase();

                return (
                  normalized ===
                    "diagnostics" ||
                  normalized ===
                    "lab tests" ||
                  normalized ===
                    "x-ray"
                );
              },
            )) ||
          (healthcareNeed ===
            "Pharmacy" &&
            facility.services.some(
              (service) =>
                service.toLowerCase() ===
                "pharmacy",
            ));

        /*
         * 3. Location matching
         */
        const matchesLocation =
          locationFilter ===
            "Any location" ||
          facility.location
            .toLowerCase()
            .includes(
              locationFilter.toLowerCase(),
            );

        /*
         * 4. Facility type matching
         */
        const matchesType =
          typeFilter === "All" ||
          facility.facilityType ===
            typeFilter;

        /*
         * 5. Availability matching
         */
        const matchesAvailability =
          availabilityFilter ===
            "All" ||
          facility.availability ===
            availabilityFilter;

        return (
          matchesQuery &&
          matchesHealthcareNeed &&
          matchesLocation &&
          matchesType &&
          matchesAvailability
        );
      },
    );
  }, [
    query,
    healthcareNeed,
    locationFilter,
    typeFilter,
    availabilityFilter,
  ]);

  /*
   * Get available facility types.
   */
  const facilityTypes = useMemo(() => {
    const types = new Set<FacilityType>();

    syntheticHospitals.forEach(
      (facility) => {
        types.add(
          facility.facilityType,
        );
      },
    );

    return Array.from(types);
  }, []);

  /*
   * Clear all filters.
   */
  const clearFilters = () => {
    setQuery("");
    setHealthcareNeed("All");
    setLocationFilter("Any location");
    setTypeFilter("All");
    setAvailabilityFilter("All");
  };

  const heading = tx(
    "action.hospitals",
    "action.hospitals.simple",
  );

  return (
    <div className="container page">

      {/* Header */}
      <header className="page__header">
        <h1>{heading}</h1>

        <p>
          {t("hospital.subtitle")}
        </p>
      </header>



      {/* Healthcare Need Selector */}
      <section
        style={{
          marginBottom: "24px",
          padding: "20px",
          border: "1px solid #ddd",
          borderRadius: "12px",
          background: "#fff",
        }}
      >
        <h2
          style={{
            marginTop: 0,
            marginBottom: "8px",
          }}
        >
          Find healthcare for your needs
        </h2>

        <p
          style={{
            marginTop: 0,
            marginBottom: "16px",
          }}
        >
          Select the type of healthcare
          service you are looking for.
        </p>

        <select
          value={healthcareNeed}
          onChange={(event) =>
            setHealthcareNeed(
              event.target.value,
            )
          }
          style={{
            width: "100%",
            maxWidth: "500px",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid #ccc",
            fontSize: "16px",
          }}
          aria-label="Select healthcare need"
        >
          {HEALTHCARE_NEEDS.map(
            (need) => (
              <option
                key={need.value}
                value={need.value}
              >
                {need.label}
              </option>
            ),
          )}
        </select>

        <p
          style={{
            marginTop: "12px",
            marginBottom: 0,
            fontSize: "13px",
            color: "#666",
          }}
        >
          This matches healthcare facilities
          based on their listed services. It
          does not provide a medical diagnosis
          or replace a healthcare professional.
        </p>
      </section>

      {/* Search */}
      <label className="search">
        <span className="sr-only">
          {t("hospital.search")}
        </span>

        <input
          type="search"
          placeholder={t(
            "hospital.search",
          )}
          value={query}
          onChange={(event) =>
            setQuery(
              event.target.value,
            )
          }
        />
      </label>

      {/* Filters */}
      <div
        className="filters"
        role="group"
        aria-label="Filter healthcare services"
      >

        {/* Location */}
        <label className="filter">
          <span>
            {t("hospital.location")}
          </span>

          <select
            value={locationFilter}
            onChange={(event) =>
              setLocationFilter(
                event.target.value,
              )
            }
            aria-label="Filter by location"
          >
            {LOCATION_OPTIONS.map(
              (option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ),
            )}
          </select>
        </label>

        {/* Facility type */}
        <label className="filter">
          <span>
            {t(
              "hospital.facilityType",
            )}
          </span>

          <select
            value={typeFilter}
            onChange={(event) =>
              setTypeFilter(
                event.target.value as
                  | FacilityType
                  | "All",
              )
            }
            aria-label="Filter by facility type"
          >
            <option value="All">
              {t(
                "hospital.allTypes",
              )}
            </option>

            {facilityTypes.map(
              (type) => (
                <option
                  key={type}
                  value={type}
                >
                  {t(
                    FACILITY_TYPE_KEYS[
                      type
                    ],
                  )}
                </option>
              ),
            )}
          </select>
        </label>

        {/* Availability */}
        <label className="filter">
          <span>
            {t(
              "hospital.availability",
            )}
          </span>

          <select
            value={
              availabilityFilter
            }
            onChange={(event) =>
              setAvailabilityFilter(
                event.target
                  .value as (typeof AVAILABILITY_FILTERS)[number],
              )
            }
            aria-label="Filter by availability"
          >
            {AVAILABILITY_FILTERS.map(
              (availability) => (
                <option
                  key={availability}
                  value={availability}
                >
                  {t(
                    AVAILABILITY_KEYS[
                      availability
                    ],
                  )}
                </option>
              ),
            )}
          </select>
        </label>

      </div>

      {/* Clear filters */}
      <div
        style={{
          marginTop: "16px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={clearFilters}
          className="btn btn--secondary"
        >
          Clear all filters
        </button>

        {!loading && (
          <span
            style={{
              fontSize: "14px",
              opacity: 0.75,
            }}
          >
            Showing{" "}
            <strong>
              {filtered.length}
            </strong>{" "}
            healthcare facilities
          </span>
        )}
      </div>

      {/* Results */}
      <div
        style={{
          marginTop: "24px",
        }}
      >
        {loading ? (
          <LoadingState
            label={t(
              "hospital.loading",
            )}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={t(
              "hospital.noResults",
            )}
            description={t(
              "hospital.noResultsDesc",
            )}
          />
        ) : (
          <div className="card-grid">
            {filtered.map(
              (facility) => (
                <HealthcareCard
                  key={facility.id}
                  facility={facility}
                />
              ),
            )}
          </div>
        )}
      </div>

    </div>
  );
}