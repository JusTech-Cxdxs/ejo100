"""Recurring complaint themes: TF-IDF of the complaint words, grouped with
k-means (k from 4 to 12, chosen by the silhouette score on cosine distance).
Each theme is named by its strongest words and counted per month, so people
see what customers bring in most and what is rising.

Gate: at least 100 complaints and a silhouette of at least 0.05 (themes that
are more alike inside than across).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import normalize

from .. import ARTIFACT_FORMAT
from ..export import sparse_weights
from ..text import fit_tfidf, spec, transform
from . import Gate, Result, not_enough, r4

TASK = "COMPLAINT_THEMES"
ALGORITHM = "tfidf-kmeans"
MIN_ROWS = 100
TOP_WEIGHTS = 60


def train(jobs: pd.DataFrame, seed: int = 7) -> Result:
    df = jobs[jobs["complaint_tokens"].map(len) > 0].reset_index(drop=True)
    if len(df) < MIN_ROWS:
        return not_enough(TASK, ALGORITHM, len(df), MIN_ROWS, "complaints")
    docs = [list(t) for t in df["complaint_tokens"]]
    vec = fit_tfidf(docs, min_df=3, max_features=3000)
    X = transform(vec, docs)
    keep = np.asarray(X.getnnz(axis=1) > 0)
    X, df = X[keep], df[keep].reset_index(drop=True)
    if X.shape[0] < MIN_ROWS:
        return not_enough(TASK, ALGORITHM, int(X.shape[0]), MIN_ROWS, "complaints with known words")
    rng = np.random.RandomState(seed)
    sample = rng.choice(X.shape[0], size=min(3000, X.shape[0]), replace=False)
    best = None
    for k in range(4, min(12, X.shape[0] // 10) + 1):
        km = KMeans(n_clusters=k, n_init=10, random_state=seed).fit(X)
        s = float(silhouette_score(X[sample], km.labels_[sample], metric="cosine"))
        if best is None or s > best[0] + 1e-9:
            best = (s, k, km)
    if best is None:
        return not_enough(TASK, ALGORITHM, int(X.shape[0]), 40, "complaints")
    sil, k, km = best
    vocab = spec(vec)["vocab"]
    centroids = normalize(km.cluster_centers_)
    labels = km.labels_
    months = df["opened_on"].dt.strftime("%Y-%m")
    last12 = sorted(months.unique())[-12:]
    themes = []
    member_sims = []
    for c in range(k):
        row = centroids[c].copy()
        top = np.argsort(-row, kind="stable")[:TOP_WEIGHTS]
        trimmed = np.zeros_like(row)
        trimmed[top] = row[top]
        trimmed = trimmed / (np.linalg.norm(trimmed) or 1.0)
        members = np.flatnonzero(labels == c)
        sims = np.asarray(X[members] @ trimmed).ravel()
        member_sims.extend(sims.tolist())
        terms = [vocab[i] for i in top[:6] if row[i] > 0]
        counts = months[members].value_counts()
        themes.append({
            "label": " · ".join(terms[:3]) or f"theme {c + 1}", "terms": terms, "centroid": sparse_weights(trimmed),
            "size": int(len(members)), "share": r4(len(members) / X.shape[0]),
            "monthly": [{"month": m, "count": int(counts.get(m, 0))} for m in last12],
        })
    themes.sort(key=lambda t: -t["size"])
    min_sim = float(max(0.1, np.percentile(member_sims, 10)))
    passed = sil >= 0.05
    reasons = [f"{k} themes, silhouette {sil:.2f}" + ("." if passed else " — themes overlap too much (needs 0.05).")]
    artifact = {"format": ARTIFACT_FORMAT, "task": TASK, "tfidf": spec(vec), "themes": themes, "minSimilarity": r4(min_sim)}
    metrics = {"rows": int(X.shape[0]), "themes": k, "silhouette": r4(sil), "vocab": len(vocab)}
    return Result(TASK, ALGORITHM, artifact, metrics, None, Gate(passed, reasons), int(X.shape[0]), df["opened_on"].min().date(), df["opened_on"].max().date())
