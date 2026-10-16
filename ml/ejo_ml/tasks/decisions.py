"""How likely a request is to be sent back at an approval step (parts slips,
outside purchases, Job Card and service approvals, cancellations, estimates,
warranty claims at the provider) — learned from the organisation's own
decisions, from what is known when the request ARRIVES: the step, the
requester's role, the amount, the number of lines, and the Lagos hour and
weekday. Never the decider, the wait or the reason (that would be hindsight).

LightGBM (binary, small trees, early stopping on the validation period), then
isotonic calibration on the validation period so "30%" means about 3 in 10.
Judged on the newest period against the honest baseline: every request gets
the training period's send-back rate.

Gate: at least 300 decisions, at least 30 send-backs to learn from, both
outcomes in the test period, AUC at least 0.65, and a Brier score at least
3% better than the baseline's.

The portal shows the model's quality on "How work flows"; it never approves
or rejects anything.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .. import ARTIFACT_FORMAT
from ..data import time_split
from ..export import check_lgbm, lgbm_trees
from . import Gate, Result, not_enough, r4

TASK = "DECISION_RISK"
ALGORITHM = "lightgbm-binary-isotonic"
MIN_ROWS = 300
MIN_POSITIVES = 30
MIN_ROLE_ROWS = 5


def feature_names(steps: list[str], roles: list[str]) -> list[str]:
    """As the portal's featureNames() (lib/insights/decisions-core.ts)."""
    return [f"step:{s}" for s in steps] + [f"requester:{r}" for r in roles] + ["requester:other", "log_amount", "lines", "hour", "weekday", "has_amount"]


def features(df: pd.DataFrame, steps: list[str], roles: list[str]) -> np.ndarray:
    """As the portal's decisionFeatures(): one row per decision, same column order."""
    X = np.zeros((len(df), len(steps) + len(roles) + 6), dtype=np.float64)
    step_at = {s: i for i, s in enumerate(steps)}
    role_at = {r: i for i, r in enumerate(roles)}
    base = len(steps) + len(roles) + 1
    for k, (_, r) in enumerate(df.iterrows()):
        if r["step"] in step_at:
            X[k, step_at[r["step"]]] = 1
        role = r["requester_role"]
        X[k, len(steps) + role_at.get(role, len(roles)) if isinstance(role, str) else len(steps) + len(roles)] = 1
        amount = max(0.0, float(r["amount"] or 0))
        X[k, base] = np.log1p(amount)
        X[k, base + 1] = float(r["lines"] or 0)
        X[k, base + 2] = float(r["hour"])
        X[k, base + 3] = float(r["weekday"])
        X[k, base + 4] = 1.0 if amount > 0 else 0.0
    return X


def brier(p: np.ndarray, y: np.ndarray) -> float:
    return float(np.mean((p - y) ** 2))


def train(decisions: pd.DataFrame, seed: int = 7, n_estimators: int = 400) -> Result:
    import lightgbm as lgb
    from sklearn.isotonic import IsotonicRegression
    from sklearn.metrics import log_loss, roc_auc_score

    df = decisions.reset_index(drop=True)
    if len(df) < MIN_ROWS:
        return not_enough(TASK, ALGORITHM, len(df), MIN_ROWS, "approval decisions")
    split = time_split(df)
    y_tr, y_va, y_te = (s["rejected"].to_numpy(dtype=np.float64) for s in (split.train, split.valid, split.test))
    if y_tr.sum() < MIN_POSITIVES:
        return Result(TASK, ALGORITHM, None, {"rows": len(df), "send_backs_train": int(y_tr.sum())}, None, Gate(False, [f"Needs at least {MIN_POSITIVES} send-backs to learn from; the training period has {int(y_tr.sum())}."]), len(df))
    steps = sorted(set(split.train["step"]))
    counts = split.train["requester_role"].dropna().value_counts()
    roles = sorted(r for r, n in counts.items() if n >= MIN_ROLE_ROWS)
    X_tr, X_va, X_te = (features(s, steps, roles) for s in (split.train, split.valid, split.test))

    model = lgb.LGBMClassifier(
        objective="binary", n_estimators=n_estimators, learning_rate=0.05, num_leaves=7, min_child_samples=30, subsample=0.8, subsample_freq=1,
        colsample_bytree=0.8, reg_lambda=1.0, max_bin=63, random_state=seed, verbose=-1, deterministic=True, force_col_wise=True, n_jobs=1,
    )
    model.fit(X_tr, y_tr, eval_set=[(X_va, y_va)], eval_metric="binary_logloss", callbacks=[lgb.early_stopping(40, verbose=False)])
    booster = model.booster_
    best = booster.best_iteration or booster.current_iteration()
    booster = booster if best == booster.current_iteration() else lgb.Booster(model_str=booster.model_to_string(num_iteration=best))
    trees = lgbm_trees(booster)
    check_lgbm(booster, trees, X_te)

    raw_va = booster.predict(X_va, raw_score=True)
    raw_te = booster.predict(X_te, raw_score=True)
    iso = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip").fit(raw_va, y_va)
    cal_x = [float(v) for v in iso.X_thresholds_]
    cal_y = [float(v) for v in iso.y_thresholds_]
    if len(cal_x) < 2:  # a flat validation period: a two-point table at its rate
        rate = float(y_va.mean()) if len(y_va) else float(y_tr.mean())
        cal_x, cal_y = [float(raw_va.min()) if len(raw_va) else -1.0, float(raw_va.max()) + 1e-6 if len(raw_va) else 1.0], [rate, rate]
    p_te = np.clip(np.interp(raw_te, cal_x, cal_y), 0, 1)

    base_rate = float(y_tr.mean())
    base_brier = brier(np.full_like(y_te, base_rate), y_te)
    model_brier = brier(p_te, y_te)
    both = 0 < y_te.sum() < len(y_te)
    auc = float(roc_auc_score(y_te, raw_te)) if both else float("nan")

    reasons, passed = [], True
    if not both:
        passed = False
        reasons.append("The test period has only one outcome, so the model cannot be judged yet.")
    else:
        if auc < 0.65:
            passed = False
            reasons.append(f"It tells send-backs from approvals with AUC {auc:.2f} (needs 0.65).")
        if model_brier > 0.97 * base_brier:
            passed = False
            reasons.append(f"Its probabilities (Brier {model_brier:.3f}) are not 3% better than everyone-gets-the-usual-rate ({base_brier:.3f}).")
    if passed:
        reasons.append(f"AUC {auc:.2f}; probabilities {1 - model_brier / base_brier:.0%} better than the usual rate.")

    by_step = {}
    for s in steps:
        mask = (split.test["step"] == s).to_numpy()
        if mask.sum():
            by_step[s] = {"rows": int(mask.sum()), "send_back_rate": r4(y_te[mask].mean()), "predicted": r4(p_te[mask].mean())}

    artifact = {"format": ARTIFACT_FORMAT, "task": TASK, "steps": steps, "roles": roles, "features": feature_names(steps, roles), "trees": trees, "calibration": {"x": cal_x, "y": cal_y}}
    metrics = {
        "rows": len(df), "test_rows": len(split.test), "send_back_rate_train": r4(base_rate), "send_back_rate_test": r4(y_te.mean()),
        "auc": r4(auc) if both else None, "brier": r4(model_brier), "log_loss": r4(log_loss(y_te, np.clip(p_te, 1e-6, 1 - 1e-6), labels=[0, 1])),
        "trees": len(trees), "calibration_points": len(cal_x), "by_step": by_step,
    }
    baseline = {"name": "every request gets the training period's send-back rate", "brier": r4(base_brier), "rate": r4(base_rate)}
    on = pd.to_datetime(df["on"])
    return Result(TASK, ALGORITHM, artifact, metrics, baseline, Gate(passed, reasons), len(df), on.min().date(), on.max().date())
