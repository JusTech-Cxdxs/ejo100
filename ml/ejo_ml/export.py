"""Trained models → the portable "ejo-ml/1" shapes the portal evaluates.

Every exporter is paired with a Python evaluator that follows the portal's
runtime (runtime-core.ts) step for step. `check_*` compares that evaluator
with the library's own predictions; training stops if they ever differ, so a
model that the portal would compute differently is never uploaded.
"""
from __future__ import annotations

import math
from typing import Callable

import numpy as np

ZERO = 1e-35
MISSING = {"None": 0, "Zero": 1, "NaN": 2}


# ------------------------------------------------------------------ LightGBM


def lgbm_trees(booster) -> list[dict]:
    """A LightGBM booster's trees, numerical splits only, children in pre-order."""
    out = []
    for info in booster.dump_model()["tree_info"]:
        nodes: list[dict] = []
        leaves: list[float] = []

        def walk(node: dict) -> int:
            if "leaf_value" in node:
                leaves.append(float(node["leaf_value"]))
                return -len(leaves)  # -(index + 1)
            if node.get("decision_type") != "<=":
                raise ValueError("Only numerical splits are exported (no categorical features).")
            at = len(nodes)
            nodes.append({})
            left = walk(node["left_child"])
            right = walk(node["right_child"])
            nodes[at] = {
                "f": int(node["split_feature"]),
                "t": float(node["threshold"]),
                "l": left,
                "r": right,
                "d": bool(node["default_left"]),
                "m": MISSING[node.get("missing_type", "None")],
            }
            return at

        root = walk(info["tree_structure"])
        if root < 0:  # a single leaf
            nodes = []
        out.append({"nodes": nodes, "leaves": leaves})
    return out


def leaf_of(tree: dict, x: Callable[[int], float]) -> int:
    nodes = tree["nodes"]
    if not nodes:
        return 0
    at = 0
    while True:
        n = nodes[at]
        v = x(n["f"])
        m = n.get("m", 0)
        if math.isnan(v) and m != 2:
            v = 0.0
        if (m == 1 and abs(v) <= ZERO) or (m == 2 and math.isnan(v)):
            left = bool(n.get("d", False))
        else:
            left = v <= n["t"]
        nxt = n["l"] if left else n["r"]
        if nxt < 0:
            return -nxt - 1
        at = nxt


def boosted(trees: list[dict], x: Callable[[int], float]) -> float:
    return float(sum(t["leaves"][leaf_of(t, x)] for t in trees))


def check_lgbm(booster, trees: list[dict], X, rows: int = 200, tol: float = 1e-6) -> float:
    """Largest difference between LightGBM's raw score and the exported trees, on up to `rows` rows."""
    X = X[: min(rows, X.shape[0])]
    expected = booster.predict(X, raw_score=True)
    dense = X.toarray() if hasattr(X, "toarray") else np.asarray(X)
    worst = 0.0
    for r in range(dense.shape[0]):
        got = boosted(trees, lambda f, r=r: float(dense[r, f]))
        worst = max(worst, abs(got - float(expected[r])))
    if worst > tol:
        raise AssertionError(f"Exported trees differ from LightGBM by {worst:.3g}")
    return worst


# ------------------------------------------------------------------ Isolation Forest


def iforest_trees(forest) -> list[dict]:
    """scikit-learn IsolationForest → trees over the ORIGINAL feature indexes, with each leaf's sample count."""
    out = []
    for est, feats in zip(forest.estimators_, forest.estimators_features_):
        t = est.tree_
        nodes: list[dict] = []
        leaves: list[int] = []
        samples: list[float] = []

        def walk(i: int) -> int:
            if t.children_left[i] == -1:
                leaves.append(i)
                samples.append(float(t.n_node_samples[i]))
                return -len(leaves)
            at = len(nodes)
            nodes.append({})
            left = walk(int(t.children_left[i]))
            right = walk(int(t.children_right[i]))
            nodes[at] = {"f": int(feats[int(t.feature[i])]), "t": float(t.threshold[i]), "l": left, "r": right}
            return at

        root = walk(0)
        if root < 0:
            nodes = []
        out.append({"nodes": nodes, "leaves": [0.0] * len(leaves), "samples": samples})
    return out


def average_path_length(n: float) -> float:
    if n <= 1:
        return 0.0
    if n == 2:
        return 1.0
    return 2.0 * (math.log(n - 1.0) + np.euler_gamma) - 2.0 * (n - 1.0) / n


def iforest_decision(trees: list[dict], max_samples: int, offset: float, x: list[float]) -> float:
    depth_sum = 0.0
    for t in trees:
        depth, leaf = 0, 0
        if t["nodes"]:
            at = 0
            while True:
                n = t["nodes"][at]
                depth += 1
                nxt = n["l"] if float(np.float32(x[n["f"]])) <= n["t"] else n["r"]
                if nxt < 0:
                    leaf = -nxt - 1
                    break
                at = nxt
        depth_sum += depth + average_path_length(t["samples"][leaf])
    score = -(2 ** (-depth_sum / (len(trees) * average_path_length(max_samples))))
    return score - offset


def check_iforest(forest, trees: list[dict], X: np.ndarray, rows: int = 300, tol: float = 1e-9) -> float:
    X = np.asarray(X)[:rows]
    expected = forest.decision_function(X)
    worst = 0.0
    for r in range(X.shape[0]):
        got = iforest_decision(trees, int(forest.max_samples_), float(forest.offset_), [float(v) for v in X[r]])
        worst = max(worst, abs(got - float(expected[r])))
    if worst > tol:
        raise AssertionError(f"Exported isolation forest differs from scikit-learn by {worst:.3g}")
    return worst


# ------------------------------------------------------------------ sparse weights


def sparse_weights(row: np.ndarray, eps: float = 1e-10) -> dict:
    idx = np.flatnonzero(np.abs(row) > eps)
    return {"i": [int(i) for i in idx], "w": [float(row[i]) for i in idx]}
