from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path

import ocrmypdf
from flask import Flask, jsonify, request, send_file
from pdf2docx import Converter

app = Flask(__name__)
logger = logging.getLogger(__name__)

MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "100"))
OCR_LANG = os.environ.get("OCR_LANG", "rus+eng")


def _run_ocr(src: Path, dst: Path) -> Path:
    try:
        ocrmypdf.ocr(
            str(src),
            str(dst),
            language=OCR_LANG,
            deskew=False,
            rotate_pages=True,
            output_type="pdf",
            skip_text=False,
            redo_ocr=True,
            optimize=1,
            jobs=1,
        )
        return dst
    except Exception:
        logger.exception("ocrmypdf failed, falling back to the original PDF")
        return src


@app.get("/health")
def health():
    return {"ok": True, "ocr": True}


@app.post("/convert/pdf-to-docx")
def convert_pdf_to_docx():
    upload = request.files.get("file") or request.files.get("data")
    if upload is None:
        return jsonify({"error": "missing file"}), 400
    force_ocr = request.args.get("force_ocr", "0") in ("1", "true", "yes")

    upload.stream.seek(0, os.SEEK_END)
    size_bytes = upload.stream.tell()
    upload.stream.seek(0)
    max_bytes = MAX_UPLOAD_MB * 1024 * 1024
    if size_bytes > max_bytes:
        return (
            jsonify(
                {
                    "error": f"PDF too large ({size_bytes} bytes, limit {MAX_UPLOAD_MB} MB)",
                }
            ),
            413,
        )

    try:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "input.pdf"
            docx_path = Path(tmp) / "output.docx"
            upload.save(pdf_path)

            convert_source = pdf_path
            if force_ocr:
                convert_source = _run_ocr(pdf_path, Path(tmp) / "ocr.pdf")

            cv = Converter(str(convert_source))
            cv.convert(str(docx_path))
            cv.close()
            return send_file(
                docx_path,
                mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                as_attachment=True,
                download_name="converted.docx",
            )
    except Exception as exc:
        logger.exception("pdf2docx conversion failed (%s bytes)", size_bytes)
        return jsonify({"error": str(exc)[:500]}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
