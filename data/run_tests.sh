#!/bin/sh
# Runs every Python test suite under data/ with coverage, from the repository root so coverage paths
# (data/...) line up with SonarQube's. Usage (inside the python-tests container, or locally with the
# test services up): sh data/run_tests.sh [extra pytest args, e.g. -m "not integration"]
set -eu
cd "$(dirname "$0")/.."
export COVERAGE_RCFILE=data/.coveragerc
export COVERAGE_FILE=data/.coverage
rm -f data/.coverage data/coverage-python.xml data/test-results/*.xml
mkdir -p data/test-results

status=0
for suite in search_backend DAGs foods db; do
    echo "== $suite"
    # each package in its own process: two of them have top-level modules with the same names
    python -m pytest "data/$suite/tests" --rootdir=data --import-mode=importlib -p no:cacheprovider \
        --cov --cov-append --cov-report= \
        --junitxml="data/test-results/$suite.xml" "$@" || status=$?
done
python -m coverage xml -o data/coverage-python.xml
python -m coverage report | tail -1
exit $status
