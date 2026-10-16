"""Enyo machine learning for EJO 100 (Just Technologies).

Trains one organisation's models from its own de-identified history, checks
them against simple baselines on the most recent data, and produces portable
artifacts (format "ejo-ml/1") that the portal runs itself — no Python server
in production. See docs/ML.md.
"""

__version__ = "0.1.0"
ARTIFACT_FORMAT = "ejo-ml/1"
TASKS = ("JOB_DURATION", "ESTIMATE_LINES", "PARTS_DEMAND", "PRICE_ANOMALY", "COMPLAINT_THEMES", "DECISION_RISK")
