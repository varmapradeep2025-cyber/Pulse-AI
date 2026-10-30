import unittest
from datetime import date, timedelta
from unittest.mock import patch

from app.forecast_comparison import (
    build_features,
    compare_forecasts,
    seasonal_naive_forecast,
)
from app.main import (
    DemandObservation,
    ForecastComparisonRequest,
    forecast_comparison,
)
from pydantic import ValidationError


class ForecastComparisonTests(unittest.TestCase):
    def test_seasonal_naive_repeats_weekday_and_recurses(self):
        self.assertEqual(
            seasonal_naive_forecast([1, 2, 3, 4, 5, 6, 7], 9),
            [1, 2, 3, 4, 5, 6, 7, 1, 2],
        )

    def test_short_history_uses_prefix_mean(self):
        self.assertEqual(seasonal_naive_forecast([2, 4, 6], 2), [4.0, 4.0])

    def test_features_use_only_the_supplied_history_prefix(self):
        target = date(2026, 10, 1)
        first = build_features([10, 20], target, 2, 1, 0)
        self.assertEqual(first[0], 20)
        self.assertEqual(first[1], 15)
        self.assertEqual(first[2], 15)
        self.assertEqual(first[3], 15)

    def test_comparison_uses_common_recursive_rolling_folds(self):
        rows = []
        start = date(2026, 7, 1)
        for hospital_id in (1, 2):
            for offset in range(63):
                rows.append(
                    {
                        "hospitalId": hospital_id,
                        "medicineId": 1,
                        "date": (start + timedelta(days=offset)).isoformat(),
                        "demand": float(10 + offset % 7 + hospital_id),
                    }
                )

        result = compare_forecasts(rows)
        self.assertEqual(result["validation"]["folds"], 3)
        self.assertEqual(result["validation"]["seriesCount"], 2)
        self.assertEqual(result["models"]["seasonal_naive"]["observations"], 42)
        self.assertEqual(result["models"]["ridge"]["observations"], 42)
        self.assertEqual(result["selectedModel"], "seasonal_naive")
        self.assertEqual(len(result["selectedForecasts"]), 2)
        self.assertEqual(len(result["selectedForecasts"][0]["forecast"]), 7)
        self.assertEqual(
            result["selectedForecasts"][0]["forecast"][0]["date"],
            "2026-09-02",
        )
        mase = result["models"]["seasonal_naive"]["macroMase"]
        self.assertTrue(mase is None or mase >= 0)
        if result["xgboost"]["available"]:
            self.assertEqual(result["models"]["xgboost"]["observations"], 42)

    def test_comparison_uses_only_six_most_recent_folds(self):
        start = date(2026, 1, 1)
        rows = [
            {
                "hospitalId": 1,
                "medicineId": 1,
                "date": (start + timedelta(days=offset)).isoformat(),
                "demand": float(10 + offset % 7 + offset // 30),
            }
            for offset in range(365)
        ]
        with patch("app.forecast_comparison._xgboost_model", return_value=None):
            result = compare_forecasts(rows)

        self.assertEqual(result["validation"]["folds"], 6)
        self.assertEqual(
            result["validation"]["cutoffDates"][0],
            (start + timedelta(days=321)).isoformat(),
        )
        self.assertEqual(
            result["validation"]["cutoffDates"][-1],
            (start + timedelta(days=356)).isoformat(),
        )

    def test_gapped_series_are_reported_not_silently_used(self):
        rows = []
        start = date(2026, 7, 1)
        for offset in range(49):
            if offset == 20:
                continue
            rows.append(
                {
                    "hospitalId": 1,
                    "medicineId": 1,
                    "date": (start + timedelta(days=offset)).isoformat(),
                    "demand": 5.0,
                }
            )
        with self.assertRaisesRegex(ValueError, "No daily series"):
            compare_forecasts(rows)

    def test_api_validates_payload_and_calls_comparison(self):
        row = DemandObservation(
            hospitalId=1,
            medicineId=2,
            date="2026-10-01",
            demand=3,
        )
        request = ForecastComparisonRequest(rows=[row])
        with patch(
            "app.forecast_comparison.compare_forecasts",
            return_value={"selectedModel": "seasonal_naive"},
        ) as compare:
            response = forecast_comparison(request)

        self.assertEqual(response["selectedModel"], "seasonal_naive")
        compare.assert_called_once()
        with self.assertRaises(ValidationError):
            DemandObservation(
                hospitalId=0,
                medicineId=2,
                date="2026-10-01",
                demand=-1,
            )


if __name__ == "__main__":
    unittest.main()
