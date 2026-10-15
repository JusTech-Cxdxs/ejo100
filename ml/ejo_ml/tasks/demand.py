"""Parts demand and reorder points from weekly consumption.

Spare parts sell intermittently (many zero weeks), where ordinary averages
mislead. For each part three forecasters are tried on the last 8 weeks it
did not see — a 12-week moving average, simple exponential smoothing, and
Croston's method with the Syntetos–Boylan correction (made for intermittent
demand) — and the one with the smallest error is kept for that part.

Reorder point = demand over the lead time + safety stock, where safety stock
= z × weekly spread × √lead time (z = 1.65: about 95% of lead times covered).

Gate: at least 5 parts with enough history, and the chosen forecasts' error,
added over all parts, no worse than the naive "same as last week".
"""
from __future__ import annotations

import datetime as dt
import math

import numpy as np
import pandas as pd

from .. import ARTIFACT_FORMAT
from . import Gate, Result, not_enough, r4

TASK = "PARTS_DEMAND"
ALGORITHM = "croston-sba-ses-ma"
BACKTEST = 8
MIN_WEEKS = 26
LEAD_WEEKS = 2.0
SERVICE_Z = 1.65


def moving_average(y: np.ndarray, window: int = 12) -> float:
    return float(np.mean(y[-window:])) if len(y) else 0.0


def ses(y: np.ndarray, alpha: float) -> float:
    if not len(y):
        return 0.0
    level = float(y[0])
    for v in y[1:]:
        level = alpha * float(v) + (1 - alpha) * level
    return level


def croston_sba(y: np.ndarray, alpha: float = 0.1) -> float:
    """Croston's size/interval smoothing with the Syntetos–Boylan bias correction (1 − α/2)."""
    nz = np.flatnonzero(y > 0)
    if len(nz) == 0:
        return 0.0
    size = float(y[nz[0]])
    interval = float(nz[0] + 1)
    last = nz[0]
    for i in nz[1:]:
        size = alpha * float(y[i]) + (1 - alpha) * size
        interval = alpha * float(i - last) + (1 - alpha) * interval
        last = i
    return (1 - alpha / 2) * size / interval


METHODS = {
    "moving_average": lambda y: moving_average(y),
    "ses": lambda y: ses(y, 0.2),
    "croston_sba": lambda y: croston_sba(y),
}


def backtest(y: np.ndarray, method: str) -> float:
    """Mean absolute error of one-week-ahead forecasts over the last BACKTEST weeks."""
    errs = []
    for h in range(len(y) - BACKTEST, len(y)):
        errs.append(abs(METHODS[method](y[:h]) - float(y[h])))
    return float(np.mean(errs))


def naive_backtest(y: np.ndarray) -> float:
    return float(np.mean([abs(float(y[h - 1]) - float(y[h])) for h in range(len(y) - BACKTEST, len(y))]))


def train(parts: pd.DataFrame) -> Result:
    rows = []
    total_ours = total_naive = 0.0
    as_of = None
    for _, p in parts.iterrows():
        y = np.asarray(p["weekly"], dtype=float)
        as_of = p["as_of"]
        nonzero = int(np.count_nonzero(y))
        if len(y) < MIN_WEEKS or nonzero < 3:
            rows.append({"partId": str(p["part_id"]), "method": "none", "weeklyRate": 0.0, "weeklySd": 0.0, "forecast4w": 0.0, "safetyStock": 0.0, "reorderPoint": 0.0,
                         "backtestMae": None, "baselineMae": None, "nonzeroWeeks": nonzero})
            continue
        errors = {m: backtest(y, m) for m in METHODS}
        method = min(errors, key=lambda m: (errors[m], m))
        rate = max(0.0, METHODS[method](y))
        sd = float(np.std(y[-26:], ddof=1)) if len(y) >= 2 else 0.0
        safety = SERVICE_Z * sd * math.sqrt(LEAD_WEEKS)
        naive = naive_backtest(y)
        total_ours += errors[method]
        total_naive += naive
        rows.append({"partId": str(p["part_id"]), "method": method, "weeklyRate": r4(rate), "weeklySd": r4(sd), "forecast4w": r4(4 * rate),
                     "safetyStock": r4(safety), "reorderPoint": r4(rate * LEAD_WEEKS + safety), "backtestMae": r4(errors[method]), "baselineMae": r4(naive), "nonzeroWeeks": nonzero})
    usable = [r for r in rows if r["method"] != "none"]
    if len(usable) < 5:
        return not_enough(TASK, ALGORITHM, len(usable), 5, f"parts with at least {MIN_WEEKS} weeks of history and 3 weeks with use")
    passed = total_ours <= total_naive
    reasons = [f"Forecast error over {len(usable)} parts: {total_ours:.1f} against {total_naive:.1f} for \"same as last week\"" + ("." if passed else " — no better than the naive forecast.")]
    weeks = int(max(len(w) for w in parts["weekly"]))
    artifact = {"format": ARTIFACT_FORMAT, "task": TASK, "asOf": str(as_of), "weeks": weeks, "leadTimeWeeks": LEAD_WEEKS, "serviceZ": SERVICE_Z, "parts": rows}
    by_method = {m: sum(1 for r in usable if r["method"] == m) for m in METHODS}
    metrics = {"parts": len(rows), "forecast_parts": len(usable), "backtest_mae_total": r4(total_ours), "methods": by_method}
    end = dt.date.fromisoformat(str(as_of))
    return Result(TASK, ALGORITHM, artifact, metrics, {"name": "same as last week", "backtest_mae_total": r4(total_naive)}, Gate(passed, reasons), len(rows),
                  end - dt.timedelta(weeks=weeks - 1), end)
