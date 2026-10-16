"""A realistic, entirely invented workshop history — for tests, the parity
fixtures and demos. Never mixed with a company's real data.

Jobs follow common Lagos workshop cases (brakes, air-conditioning, services,
no-start, overheating, vibration, check-engine, gearbox, suspension) on the
vehicles people actually bring in, with prices in naira, seasonal swings
(more air-conditioning in the dry season), a few mistyped prices for the
anomaly model, and parts consumption that is intermittent, as real spare
parts are.
"""
from __future__ import annotations

import datetime as dt
import math
import random

VEHICLES = [
    ("toyota", "corolla", "car"), ("toyota", "camry", "car"), ("toyota", "hilux", "pickup"), ("toyota", "rav4", "suv"),
    ("toyota", "land cruiser prado", "suv"), ("honda", "accord", "car"), ("honda", "cr-v", "suv"), ("lexus", "rx 350", "suv"),
    ("hyundai", "elantra", "car"), ("hyundai", "tucson", "suv"), ("kia", "sorento", "suv"), ("ford", "ranger", "pickup"),
    ("mitsubishi", "l200", "pickup"), ("nissan", "pathfinder", "suv"), ("mercedes benz", "c300", "car"),
]
BRANCHES = ["isolo", "ikeja", "vi"]
DEPARTMENTS = ["mechanical", "electrical", "body"]

# case → complaint words, lines (type, key, label, base unit price, qty), base hours, spread
CASES = {
    "brakes": (["brakepad", "squeal", "noise"], [("STORE_PART", "STORE_PART:brake pad", "Brake pad", None, 1), ("LABOUR", "LABOUR:brake", "Brake labour", 15_000, 1)], 6, 0.35),
    "brake_disc": (["brakedisc", "vibration", "brakepad"], [("STORE_PART", "STORE_PART:brake disc", "Brake disc", None, 2), ("STORE_PART", "STORE_PART:brake pad", "Brake pad", None, 1), ("LABOUR", "LABOUR:brake disc", "Brake disc labour", 25_000, 1)], 9, 0.35),
    "aircon": (["aircon", "notcooling"], [("EXTERNAL_JOB", "EXTERNAL_JOB:aircon gas", "AC gas refill", 35_000, 1), ("LABOUR", "LABOUR:aircon", "AC labour", 12_000, 1)], 8, 0.4),
    "aircon_compressor": (["aircon", "notcooling", "noise"], [("EXTERNAL_PART", "EXTERNAL_PART:aircon compressor", "AC compressor", 280_000, 1), ("EXTERNAL_JOB", "EXTERNAL_JOB:aircon gas", "AC gas refill", 35_000, 1), ("LABOUR", "LABOUR:aircon compressor", "Compressor labour", 40_000, 1)], 52, 0.45),
    "service": (["service", "oilchange"], [("STORE_PART", "STORE_PART:engine oil", "Engine oil", None, 5), ("STORE_PART", "STORE_PART:oil filter", "Oil filter", None, 1), ("LABOUR", "LABOUR:oilchange", "Service labour", 10_000, 1)], 4, 0.3),
    "major_service": (["service", "oilchange", "sparkplug"], [("STORE_PART", "STORE_PART:engine oil", "Engine oil", None, 5), ("STORE_PART", "STORE_PART:oil filter", "Oil filter", None, 1), ("STORE_PART", "STORE_PART:air filter", "Air filter", None, 1), ("STORE_PART", "STORE_PART:spark plug", "Spark plug", None, 4), ("LABOUR", "LABOUR:major", "Major service labour", 25_000, 1)], 7, 0.3),
    "no_start": (["nostart", "battery"], [("STORE_PART", "STORE_PART:battery", "Battery", None, 1), ("LABOUR", "LABOUR:battery", "Battery labour", 5_000, 1)], 3, 0.4),
    "overheating": (["overheating", "radiator", "coolantleak"], [("EXTERNAL_PART", "EXTERNAL_PART:radiator", "Radiator", 95_000, 1), ("STORE_PART", "STORE_PART:coolant", "Coolant", None, 4), ("LABOUR", "LABOUR:radiator", "Radiator labour", 20_000, 1)], 30, 0.5),
    "vibration": (["vibration", "steering", "tyre"], [("INTERNAL_JOB", "INTERNAL_JOB:balancing", "Wheel balancing", 8_000, 1), ("INTERNAL_JOB", "INTERNAL_JOB:alignment", "Wheel alignment", 10_000, 1)], 3, 0.35),
    "check_engine": (["checkengine", "lowpower"], [("INTERNAL_JOB", "INTERNAL_JOB:diagnosis scan", "Diagnosis scan", 15_000, 1), ("EXTERNAL_JOB", "EXTERNAL_JOB:injector", "Injector cleaning", 30_000, 1), ("LABOUR", "LABOUR:injector", "Injector labour", 12_000, 1)], 10, 0.5),
    "gearbox": (["gearbox", "jerking"], [("EXTERNAL_JOB", "EXTERNAL_JOB:gearbox", "Gearbox overhaul", 350_000, 1), ("LABOUR", "LABOUR:gearbox", "Gearbox labour", 60_000, 1)], 96, 0.4),
    "suspension": (["knocking", "suspension", "shockabsorber"], [("STORE_PART", "STORE_PART:shock absorber", "Shock absorber", None, 2), ("LABOUR", "LABOUR:shockabsorber", "Suspension labour", 20_000, 1)], 8, 0.35),
}
PARTS = ["brake pad", "brake disc", "engine oil", "oil filter", "air filter", "spark plug", "battery", "coolant", "shock absorber"]
FILLER = ["sometime", "morning", "highway", "slowly", "started", "yesterday", "front", "rear", "left", "right"]


def _season_weight(case: str, month: int) -> float:
    dry = month in (11, 12, 1, 2, 3)
    if case.startswith("aircon"):
        return 2.2 if dry else 0.8
    if case == "overheating":
        return 1.6 if dry else 0.9
    if case in ("vibration", "suspension"):
        return 1.5 if month in (6, 7, 8, 9) else 1.0  # rainy season potholes
    return 1.0


def jobs(n: int = 900, seed: int = 7, start: dt.date = dt.date(2024, 1, 8), days: int = 640) -> list[dict]:
    rng = random.Random(seed)
    out = []
    names = list(CASES)
    for k in range(n):
        opened = start + dt.timedelta(days=int(days * k / n) + rng.randint(0, 2))
        weights = [_season_weight(c, opened.month) * (2.5 if c == "service" else 1.0) for c in names]
        case = rng.choices(names, weights)[0]
        words, lines, hours, spread = CASES[case]
        make, model, vtype = rng.choice(VEHICLES)
        year = rng.randint(2006, 2023)
        km = max(5_000, int(rng.gauss((opened.year - year) * 18_000, 15_000)))
        branch = rng.choice(BRANCHES)
        dept = "electrical" if case in ("no_start", "check_engine") else "mechanical"
        kind = "SERVICE" if case in ("service", "major_service") else "JOB_CARD"
        complaint = list(words) + rng.sample(FILLER, rng.randint(0, 2))
        rng.shuffle(complaint)
        age = opened.year - year
        age_band = "0_2" if age <= 2 else "3_5" if age <= 5 else "6_10" if age <= 10 else "11_15" if age <= 15 else "16_plus"
        family = model.split(" ")[0].replace("-", " ").split(" ")[0]
        feature_tokens = [f"kind:{'service' if kind == 'SERVICE' else 'job'}", f"make:{make.replace(' ', '_')}", f"family:{make.replace(' ', '_')}_{family}",
                          f"age:{age_band}", f"km:{min(300_000, km // 25_000 * 25_000)}", f"vtype:{vtype}", f"branch:{branch}", f"dept:{dept}"]
        price_factor = 1.25 if make in ("lexus", "mercedes benz", "toyota") and model in ("rx 350", "c300", "land cruiser prado") else 1.0
        jl = []
        for (typ, key, label, price, qty) in lines:
            q = qty if typ != "STORE_PART" else max(1, qty + rng.choice([0, 0, 0, 1]))
            if price is None:
                jl.append({"type": typ, "key": key, "label": label, "quantity": q, "unit_price": None, "amount": None})
                continue
            unit = round(price * price_factor * rng.uniform(0.85, 1.15) / 500) * 500
            if rng.random() < 0.01:  # a mistyped price (an extra zero)
                unit *= 10
            jl.append({"type": typ, "key": key, "label": label, "quantity": q, "unit_price": float(unit), "amount": float(unit * q)})
        if rng.random() < 0.12:
            jl.append({"type": "SUNDRY", "key": "SUNDRY", "label": "Sundry", "quantity": 1, "unit_price": 2_000.0, "amount": 2_000.0})
        old = 1 + 0.025 * max(0, age - 8)
        busy = 1.25 if opened.weekday() >= 4 else 1.0
        turnaround = max(0.5, hours * old * busy * math.exp(rng.gauss(0, spread)))
        numbers = {"complaint_words": len(complaint), "lines_total": len(jl)}
        for t in ("STORE_PART", "EXTERNAL_PART", "EXTERNAL_JOB", "INTERNAL_JOB", "LABOUR", "SUNDRY"):
            numbers[f"lines_{t.lower()}"] = sum(1 for x in jl if x["type"] == t)
        numbers["parts_quantity"] = sum(x["quantity"] for x in jl if x["type"] in ("STORE_PART", "EXTERNAL_PART"))
        out.append({
            "row_id": f"s{k:05d}", "kind": kind, "opened_on": opened.isoformat(), "complaint_tokens": complaint, "feature_tokens": feature_tokens,
            "work_numbers": numbers, "turnaround_hours": round(turnaround, 2), "lines": jl,
        })
    return out


def parts(weeks: int = 104, seed: int = 11, as_of: dt.date = dt.date(2026, 10, 5)) -> list[dict]:
    """Weekly consumption: steady sellers (oil), intermittent ones (discs, batteries), some never used."""
    rng = random.Random(seed)
    out = []
    profiles = {"engine oil": (14, 0.95), "oil filter": (3, 0.9), "air filter": (1.2, 0.5), "spark plug": (2.5, 0.35), "brake pad": (2, 0.7),
                "brake disc": (1.5, 0.25), "battery": (1, 0.3), "coolant": (2, 0.3), "shock absorber": (2, 0.2)}
    for i, name in enumerate(PARTS * 2):
        rate, p = profiles[name]
        rate *= rng.uniform(0.6, 1.4)
        weekly = []
        for w in range(weeks):
            month = ((as_of - dt.timedelta(weeks=weeks - 1 - w)).month)
            boost = 1.3 if name in ("coolant",) and month in (1, 2, 3) else 1.0
            weekly.append(int(round(rng.expovariate(1 / (rate * boost)))) if rng.random() < p else 0)
        out.append({"part_id": f"part{i:03d}", "weekly": weekly, "as_of": as_of.isoformat()})
    out.append({"part_id": "part-unused", "weekly": [0] * weeks, "as_of": as_of.isoformat()})
    return out


STEPS = ["prs_hod", "prs_store", "epr_finance", "epr_manager", "job_card_approval", "service_approval", "job_cancellation", "estimate_manager", "warranty_provider"]
ROLES = ["technician", "workshop-supervisor", "store-officer", "finance-officer", "receptionist", "warranty-officer"]


def decisions(n: int = 2400, seed: int = 5, start: dt.date = dt.date(2024, 3, 4), days: int = 560) -> list[dict]:
    """Approval decisions with real-world patterns: large outside purchases and
    late-evening requests are sent back more often, technicians' first parts
    slips more than store officers', warranty providers refuse about a quarter."""
    rng = random.Random(seed)
    base = {"prs_hod": 0.08, "prs_store": 0.05, "epr_finance": 0.12, "epr_manager": 0.1, "job_card_approval": 0.06, "service_approval": 0.04,
            "job_cancellation": 0.3, "estimate_manager": 0.15, "warranty_provider": 0.25}
    out = []
    for k in range(n):
        on = start + dt.timedelta(days=int(days * k / n))
        step = rng.choices(STEPS, [5, 4, 3, 2, 5, 4, 1, 3, 1])[0]
        role = rng.choice(ROLES)
        amount = round(rng.lognormvariate(11.5, 1.0), 2) if step.startswith("epr") or step == "warranty_provider" else 0.0
        lines = rng.randint(1, 8) if step.startswith("prs") or step == "estimate_manager" else (1 if amount else 0)
        hour = rng.choices(range(24), [1] * 7 + [8] * 10 + [3] * 7)[0]
        p = base[step]
        if amount > 250_000:
            p *= 3.0
        if hour >= 18 or hour < 7:
            p *= 2.5
        if role == "technician" and step.startswith("prs"):
            p *= 2.5
        if lines >= 6:
            p *= 2.0
        rejected = 1 if rng.random() < min(0.9, p) else 0
        out.append({"row_id": f"d{k:05d}", "on": on.isoformat(), "step": step, "rejected": rejected, "amount": amount, "lines": lines, "hour": hour,
                    "weekday": on.isoweekday(), "requester_role": role, "decider_role": "workshop-manager", "wait_hours": round(rng.expovariate(1 / 6), 2)})
    return out
