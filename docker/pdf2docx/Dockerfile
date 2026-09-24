FROM python:3.11-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-rus \
    tesseract-ocr-eng \
    ghostscript \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir flask pdf2docx gunicorn ocrmypdf

WORKDIR /app
COPY app.py /app/app.py

EXPOSE 8080
CMD ["gunicorn", "-b", "0.0.0.0:8080", "--timeout", "900", "--graceful-timeout", "30", "-w", "1", "app:app"]
