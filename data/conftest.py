import os
import sys

import pytest

# Shared by every Python suite under data/. Each package is run in its own pytest process (see
# run_tests.sh) because the search backend and the DAGs both have top-level modules named config.py
# and solr_instance.py.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from testsupport import solr_request  # noqa: E402


def pytest_configure(config):
    config.addinivalue_line("markers", "integration: needs the throwaway Solr/Redis from ci/test/docker-compose.yml")
    config.addinivalue_line("markers", "regression: pins a bug that was fixed, so it can't come back")


@pytest.fixture(scope="session")
def solr_available():
    try:
        solr_request("foods/admin/ping?wt=json")
    except OSError as error:
        pytest.skip(f"test Solr isn't running ({error}); start it with npm run test:services")
