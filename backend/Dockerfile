FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
COPY app ./app
COPY scripts ./scripts
RUN pip install --no-cache-dir .
COPY alembic.ini .
COPY alembic ./alembic
RUN chmod +x ./scripts/start.sh
RUN useradd --create-home didaskey
USER didaskey
EXPOSE 8000
CMD ["./scripts/start.sh"]
