import { Link, useParams } from "react-router-dom";
import { sampleFacilities } from "../data/facilities";

export default function HospitalDetailsPage() {
  const { id } = useParams<{ id: string }>();

  const facility = sampleFacilities.find(
    (item) => item.id === id,
  );

  if (!facility) {
    return (
      <div className="container page">
        <Link to="/hospitals">
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
        to="/hospitals"
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
        <h1>🏥 {facility.name}</h1>

        <p>
          <strong>Facility Type:</strong>{" "}
          {facility.facilityType}
        </p>

        <p>
          <strong>Location:</strong>{" "}
          {facility.location}
        </p>

        <p>
          <strong>Availability:</strong>{" "}
          {facility.availability}
        </p>

        <hr />

        <h2>Services</h2>

        {facility.services.map((service) => (
          <p key={service}>• {service}</p>
        ))}

        <h2>Opening Hours</h2>

        <p>{facility.openingHours}</p>

        {facility.isDemo && (
          <div
            style={{
              marginTop: "24px",
              padding: "14px",
              borderRadius: "10px",
              background: "#fff7ed",
              border: "1px solid #fed7aa",
            }}
          >
            <strong>Prototype Demo Facility</strong>

            <p>
              This facility uses fictional demo data
              for the Pulse AI prototype.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}