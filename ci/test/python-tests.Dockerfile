# Test runner for the Python code under data/: the same Python as the search backend image, with
# the backend's requirements, the DAGs' requirements (minus the two the backend already pins
# differently, uvicorn and termcolor, which the DAG code doesn't depend on for behaviour) and the test tools
FROM python:3.12-slim
WORKDIR /src
COPY search_backend/requirements.txt /tmp/backend-requirements.txt
COPY DAGs/requirements.txt /tmp/dags-requirements.txt
RUN (iconv -f UTF-16 -t UTF-8 /tmp/dags-requirements.txt 2>/dev/null || cat /tmp/dags-requirements.txt) \
      | tr -d '\r' | grep -vE '^(uvicorn|termcolor)==' > /tmp/dags-requirements-clean.txt \
 && pip install --no-cache-dir -r /tmp/backend-requirements.txt -r /tmp/dags-requirements-clean.txt \
      pytest==8.4.2 pytest-cov==7.0.0 httpx==0.28.1 fakeredis==2.32.0

# tests run as an unprivileged user; coverage and reports are written to the mounted data/ folder
RUN useradd --system --uid 10001 tester
USER tester
