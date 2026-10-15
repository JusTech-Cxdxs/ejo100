"""How long a job takes from opening to ready (hours): three LightGBM quantile
models (10th, 50th, 90th percentile) on the complaint, the vehicle and the
approved lines. Compared with the simplest honest guess — the median
turnaround of the same kind of job.

Gate: at least 150 jobs with a turnaround, the middle estimate's error at
least 10% smaller than the baseline's, and 60–95% of test jobs inside the
low–high range.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import sparse

from .. import ARTIFACT_FORMAT
from ..data import line_tokens, time_split
from ..export import check_lgbm, lgbm_trees
from ..text import fit_tfidf, spec, transform
from . import Gate, Result, not_enough, r4

TASK = "JOB_DURATION"
ALGORITHM = "lightgbm-quantile"
MIN_ROWS = 150
NUMERIC = ["complaint_words", "lines_total", "lines_store_part", "lines_external_part", "lines_external_job", "lines_internal_job", "lines_labour", "lines_sundry", "parts_quantity"]
QUANTILES = {"p10": 0.1, "p50": 0.5, "p90": 0.9}


def tokens(row) -> list[str]:
    """As the portal's durationTokens(): complaint words, then context, then the approved lines."""
    return list(row["complaint_tokens"]) + list(row["feature_tokens"]) + line_tokens(row["lines"])


def matrix(vec, df: pd.DataFrame) -> sparse.csr_matrix:
    t = transform(vec, [tokens(r) for _, r in df.iterrows()])
    nums = np.array([[float(r["work_numbers"].get(k, 0) or 0) for k in NUMERIC] for _, r in df.iterrows()], dtype=np.float64).reshape(len(df), len(NUMERIC))
    return sparse.hstack([t, sparse.csr_matrix(nums)], format="csr")


def train(jobs: pd.DataFrame, seed: int = 7, n_estimators: int = 400) -> Result:
    import lightgbm as lgb

    df = jobs[jobs["turnaround_hours"].notna() & (jobs["turnaround_hours"] > 0) & (jobs["turnaround_hours"] < 24 * 120)].reset_index(drop=True)
    # The newest jobs that are finished are mostly the quick ones (their long peers are still open):
    # leave out jobs opened within the usual longest turnaround, or the test period flatters the model.
    if len(df):
        p95_days = float(np.percentile(df["turnaround_hours"], 95)) / 24
        cutoff = df["opened_on"].max() - pd.Timedelta(days=p95_days)
        df = df[df["opened_on"] <= cutoff].reset_index(drop=True)
    if len(df) < MIN_ROWS:
        return not_enough(TASK, ALGORITHM, len(df), MIN_ROWS, "finished jobs with a ready time")
    split = time_split(df)
    vec = fit_tfidf([tokens(r) for _, r in split.train.iterrows()], min_df=3, max_features=3000)
    X_tr, X_va, X_te = matrix(vec, split.train), matrix(vec, split.valid), matrix(vec, split.test)
    y_tr, y_va = np.log1p(split.train["turnaround_hours"].to_numpy()), np.log1p(split.valid["turnaround_hours"].to_numpy())
    y_te = split.test["turnaround_hours"].to_numpy()

    boosters, trees = {}, {}
    for name, alpha in QUANTILES.items():
        model = lgb.LGBMRegressor(
            objective="quantile", alpha=alpha, n_estimators=n_estimators, learning_rate=0.05, num_leaves=15, min_child_samples=10,
            subsample=0.8, subsample_freq=1, colsample_bytree=0.8, max_bin=63, random_state=seed, verbose=-1, deterministic=True, force_col_wise=True, n_jobs=1,
        )
        model.fit(X_tr, y_tr, eval_set=[(X_va, y_va)], callbacks=[lgb.early_stopping(40, verbose=False)])
        booster = model.booster_
        # Keep only the trees up to the best iteration.
        best = booster.best_iteration or booster.current_iteration()
        booster = booster if best == booster.current_iteration() else lgb.Booster(model_str=booster.model_to_string(num_iteration=best))
        boosters[name] = booster
        trees[name] = lgbm_trees(booster)
        check_lgbm(booster, trees[name], X_te)

    pred = {k: np.maximum(0, np.expm1(b.predict(X_te, raw_score=True))) for k, b in boosters.items()}
    lo, mid, hi = np.sort(np.vstack([pred["p10"], pred["p50"], pred["p90"]]), axis=0)
    mae = float(np.mean(np.abs(mid - y_te)))
    coverage = float(np.mean((y_te >= lo) & (y_te <= hi)))
    medians = split.train.groupby("kind")["turnaround_hours"].median()
    base_pred = split.test["kind"].map(medians).fillna(split.train["turnaround_hours"].median()).to_numpy()
    base_mae = float(np.mean(np.abs(base_pred - y_te)))

    reasons, passed = [], True
    if mae > 0.9 * base_mae:
        passed = False
        reasons.append(f"Middle estimate error {mae:.1f} h is not at least 10% better than the baseline's {base_mae:.1f} h.")
    if not 0.6 <= coverage <= 0.95:
        passed = False
        reasons.append(f"{coverage:.0%} of test jobs fall inside the low–high range (needs 60–95%).")
    if passed:
        reasons.append(f"Middle estimate {1 - mae / base_mae:.0%} closer than the baseline; {coverage:.0%} of jobs inside the range.")

    artifact = {"format": ARTIFACT_FORMAT, "task": TASK, "tfidf": spec(vec), "numeric": NUMERIC, "target": "log1p_hours", "quantiles": trees}
    metrics = {"rows": len(df), "test_rows": len(split.test), "mae_hours": r4(mae), "median_abs_error_hours": r4(np.median(np.abs(mid - y_te))), "range_coverage": r4(coverage),
               "trees": {k: len(v) for k, v in trees.items()}, "vocab": len(vec.vocabulary_)}
    baseline = {"name": "median turnaround of the same kind of job", "mae_hours": r4(base_mae)}
    return Result(TASK, ALGORITHM, artifact, metrics, baseline, Gate(passed, reasons), len(df), df["opened_on"].min().date(), df["opened_on"].max().date())
