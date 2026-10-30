import type { ForecastPoint } from "./forecastFeatures";

export interface DeliveryProjection {
  points: Array<{ date: string; stock: number }>;
  belowSafetyDay: number | null;
  stockOutDay: number | null;
  endingStock: number;
}

export function projectHypotheticalDelivery(options: {
  startingStock: number;
  safetyStock: number;
  forecast: ForecastPoint[];
  arrivalDay: number;
  delayDays: number;
  deliveryQuantity: number;
}): { onTime: DeliveryProjection; delayed: DeliveryProjection } {
  const project = (arrivalDay: number): DeliveryProjection => {
    let stock = options.startingStock;
    let belowSafetyDay: number | null = null;
    let stockOutDay: number | null = null;
    const points = options.forecast.map((day, index) => {
      const dayNumber = index + 1;
      if (dayNumber === arrivalDay) {
        stock += options.deliveryQuantity;
      }
      stock = Math.max(0, stock - day.predicted);
      if (belowSafetyDay === null && stock < options.safetyStock) {
        belowSafetyDay = dayNumber;
      }
      if (stockOutDay === null && stock <= 0) {
        stockOutDay = dayNumber;
      }
      return { date: day.date, stock };
    });

    return {
      points,
      belowSafetyDay,
      stockOutDay,
      endingStock: points.at(-1)?.stock ?? options.startingStock,
    };
  };

  if (
    !Number.isFinite(options.startingStock) ||
    options.startingStock < 0 ||
    !Number.isFinite(options.safetyStock) ||
    options.safetyStock < 0 ||
    !Number.isInteger(options.arrivalDay) ||
    options.arrivalDay < 1 ||
    !Number.isInteger(options.delayDays) ||
    options.delayDays < 0 ||
    !Number.isFinite(options.deliveryQuantity) ||
    options.deliveryQuantity < 0
  ) {
    throw new RangeError("Delivery scenario inputs must be valid non-negative values.");
  }

  return {
    onTime: project(options.arrivalDay),
    delayed: project(options.arrivalDay + options.delayDays),
  };
}
