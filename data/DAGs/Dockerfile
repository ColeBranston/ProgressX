FROM apache/airflow:slim-2.11.1rc2

# the image's own unprivileged user (stated explicitly so the container never runs as root)
USER airflow

EXPOSE 8080

CMD ["webserver"]
