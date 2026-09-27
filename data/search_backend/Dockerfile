from python:3

workdir /usr/src/app

copy . .

run pip install --no-cache-dir -r requirements.txt

env PORT=8000
expose 8000

cmd python -m uvicorn main:app --host 0.0.0.0 --port $PORT
