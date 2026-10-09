# The same Python the test suite runs on (ci/test/python-tests.Dockerfile)
FROM python:3.12-slim

WORKDIR /usr/src/app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# only the service's own modules (never certificates, keys or env files from this folder)
COPY config.py main.py search_cache.py solr_instance.py ./

# run as an unprivileged user
RUN useradd --system --uid 10001 --no-create-home search
USER search

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "exec python -m uvicorn main:app --host 0.0.0.0 --port $PORT"]
