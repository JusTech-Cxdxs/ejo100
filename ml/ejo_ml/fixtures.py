"""Parity fixtures: small models trained on the invented history, with inputs
and the outputs Python computes. The portal's unit tests run the same inputs
through its own runtime (runtime-core.ts) and must get the same numbers.

The chain of trust: LightGBM / scikit-learn == this package's evaluators
(checked during training, export.check_*), and this package's evaluators ==
the portal's runtime (checked by apps/portal/tests/enyo-ml.test.ts).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from . import synth
from .data import decisions_frame, jobs_frame, parts_frame
from .export import boosted, iforest_decision
from .tasks import anomaly, decisions, demand, duration, lines, themes
from .text import tfidf_from_spec


def _duration_case(art: dict, row) -> dict:
    toks = duration.tokens(row)
    nums = {k: float(row["work_numbers"].get(k, 0) or 0) for k in art["numeric"]}
    v = tfidf_from_spec(art["tfidf"], toks)
    nv = len(art["tfidf"]["vocab"])

    def x(f: int) -> float:
        return v.get(f, 0.0) if f < nv else nums[art["numeric"][f - nv]]

    raw = sorted(max(0.0, float(np.expm1(boosted(art["quantiles"][q], x)))) for q in ("p10", "p50", "p90"))
    return {"input": {"tokens": toks, "numbers": nums}, "expected": {"p10": raw[0], "p50": raw[1], "p90": raw[2]}}


def _lines_case(art: dict, row) -> dict:
    toks = lines.tokens(row)
    v = tfidf_from_spec(art["tfidf"], toks)
    probs = []
    for w, b in zip(art["weights"], art["intercepts"]):
        z = sum(v.get(i, 0.0) * wt for i, wt in zip(w["i"], w["w"])) + b
        probs.append(float(1 / (1 + np.exp(-z))))
    return {"input": {"tokens": toks}, "expected": {"probabilities": probs}}


def write_fixtures(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    jobs = jobs_frame(synth.jobs(600, seed=21))
    parts = parts_frame(synth.parts(seed=5))
    sample = jobs.tail(25)

    d = duration.train(jobs, n_estimators=60)
    l = lines.train(jobs)
    a = anomaly.train(jobs)
    t = themes.train(jobs)
    p = demand.train(parts)
    for r in (d, l, a, t, p):
        if not r.artifact:
            raise SystemExit(f"{r.task}: no artifact ({r.gate.reasons})")

    files = {
        "job_duration.json": {"artifact": d.artifact, "cases": [_duration_case(d.artifact, row) for _, row in sample.iterrows()]},
        "estimate_lines.json": {"artifact": l.artifact, "cases": [_lines_case(l.artifact, row) for _, row in sample.iterrows()]},
    }
    a_cases = []
    for _, row in sample.iterrows():
        for ln in row["lines"]:
            if ln["key"] in a.artifact["refs"] and ln.get("unit_price"):
                ref = a.artifact["refs"][ln["key"]]
                feats = [float(np.log(ln["unit_price"] / ref["price"])), float(np.log(ln["quantity"] / ref["qty"])), float(np.log((ln["unit_price"] * ln["quantity"]) / (ref["price"] * ref["qty"])))]
                f = a.artifact["forest"]
                a_cases.append({"input": {"key": ln["key"], "unitPrice": ln["unit_price"], "quantity": ln["quantity"]}, "expected": {"score": iforest_decision(f["trees"], f["maxSamples"], f["offset"], feats)}})
    # Two deliberate outliers: ten times the usual price, and a tenth of it.
    key = next(iter(a.artifact["refs"]))
    ref = a.artifact["refs"][key]
    for factor in (10.0, 0.1):
        price = ref["price"] * factor
        feats = [float(np.log(price / ref["price"])), 0.0, float(np.log(factor))]
        f = a.artifact["forest"]
        a_cases.append({"input": {"key": key, "unitPrice": price, "quantity": ref["qty"]}, "expected": {"score": iforest_decision(f["trees"], f["maxSamples"], f["offset"], feats)}})
    files["price_anomaly.json"] = {"artifact": a.artifact, "cases": a_cases[:60]}

    t_cases = []
    for _, row in sample.iterrows():
        v = tfidf_from_spec(t.artifact["tfidf"], list(row["complaint_tokens"]))
        sims = [sum(v.get(i, 0.0) * w for i, w in zip(th["centroid"]["i"], th["centroid"]["w"])) for th in t.artifact["themes"]]
        best = int(np.argmax(sims)) if sims else -1
        ok = best >= 0 and sims[best] > 0 and sims[best] >= t.artifact["minSimilarity"]
        t_cases.append({"input": {"tokens": list(row["complaint_tokens"])}, "expected": {"index": best if ok else None, "similarity": float(sims[best]) if ok else None}})
    files["complaint_themes.json"] = {"artifact": t.artifact, "cases": t_cases}

    on_hand = {r["partId"]: round(r["reorderPoint"] * f, 2) for r, f in zip(p.artifact["parts"], [0.5, 1.5] * len(p.artifact["parts"]))}
    expected = []
    for r in p.artifact["parts"]:
        have = on_hand.get(r["partId"])
        if r["method"] == "none" or r["reorderPoint"] <= 0 or have is None or have > r["reorderPoint"]:
            continue
        want = int(np.ceil(r["reorderPoint"] + r["forecast4w"] - have))
        if want > 0:
            expected.append({"partId": r["partId"], "suggestedQuantity": want})
    files["parts_demand.json"] = {"artifact": p.artifact, "cases": [{"input": {"onHand": on_hand}, "expected": {"suggestions": expected}}]}

    dec = decisions_frame(synth.decisions(seed=13))
    dr = decisions.train(dec)
    if not dr.artifact:
        raise SystemExit(f"DECISION_RISK: no artifact ({dr.gate.reasons})")
    da = dr.artifact
    sample_d = dec.tail(40)
    X = decisions.features(sample_d, da["steps"], da["roles"])
    d_cases = []
    for k, (_, row) in enumerate(sample_d.iterrows()):
        raw = boosted(da["trees"], lambda f, k=k: float(X[k, f]))
        prob = float(np.clip(np.interp(raw, da["calibration"]["x"], da["calibration"]["y"]), 0, 1))
        role = row["requester_role"] if isinstance(row["requester_role"], str) else None
        d_cases.append({"input": {"step": row["step"], "requester_role": role, "amount": float(row["amount"]), "lines": int(row["lines"]), "hour": int(row["hour"]), "weekday": int(row["weekday"])}, "expected": {"raw": raw, "probability": prob}})
    # A role the model never saw counts as "other".
    unseen = pd.DataFrame([{"step": da["steps"][0], "requester_role": "not-a-role", "amount": 0.0, "lines": 2, "hour": 10, "weekday": 3}])
    Xu = decisions.features(unseen, da["steps"], da["roles"])
    raw_u = boosted(da["trees"], lambda f: float(Xu[0, f]))
    d_cases.append({"input": unseen.iloc[0].to_dict(), "expected": {"raw": raw_u, "probability": float(np.clip(np.interp(raw_u, da["calibration"]["x"], da["calibration"]["y"]), 0, 1))}})
    files["decision_risk.json"] = {"artifact": da, "cases": d_cases}

    for name, body in files.items():
        (out / name).write_text(json.dumps(body, separators=(",", ":")), encoding="utf-8")
        print(f"{name}: {len(body['cases'])} cases, {(out / name).stat().st_size // 1024} KB")
