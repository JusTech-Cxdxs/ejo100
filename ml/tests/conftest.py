import os
import sys
from pathlib import Path

# One thread everywhere, so training (and the fixture check) gives the same models on any machine.
for var in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(var, "1")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
