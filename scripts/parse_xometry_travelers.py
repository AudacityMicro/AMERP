import json
import re
import sys
from datetime import datetime
from pathlib import Path

from pypdf import PdfReader


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def parse_date(value: str) -> str:
    text = normalize_text(value)
    if not text:
        return ""
    cleaned = re.sub(r"\b[A-Z]{2,4}\b", "", text).replace(" ,", ",")
    cleaned = normalize_text(cleaned)
    for fmt in ("%m/%d/%Y, %I:%M %p", "%m/%d/%Y"):
        try:
            return datetime.strptime(cleaned, fmt).date().isoformat()
        except ValueError:
            continue
    return ""


def extract(pattern: str, text: str):
    return re.search(pattern, text, re.IGNORECASE)


def parse_failed_download(path: Path):
    try:
        raw = path.read_text(encoding="utf-8")
    except Exception:
        return None
    try:
        payload = json.loads(raw)
    except Exception:
        return None
    error = payload.get("data", {}).get("error") or payload.get("info", {}).get("message")
    if error:
        return f"Not a valid PDF traveler: {error}."
    return None


def parse_traveler(path: Path):
    result = {
        "source_path": str(path),
        "source_filename": path.name,
        "warnings": [],
    }
    try:
        reader = PdfReader(str(path))
        text = normalize_text(" ".join((page.extract_text() or "") for page in reader.pages))
    except Exception as exc:
        failed_download = parse_failed_download(path)
        result["error"] = failed_download or f"Unable to read PDF: {exc}"
        return result

    if not text:
        result["error"] = "No extractable text found in the traveler PDF."
        return result
    if "Customer Part ID" not in text or "Part Name" not in text or "Quantity" not in text:
        result["error"] = "The PDF text does not match the expected Xometry traveler layout."
        return result

    part_header = extract(
        r"Customer Part ID Part Name Quantity\s+(?P<part_number>\S+)\s+(?P<part_name>.*?)\s+(?P<quantity>\d+)\s+Process Preferred Subprocess Material",
        text,
    )
    process_block = extract(
        r"Process Preferred Subprocess Material\s+(?P<process>.*?)\s+(?P<preferred_subprocess>.*?)\s+(?P<material>.*?)\s+Finish Threads and Tapped Holes Inserts",
        text,
    )
    finish_block = extract(
        r"Finish Threads and Tapped Holes Inserts\s+(?P<finish>.*?)\s+(?P<threads>Yes|No)\s+(?P<inserts>Yes|No)\s+Precision Tolerance",
        text,
    )
    quality_block = extract(
        r"Precision Tolerance Precision Surface Roughness Inspection\s+(?P<precision_tolerance>.*?)\s+(?P<surface_roughness>.*?)\s+(?P<inspection>.*?)(?=\s+(?:Certificates and Supplier Qualifications|Notes)\s+)",
        text,
    )
    notes_block = extract(
        r"Notes\s+(?P<notes>.*?)(?:\s+Jobs Job ID:\s+(?P<traveler_job_id>\S+))?\s+Revision #(?P<revision>\d+)\s+Last revised on\s+(?P<last_revised>.*?)(?:\s+(?P<extra_requirements>This job is expedited\..*?))?\s+Report Generated at\s+(?P<report_generated>.*)$",
        text,
    )
    part_block = extract(
        r"Part\s+(?P<part_index>\d+)\s+of\s+(?P<part_total>\d+)\s+(?P<dimensions>.*?)\s+Purchase Order",
        text,
    )
    po_block = extract(
        r"Purchase Order Due Date Contact\s+(?P<purchase_order>\S+)\s+(?P<due_date>.*?)\s+(?P<contact>[\w.+-]+@[\w.-]+)",
        text,
    )
    certificates_block = extract(
        r"Certificates and Supplier Qualifications\s+(?P<certificates>.*?)\s+Notes",
        text,
    )
    color_process_block = extract(
        r"Process Preferred Subprocess Material\s+(?P<process>.*?)\s+(?P<preferred_subprocess>.*?)\s+(?P<material>.*?)(?=\s+Color Finish Threads and Tapped Holes\s+)",
        text,
    )
    color_finish_block = extract(
        r"Color Finish Threads and Tapped Holes\s+(?P<color>.*?)\s+(?P<finish>.*?)\s+(?P<threads>Yes|No)\s+Inserts Precision Tolerance Precision Surface Roughness\s+(?P<inserts>Yes|No)\s+(?P<precision_tolerance>Yes|No)\s+(?P<surface_roughness>.*?)(?=\s+Inspection Certificates and Supplier Qualifications\s+)",
        text,
    )
    color_inspection_block = extract(
        r"Inspection Certificates and Supplier Qualifications\s+(?P<inspection>.*?)\s+(?P<certificates>.*?)\s+Notes",
        text,
    )

    if not process_block and color_process_block:
        process_block = color_process_block
    if not finish_block and color_finish_block:
        finish_block = color_finish_block
    if not quality_block and color_finish_block:
        quality_block = color_finish_block
    if not certificates_block and color_inspection_block:
        certificates_block = color_inspection_block

    if not part_header:
        result["error"] = "Unable to locate Customer Part ID / Part Name / Quantity in the traveler."
        return result

    if not process_block:
        result["warnings"].append("Process, subprocess, or material fields could not be parsed.")
    if not finish_block:
        result["warnings"].append("Finish, thread, or insert fields could not be parsed.")
    if not quality_block:
        result["warnings"].append("Tolerance, roughness, or inspection fields could not be parsed.")
    if not notes_block:
        result["warnings"].append("Notes and revision metadata could not be fully parsed.")

    result.update({
        "part_number": normalize_text(part_header.group("part_number")),
        "part_name": normalize_text(part_header.group("part_name")),
        "quantity": normalize_text(part_header.group("quantity")),
        "dimensions": normalize_text(part_block.group("dimensions")) if part_block else "",
        "part_index": normalize_text(part_block.group("part_index")) if part_block else "",
        "part_total": normalize_text(part_block.group("part_total")) if part_block else "",
        "purchase_order": normalize_text(po_block.group("purchase_order")) if po_block else "",
        "due_date": normalize_text(po_block.group("due_date")) if po_block else "",
        "contact": normalize_text(po_block.group("contact")) if po_block else "",
        "process": normalize_text(process_block.group("process")) if process_block else "",
        "preferred_subprocess": normalize_text(process_block.group("preferred_subprocess")) if process_block else "",
        "material": normalize_text(process_block.group("material")) if process_block else "",
        "finish": normalize_text(finish_block.group("finish")) if finish_block else "",
        "threads": normalize_text(finish_block.group("threads")) if finish_block else "",
        "inserts": normalize_text(finish_block.group("inserts")) if finish_block else "",
        "precision_tolerance": normalize_text(quality_block.group("precision_tolerance")) if quality_block else "",
        "surface_roughness": normalize_text(quality_block.group("surface_roughness")) if quality_block else "",
        "inspection": normalize_text((quality_block.groupdict().get("inspection") if quality_block else "") or (color_inspection_block.group("inspection") if color_inspection_block else "")),
        "certificates": normalize_text(certificates_block.group("certificates")) if certificates_block else "",
        "notes": normalize_text(notes_block.group("notes")) if notes_block else "",
        "traveler_job_id": normalize_text(notes_block.group("traveler_job_id")) if notes_block else "",
        "revision": normalize_text(notes_block.group("revision")) if notes_block else "",
        "last_revised": normalize_text(notes_block.group("last_revised")) if notes_block else "",
        "last_revised_iso": parse_date(notes_block.group("last_revised")) if notes_block else "",
        "report_generated": normalize_text(notes_block.group("report_generated")) if notes_block else "",
        "extra_requirements": normalize_text(notes_block.group("extra_requirements")) if notes_block else "",
    })
    combined_process = normalize_text(" ".join([
        result["process"],
        result["preferred_subprocess"],
        result["material"],
    ]))
    if "No Preference" in combined_process and result["preferred_subprocess"] != "No Preference":
        process_text, material_text = combined_process.split("No Preference", 1)
        result["process"] = normalize_text(process_text)
        result["preferred_subprocess"] = "No Preference"
        result["material"] = normalize_text(material_text)

    if result["inspection"].startswith("Roughness:") and " Standard Inspection" in result["inspection"]:
        roughness_tail, _separator, _inspection_tail = result["inspection"].partition(" Standard Inspection")
        result["surface_roughness"] = normalize_text(f"{result['surface_roughness']} {roughness_tail}")
        result["inspection"] = "Standard Inspection"
    if result["certificates"].startswith("Standard Inspection ") and result["inspection"] in ("", "Standard"):
        result["inspection"] = "Standard Inspection"
        result["certificates"] = normalize_text(result["certificates"].removeprefix("Standard Inspection "))
    elif result["certificates"].startswith("Inspection ") and result["inspection"] == "Standard":
        result["inspection"] = "Standard Inspection"
        result["certificates"] = normalize_text(result["certificates"].removeprefix("Inspection "))

    result["expedited"] = "(Expedited)" in result["due_date"] or "expedited" in result["extra_requirements"].lower()
    result["additional_notes"] = [result["extra_requirements"]] if result["extra_requirements"] else []
    return result


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: parse_xometry_travelers.py <pdf_paths...>"}))
        return 1

    files = [Path(arg) for arg in sys.argv[1:]]
    print(json.dumps({"travelers": [parse_traveler(path) for path in files]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
