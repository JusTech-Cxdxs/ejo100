"""Which estimate lines a job needs: one logistic regression per line (one-vs-
rest) over the complaint and the vehicle's context, TF-IDF weighted.
Compared with the portal's current method — the lines of the most similar
past jobs (k-nearest neighbours, knn-tfidf-1).

Gate: at least 150 jobs, at least 5 lines seen often enough to learn, and an
F1 at least 0.02 above the neighbours' on the newest jobs.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from .. import ARTIFACT_FORMAT
from ..data import time_split
from ..export import sparse_weights
from ..text import fit_tfidf, spec, tfidf_from_spec, transform
from . import Gate, Result, not_enough, r4

TASK = "ESTIMATE_LINES"
ALGORITHM = "tfidf-logreg-ovr"
MIN_ROWS = 150
MIN_POSITIVES = 5
MAX_LABELS = 300
K = 9


def tokens(row) -> list[str]:
    """As the portal's linesTokens(): complaint words, then context (never the lines themselves)."""
    return list(row["complaint_tokens"]) + list(row["feature_tokens"])


def keys(row) -> set[str]:
    return {l["key"] for l in row["lines"]}


def prf(pred: list[set[str]], gold: list[set[str]]) -> dict:
    tp = sum(len(p & g) for p, g in zip(pred, gold))
    np_ = sum(len(p) for p in pred)
    ng = sum(len(g) for g in gold)
    precision = tp / np_ if np_ else 0.0
    recall = tp / ng if ng else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"precision": r4(precision), "recall": r4(recall), "f1": r4(f1)}


def knn_baseline(X_tr, train_keys: list[set[str]], X_te, k: int = K, share: float = 1 / 3) -> list[set[str]]:
    sims = (X_te @ X_tr.T).toarray()
    out = []
    for row in sims:
        top = np.argsort(-row, kind="stable")[:k]
        top = [i for i in top if row[i] > 0]
        if len(top) < 3:
            out.append(set())
            continue
        c = Counter(key for i in top for key in train_keys[i])
        out.append({key for key, n in c.items() if n / len(top) >= share})
    return out


def train(jobs: pd.DataFrame, seed: int = 7) -> Result:
    df = jobs[jobs["lines"].map(len) > 0].reset_index(drop=True)
    if len(df) < MIN_ROWS:
        return not_enough(TASK, ALGORITHM, len(df), MIN_ROWS)
    split = time_split(df)
    vec = fit_tfidf([tokens(r) for _, r in split.train.iterrows()], min_df=2, max_features=5000)
    X_tr, X_va, X_te = (transform(vec, [tokens(r) for _, r in s.iterrows()]) for s in (split.train, split.valid, split.test))
    tr_keys = [keys(r) for _, r in split.train.iterrows()]
    va_keys = [keys(r) for _, r in split.valid.iterrows()]
    te_keys = [keys(r) for _, r in split.test.iterrows()]

    counts = Counter(k for ks in tr_keys for k in ks)
    n = len(tr_keys)
    # Most common first; ties by key, so the order never depends on Python's set ordering.
    labels = [k for k, c in sorted(counts.items(), key=lambda kc: (-kc[1], kc[0])) if MIN_POSITIVES <= c <= n - MIN_POSITIVES][:MAX_LABELS]
    if len(labels) < 5:
        return Result(TASK, ALGORITHM, None, {"rows": len(df), "labels": len(labels)}, None, Gate(False, [f"Only {len(labels)} kinds of line are common enough to learn (needs 5)."]), len(df))

    # Pick the regularisation on the validation period, then the decision threshold.
    def fit(C: float):
        models = []
        for lab in labels:
            y = np.array([lab in ks for ks in tr_keys], dtype=int)
            m = LogisticRegression(C=C, solver="liblinear", class_weight="balanced", random_state=seed, max_iter=500)
            m.fit(X_tr, y)
            models.append(m)
        return models

    def probs(models, X) -> np.ndarray:
        return np.column_stack([m.predict_proba(X)[:, 1] for m in models]) if X.shape[0] else np.zeros((0, len(models)))

    max_lines = int(min(15, max(3, np.percentile([len(k) for k in tr_keys], 95))))

    def decide(P: np.ndarray, threshold: float) -> list[set[str]]:
        out = []
        for row in P:
            order = [i for i in np.argsort(-row, kind="stable") if row[i] >= threshold][:max_lines]
            out.append({labels[i] for i in order})
        return out

    best = None
    for C in (0.5, 1.0, 2.0, 4.0):
        models = fit(C)
        P = probs(models, X_va)
        for t in np.arange(0.3, 0.86, 0.05):
            f1 = prf(decide(P, float(t)), va_keys)["f1"]
            if best is None or f1 > best[0]:
                best = (f1, C, float(round(t, 2)), models)
    _, C, threshold, models = best

    P_te = probs(models, X_te)
    ours = prf(decide(P_te, threshold), te_keys)
    base = prf(knn_baseline(X_tr, tr_keys, X_te), te_keys)

    weights = [sparse_weights(m.coef_[0]) for m in models]
    intercepts = [float(m.intercept_[0]) for m in models]
    sp = spec(vec)
    # Self-check: the portal's arithmetic gives the same probabilities.
    for r in range(min(50, X_te.shape[0])):
        v = tfidf_from_spec(sp, tokens(split.test.iloc[r]))
        for j in range(len(labels)):
            z = sum(v.get(i, 0.0) * w for i, w in zip(weights[j]["i"], weights[j]["w"])) + intercepts[j]
            if abs(1 / (1 + np.exp(-z)) - P_te[r, j]) > 1e-9:
                raise AssertionError("Exported logistic weights differ from scikit-learn")

    info = {}
    for _, r in split.train.iterrows():
        for l in r["lines"]:
            info.setdefault(l["key"], {"type": l["type"], "label": l["label"], "q": []})["q"].append(float(l["quantity"] or 1))
    artifact = {
        "format": ARTIFACT_FORMAT, "task": TASK, "tfidf": sp,
        "labels": [{"key": k, "type": info[k]["type"], "label": info[k]["label"], "medianQty": float(np.median(info[k]["q"]))} for k in labels],
        "intercepts": intercepts, "weights": weights, "threshold": threshold, "maxLines": max_lines,
    }
    passed = ours["f1"] >= base["f1"] + 0.02
    reasons = [f"F1 {ours['f1']:.2f} against the similar-jobs method's {base['f1']:.2f}" + ("." if passed else " — needs to be at least 0.02 higher.")]
    metrics = {"rows": len(df), "test_rows": len(split.test), "labels": len(labels), "C": C, "threshold": threshold, "max_lines": max_lines, **ours}
    return Result(TASK, ALGORITHM, artifact, metrics, {"name": "similar past jobs (knn-tfidf-1)", **base}, Gate(passed, reasons), len(df), df["opened_on"].min().date(), df["opened_on"].max().date())
