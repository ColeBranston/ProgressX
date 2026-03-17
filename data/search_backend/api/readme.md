# Run Command

python -m uvicorn main:app --reload

# Docker Command

docker run --rm -p 8000:8000 --name local_backend --env-file .env search_backend
