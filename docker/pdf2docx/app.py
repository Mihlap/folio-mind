from __future__ import annotations

import os
import tempfile
from pathlib import Path

from flask import Flask, request, send_file
from pdf2docx import Converter

app = Flask(__name__)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/convert/pdf-to-docx")
def convert_pdf_to_docx():
    upload = request.files.get("file") or request.files.get("data")
    if upload is None:
        return {"error": "missing file"}, 400

    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = Path(tmp) / "input.pdf"
        docx_path = Path(tmp) / "output.docx"
        upload.save(pdf_path)
        cv = Converter(str(pdf_path))
        cv.convert(str(docx_path))
        cv.close()
        return send_file(
            docx_path,
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            as_attachment=True,
            download_name="converted.docx",
        )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
