import os
import sys

# One thread: the same models on any machine (and plenty fast for one company's history).
for _var in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_var, "1")

from .cli import main  # noqa: E402  (after the thread settings)

sys.exit(main())
