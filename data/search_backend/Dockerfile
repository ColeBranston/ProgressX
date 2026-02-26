from python:3

workdir /usr/src/app

copy . .

run pip install --no-cache-dir -r requirements.txt

expose 8000

cmd python -m uvicorn search_backend:app --reload --host 0.0.0.0 --port 8000