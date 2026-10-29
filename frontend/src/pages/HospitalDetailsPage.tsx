import { Link, useParams } from "react-router-dom";
import { getHospitalById } from "../data/hospitals";
import { ROUTES } from "../routes";

export default function HospitalDetailsPage() {
  const { id } = useParams<{ id: string }>();

  const facility = getHospitalById(id);

  if (!facility) {
    return (
      <div className="container page">
        <Link to={ROUTES.citizen}>
          ← Back to Healthcare Facilities
        </Link>

        <h1>Healthcare facility not found</h1>

        <p>
          The requested healthcare facility could not
          be found.
        </p>
      </div>
    );
  }

  return (
    <div className="container page">
      <Link
        to={ROUTES.citizen}
        style={{
          display: "inline-block",
          marginBottom: "24px",
        }}
      >
        ← Back to Healthcare Facilities
      </Link>

      <section
        style={{
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: "16px",
          padding: "28px",
        }}
      >
        <h1>🏥 {facility.hospital_name}</h1>

        <p>
          <strong>Hospital ID:</strong>{" "}
          {facility.hospital_id}
        </p>

        <p>
          <strong>Facility Type:</strong>{" "}
          {facility.hospital_type}
        </p>

        <p>
          <strong>Location:</strong>{" "}
          {facility.city}, {facility.state}
        </p>

        <p>
          <strong>Address:</strong>{" "}
          {facility.address}
        </p>

        <p>
          <strong>Phone:</strong> {facility.phone}
        </p>

        <p>
          <strong>Emergency:</strong>{" "}
          {facility.emergency_available
            ? "Available 24 hours"
            : "Not available — contact a nearby emergency-capable facility"}
        </p>

        <p>
          <strong>Availability:</strong>{" "}
          {facility.availability}
        </p>

        <p>
          <strong>Bed capacity:</strong>{" "}
          {facility.bed_capacity} beds ·{" "}
          <strong>Available:</strong>{" "}
          {facility.available_beds}
        </p>

        <p>
          <strong>ICU:</strong>{" "}
          {facility.available_ICU_beds} /{" "}
          {facility.ICU_beds} available
        </p>

        <hr />

        <h2>Services</h2>

        {facility.services.map((service) => (
          <p key={service}>• {service}</p>
        ))}

        <h2>Departments</h2>

        {facility.departments.map((department) => (
          <p key={department}>• {department}</p>
        ))}

        <h2>Specialties</h2>

        {facility.specialties.map((specialty) => (
          <p key={specialty}>• {specialty}</p>
        ))}

        <h2>Opening Hours</h2>

        <p>{facility.openingHours}</p>


      </section>
    </div>
  );
}