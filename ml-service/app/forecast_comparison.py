from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from math import sqrt
from typing import Any

import numpy as np

HORIZON_DAYS = 7
MIN_TRAIN_DAYS = 42
FOLD_STEP_DAYS = 7
MAX_FOLDS = 6
RIDGE_LAMBDA = 200.0
MIN_CANDIDATE_IMPROVEMENT = 0.05
MAX_WAPE_REGRESSION = 0.05
BASE_FEATURE_COUNT = 15


def seasonal_naive_forecast(history: list[float], horizon: int) -> list[float]:
    if not history:
        raise ValueError("At least one historical demand value is required.")

    predictions: list[float] = []
    values = list(history)
    for _ in range(horizon):
        prediction = values[-7] if len(values) >= 7 else sum(values) / len(values)
        prediction = max(0.0, float(prediction))
        predictions.append(prediction)
        values.append(prediction)
    return predictions


def build_features(
    history: list[float],
    target_date: date,
    series_index: int,
    series_count: int,
    identity_index: int,
) -> list[float]:
    if not history:
        raise ValueError("Features require a non-empty history prefix.")

    weekday = target_date.weekday()
    month_phase = 2 * np.pi * (target_date.month - 1) / 12
    result = [
        history[-1],
        history[-7] if len(history) >= 7 else sum(history) / len(history),
        sum(history[-7:]) / min(len(history), 7),
        sum(history[-14:]) / min(len(history), 14),
        min(series_index, 364) / 364,
        float(weekday >= 5),
        float(np.sin(month_phase)),
        float(np.cos(month_phase)),
    ]
    result.extend(float(weekday == day) for day in range(7))
    result.extend(float(identity_index == index) for index in range(series_count))
    return result


def _ridge_fit(rows: np.ndarray, targets: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    means = rows.mean(axis=0)
    scales = rows.std(axis=0)
    scales[scales == 0] = 1.0
    normalized = (rows - means) / scales
    design = np.column_stack((normalized, np.ones(len(normalized))))
    gram = design.T @ design
    gram += np.eye(gram.shape[0]) * RIDGE_LAMBDA
    weights = np.linalg.solve(gram, design.T @ np.log1p(np.maximum(targets, 0)))
    return weights, means, scales


def _ridge_predict(
    model: tuple[np.ndarray, np.ndarray, np.ndarray], row: list[float]
) -> float:
    weights, means, scales = model
    normalized = (np.asarray(row, dtype=float) - means) / scales
    prediction = float(np.expm1(np.append(normalized, 1.0) @ weights))
    return max(0.0, prediction) if np.isfinite(prediction) else 0.0


def _xgboost_model():
    try:
        import sklearn  # noqa: F401
        from xgboost import XGBRegressor
    except ImportError:
        return None

    return XGBRegressor(
        objective="reg:squarederror",
        n_estimators=120,
        max_depth=2,
        learning_rate=0.05,
        subsample=1.0,
        colsample_bytree=0.9,
        reg_lambda=5.0,
        tree_method="hist",
        n_jobs=1,
        random_state=42,
        verbosity=0,
    )


def _forecast_model(
    name: str,
    history: list[float],
    last_date: date,
    series_index: int,
    series_count: int,
    model: Any,
    horizon: int = HORIZON_DAYS,
) -> list[float]:
    values = list(history)
    predictions: list[float] = []
    identity_index = series_index
    if name == "xgboost" and isinstance(model, tuple):
        model, identity_index = model
    for offset in range(1, horizon + 1):
        if name == "seasonal_naive":
            prediction = seasonal_naive_forecast(values, 1)[0]
        else:
            row = build_features(
                values,
                last_date + timedelta(days=offset),
                len(history) + offset - 1,
                series_count,
                identity_index,
            )
            if name == "ridge":
                prediction = _ridge_predict(model, row)
            else:
                prediction = max(
                    0.0,
                    float(np.expm1(model.predict(np.asarray([row]))[0])),
                )
        prediction = float(round(prediction))
        predictions.append(prediction)
        values.append(prediction)
    return predictions


def _fit_rows(
    series_data: list[dict[str, Any]],
    identities: dict[tuple[int, int], int],
    count: int,
) -> tuple[np.ndarray, np.ndarray]:
    features: list[list[float]] = []
    targets: list[float] = []
    for item in series_data:
        values: list[float] = item["values"]
        identity = identities[item["identity"]]
        for target_index in range(1, count):
            if target_index < 14:
                continue
            features.append(
                build_features(
                    values[:target_index],
                    item["dates"][target_index],
                    target_index,
                    len(identities),
                    identity,
                )
            )
            targets.append(values[target_index])
    return np.asarray(features, dtype=float), np.asarray(targets, dtype=float)


def _metrics(
    actual: list[float],
    predicted: list[float],
    mase_scales: list[float],
    series_errors: dict[str, list[float]],
    series_mase: dict[str, list[float]],
    series_counts: dict[str, int],
    series_key: str,
) -> None:
    errors = [abs(a - p) for a, p in zip(actual, predicted, strict=True)]
    series_errors[series_key].extend(errors)
    series_counts[series_key] += len(errors)
    nonzero_scales = [scale for scale in mase_scales if scale > 0]
    if nonzero_scales:
        series_mase[series_key].append(
            sum(errors) / len(errors) / (sum(nonzero_scales) / len(nonzero_scales))
        )


def _report(
    actual: list[float],
    predicted: list[float],
    series_errors: dict[str, list[float]],
    series_mase: dict[str, list[float]],
    series_counts: dict[str, int],
    folds: int,
) -> dict[str, Any]:
    absolute_errors = [abs(a - p) for a, p in zip(actual, predicted, strict=True)]
    total_actual = sum(abs(value) for value in actual)
    per_series = []
    for key in sorted(series_errors):
        errors = series_errors[key]
        per_series.append(
            {
                "series": key,
                "observations": series_counts[key],
                "mae": round(sum(errors) / len(errors), 3),
                "mase": (
                    round(sum(series_mase[key]) / len(series_mase[key]), 4)
                    if series_mase[key]
                    else None
                ),
            }
        )
    normalized_values = [row["mase"] for row in per_series if row["mase"] is not None]
    squared_errors = [
        (a - p) ** 2 for a, p in zip(actual, predicted, strict=True)
    ]
    return {
        "available": True,
        "observations": len(actual),
        "folds": folds,
        "seriesCount": len(series_errors),
        "mae": round(sum(absolute_errors) / len(absolute_errors), 3),
        "rmse": round(sqrt(sum(squared_errors) / len(squared_errors)), 3),
        "wape": round(sum(absolute_errors) / total_actual, 4)
        if total_actual > 0
        else None,
        "macroMase": round(sum(normalized_values) / len(normalized_values), 4)
        if normalized_values
        else None,
        "maseSeriesCount": len(normalized_values),
        "zeroMaseDenominatorSeries": len(per_series) - len(normalized_values),
        "perSeries": per_series,
    }


def compare_forecasts(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        raise ValueError("No demand observations were provided.")

    grouped: dict[tuple[int, int], dict[date, float]] = defaultdict(dict)
    for row in rows:
        key = (int(row["hospitalId"]), int(row["medicineId"]))
        day = date.fromisoformat(str(row["date"]))
        demand = float(row["demand"])
        if not np.isfinite(demand) or demand < 0:
            raise ValueError("Demand values must be finite and non-negative.")
        grouped[key][day] = demand

    included: list[dict[str, Any]] = []
    excluded: list[dict[str, str]] = []
    for identity, points in sorted(grouped.items()):
        dates = sorted(points)
        if any((right - left).days != 1 for left, right in zip(dates, dates[1:])):
            excluded.append(
                {"series": f"{identity[0]}-{identity[1]}", "reason": "date_gap"}
            )
            continue
        if len(dates) < MIN_TRAIN_DAYS + HORIZON_DAYS:
            excluded.append(
                {"series": f"{identity[0]}-{identity[1]}", "reason": "insufficient_history"}
            )
            continue
        included.append(
            {
                "identity": identity,
                "key": f"{identity[0]}-{identity[1]}",
                "dates": dates,
                "values": [points[day] for day in dates],
            }
        )

    if not included:
        raise ValueError(
            f"No daily series has at least {MIN_TRAIN_DAYS + HORIZON_DAYS} "
            "consecutive observations."
        )

    identities = {
        item["identity"]: index for index, item in enumerate(included)
    }
    xgb_available = _xgboost_model() is not None
    model_names = ["seasonal_naive", "ridge"]
    if xgb_available:
        model_names.append("xgboost")

    actuals: dict[str, list[float]] = {name: [] for name in model_names}
    predictions: dict[str, list[float]] = {name: [] for name in model_names}
    errors: dict[str, dict[str, list[float]]] = {
        name: defaultdict(list) for name in model_names
    }
    mase: dict[str, dict[str, list[float]]] = {
        name: defaultdict(list) for name in model_names
    }
    counts: dict[str, dict[str, int]] = {
        name: defaultdict(int) for name in model_names
    }
    cutoffs: list[str] = []

    min_length = min(len(item["values"]) for item in included)
    fold_starts = list(range(
        MIN_TRAIN_DAYS,
        min_length - HORIZON_DAYS + 1,
        FOLD_STEP_DAYS,
    ))[-MAX_FOLDS:]
    for cutoff in fold_starts:
        train_items = [
            {**item, "values": item["values"][:cutoff], "dates": item["dates"][:cutoff]}
            for item in included
        ]
        train_x, train_y = _fit_rows(train_items, identities, cutoff)
        if len(train_y) == 0:
            continue
        ridge = _ridge_fit(train_x, train_y)
        xgb = _xgboost_model()
        if xgb is not None:
            xgb.fit(train_x, np.log1p(np.maximum(train_y, 0)))
        cutoffs.append(train_items[0]["dates"][-1].isoformat())

        for item, train_item in zip(included, train_items, strict=True):
            identity_index = identities[item["identity"]]
            history = train_item["values"]
            last_date = train_item["dates"][-1]
            scale = (
                sum(abs(a - b) for a, b in zip(history[7:], history[:-7], strict=True))
                / (len(history) - 7)
                if len(history) > 7
                else 0.0
            )
            target = item["values"][cutoff : cutoff + HORIZON_DAYS]
            for name in model_names:
                forecast = _forecast_model(
                    name,
                    history,
                    last_date,
                    identity_index,
                    len(included),
                    ridge
                    if name == "ridge"
                    else (xgb, identity_index)
                    if name == "xgboost"
                    else None,
                )
                actuals[name].extend(target)
                predictions[name].extend(forecast)
                _metrics(
                    target,
                    forecast,
                    [scale],
                    errors[name],
                    mase[name],
                    counts[name],
                    item["key"],
                )

    reports = {
        name: _report(
            actuals[name], predictions[name], errors[name], mase[name], counts[name], len(cutoffs)
        )
        for name in model_names
    }

    seasonal = reports["seasonal_naive"]
    promotable = []
    for candidate in ("ridge", "xgboost"):
        report = reports.get(candidate)
        if not report or report["macroMase"] is None or seasonal["macroMase"] is None:
            continue
        wape_ok = (
            seasonal["wape"] is None
            or report["wape"] is None
            or report["wape"] <= seasonal["wape"] * (1 + MAX_WAPE_REGRESSION)
        )
        if (
            report["macroMase"]
            <= seasonal["macroMase"] * (1 - MIN_CANDIDATE_IMPROVEMENT)
            and wape_ok
        ):
            promotable.append(candidate)

    selected = min(
        promotable,
        key=lambda name: reports[name]["macroMase"],
        default="seasonal_naive",
    )

    final_x, final_y = _fit_rows(included, identities, min_length)
    final_models: dict[str, Any] = {
        "ridge": _ridge_fit(final_x, final_y),
    }
    final_xgb = _xgboost_model()
    if final_xgb is not None:
        final_xgb.fit(final_x, np.log1p(np.maximum(final_y, 0)))
        final_models["xgboost"] = final_xgb

    selected_forecasts = []
    for item in included:
        forecast = _forecast_model(
            selected,
            item["values"],
            item["dates"][-1],
            identities[item["identity"]],
            len(included),
            (
                final_models["xgboost"],
                identities[item["identity"]],
            )
            if selected == "xgboost"
            else final_models.get(selected),
        )
        selected_forecasts.append(
            {
                "hospitalId": item["identity"][0],
                "medicineId": item["identity"][1],
                "forecast": [
                    {
                        "date": (item["dates"][-1] + timedelta(days=day)).isoformat(),
                        "predicted": round(value),
                    }
                    for day, value in enumerate(forecast, start=1)
                ],
            }
        )

    return {
        "selectionRule": (
            "Adopt ridge/XGBoost only when macro MASE is at least 5% lower "
            "than seasonal naive and WAPE is no more than 5% worse."
        ),
        "selectedModel": selected,
        "selectionReason": (
            f"{selected} passed the predeclared validation rule."
            if promotable
            else "No complex candidate passed the adoption rule; seasonal naive remains selected."
        ),
        "validation": {
            "horizonDays": HORIZON_DAYS,
            "minimumTrainingDays": MIN_TRAIN_DAYS,
            "foldStepDays": FOLD_STEP_DAYS,
            "folds": len(cutoffs),
            "cutoffDates": cutoffs,
            "firstForecastDate": (
                (included[0]["dates"][MIN_TRAIN_DAYS - 1] + timedelta(days=1)).isoformat()
                if cutoffs
                else None
            ),
            "lastForecastDate": (
                (
                    date.fromisoformat(cutoffs[-1])
                    + timedelta(days=HORIZON_DAYS)
                ).isoformat()
                if cutoffs
                else None
            ),
            "seriesCount": len(included),
            "excludedSeries": excluded,
            "featureCount": BASE_FEATURE_COUNT + len(included),
            "evaluation": "recursive seven-day, chronological rolling-origin",
        },
        "models": reports,
        "xgboost": {
            "available": xgb_available,
            "parameters": {
                "n_estimators": 120,
                "max_depth": 2,
                "learning_rate": 0.05,
                "subsample": 1.0,
                "colsample_bytree": 0.9,
                "reg_lambda": 5.0,
                "random_state": 42,
            },
            "targetTransform": "log1p",
        },
        "metricDefinitions": {
            "mae": "Mean absolute error in the medicine's demand units.",
            "rmse": "Root mean squared error in demand units; larger misses count more.",
            "wape": "Sum of absolute errors divided by sum of actual demand.",
            "macroMase": "Mean of per-series MAE divided by that fold's training seasonal-naive MAE; zero-denominator series are excluded and counted.",
        },
        "selectedForecasts": selected_forecasts,
    }
