"""Unusual prices on estimate lines people type in (labour, outside jobs and
parts, internal jobs, sundries — store parts are priced by the store).
An Isolation Forest over three numbers per line: how far the unit price is
from the usual price of that kind of line, the same for the quantity, and
the size of the amount. No labels exist, so the gate checks the model is
sensible: enough lines, and it flags a small share (a mistyped zero, not
everyday variation). Compared with a simple rule (price more than 3× or
less than a third of the usual).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from .. import ARTIFACT_FORMAT
from ..data import time_split
from ..export import check_iforest, iforest_trees
from . import Gate, Result, not_enough, r4

TASK = "PRICE_ANOMALY"
ALGORITHM = "isolation-forest"
MIN_LINES = 200
MIN_KEY_LINES = 3
TYPED = {"LABOUR", "EXTERNAL_PART", "EXTERNAL_JOB", "INTERNAL_JOB", "SUNDRY"}


def priced_lines(jobs: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for _, j in jobs.iterrows():
        for l in j["lines"]:
            p, q = l.get("unit_price"), l.get("quantity")
            if l.get("type") in TYPED and isinstance(p, (int, float)) and p > 0 and isinstance(q, (int, float)) and q > 0:
                rows.append({"opened_on": j["opened_on"], "key": l["key"], "price": float(p), "qty": float(q)})
    return pd.DataFrame(rows, columns=["opened_on", "key", "price", "qty"])


def features(df: pd.DataFrame, refs: dict) -> np.ndarray:
    ok = df["key"].isin(refs.keys())
    d = df[ok]
    price_ref = d["key"].map(lambda k: refs[k]["price"])
    qty_ref = d["key"].map(lambda k: refs[k]["qty"])
    return np.column_stack([np.log(d["price"] / price_ref), np.log(d["qty"] / qty_ref), np.log1p(d["price"] * d["qty"])])


def train(jobs: pd.DataFrame, seed: int = 7) -> Result:
    lines = priced_lines(jobs)
    if len(lines) < MIN_LINES:
        return not_enough(TASK, ALGORITHM, len(lines), MIN_LINES, "typed-in priced lines")
    split = time_split(lines, valid=0.0001, test=0.2)
    train_df = pd.concat([split.train, split.valid])
    grouped = train_df.groupby("key")
    refs = {k: {"price": float(g["price"].median()), "qty": float(g["qty"].median()), "n": int(len(g))} for k, g in grouped if len(g) >= MIN_KEY_LINES}
    if len(refs) < 5:
        return Result(TASK, ALGORITHM, None, {"rows": len(lines), "keys": len(refs)}, None, Gate(False, [f"Only {len(refs)} kinds of line have a usual price yet (needs 5)."]), len(lines))
    X_tr = features(train_df, refs)
    X_te = features(split.test, refs)
    forest = IsolationForest(n_estimators=100, max_samples=min(256, len(X_tr)), contamination=0.02, random_state=seed)
    forest.fit(X_tr)
    trees = iforest_trees(forest)
    check_iforest(forest, trees, X_te if len(X_te) else X_tr)

    flagged_te = float(np.mean(forest.decision_function(X_te) < 0)) if len(X_te) else 0.0
    rule_te = float(np.mean(np.abs(X_te[:, 0]) > np.log(3))) if len(X_te) else 0.0
    passed = 0.002 <= flagged_te <= 0.06 or (len(X_te) < 100 and flagged_te <= 0.06)
    reasons = [f"Flags {flagged_te:.1%} of the newest lines (the 3×-price rule flags {rule_te:.1%})" + ("." if passed else " — expected between 0.2% and 6%.")]
    artifact = {"format": ARTIFACT_FORMAT, "task": TASK, "refs": refs, "features": ["price_ratio_log", "qty_ratio_log", "amount_log"],
                "forest": {"trees": trees, "maxSamples": int(forest.max_samples_), "offset": float(forest.offset_)}}
    metrics = {"rows": len(lines), "test_rows": int(len(X_te)), "keys": len(refs), "flagged_share_test": r4(flagged_te), "trees": len(trees)}
    return Result(TASK, ALGORITHM, artifact, metrics, {"name": "price more than 3× or under a third of the usual", "flagged_share_test": r4(rule_te)}, Gate(passed, reasons), len(lines),
                  lines["opened_on"].min().date(), lines["opened_on"].max().date())
