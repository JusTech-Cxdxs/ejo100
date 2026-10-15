"""One module per learning task. Each `train()` returns a Result: the portable
artifact, the held-out metrics, the simple baseline it was compared with, and
the gate — whether it is good enough to be offered to people at all.

A model that fails its gate is still reported (status REJECTED in the portal),
so people can see why nothing changed. A model that passes is only a
CANDIDATE: a person chooses to use it (Settings → Enyo → Learning).
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field


@dataclass
class Gate:
    passed: bool
    reasons: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {"passed": self.passed, "reasons": self.reasons}


@dataclass
class Result:
    task: str
    algorithm: str
    artifact: dict | None
    metrics: dict
    baseline: dict | None
    gate: Gate
    rows: int
    data_from: dt.date | None = None
    data_to: dt.date | None = None


def not_enough(task: str, algorithm: str, rows: int, needed: int, what: str = "finished jobs") -> Result:
    return Result(task, algorithm, None, {"rows": rows}, None, Gate(False, [f"Needs at least {needed} {what}; has {rows}."]), rows)


def r4(x: float) -> float:
    return float(round(float(x), 4))
