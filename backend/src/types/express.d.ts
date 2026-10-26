import type { AppointmentUser } from "./appointments.js";
import type { InventoryUser } from "./inventory.js";

declare global {
  namespace Express {
    interface Request {
      appointmentUser?: AppointmentUser & {
        isStaff: boolean;
      };
      inventoryUser?: InventoryUser;
    }
  }
}

export {};
