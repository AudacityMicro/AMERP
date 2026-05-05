import json
import re
import sys
from datetime import datetime
from pathlib import Path

from pypdf import PdfReader


SUMMARY_LABELS = [
    "Process",
    "Preferred Subprocess",
    "Material",
    "Color",
    "Finish",
    "Threads and Tapped Holes",
    "Inserts",
    "Precision Tolerance",
    "Precision Surface Roughness",
    "Inspection",
    "Certificates and Supplier Qualifications",
    "Notes",
]

DESCRIPTION_EXTENSIONS = (".ipt", ".sldprt", ".sldasm", ".step", ".stp", ".x_t", ".xt")


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def parse_date(value: str) -> str:
    text = normalize_text(value)
    if not text:
        return ""
    cleaned = normalize_text(re.sub(r"\(.*?\)", "", re.sub(r"\b[A-Z]{2,4}\b", "", text)).replace(" ,", ","))
    for fmt in ("%m/%d/%Y", "%m/%d/%Y %I:%M %p", "%m/%d/%Y, %I:%M %p"):
        try:
            return datetime.strptime(cleaned, fmt).date().isoformat()
        except ValueError:
            continue
    return ""


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
        return f"Not a valid PDF purchase order: {error}."
    return None


def collect_block(lines, start_label, end_label):
    try:
        start_index = lines.index(start_label)
    except ValueError:
        return []
    try:
        end_index = lines.index(end_label, start_index + 1)
    except ValueError:
        end_index = len(lines)
    return [line for line in lines[start_index + 1:end_index] if normalize_text(line)]


def parse_summary(lines):
    result = {}
    try:
        start_index = lines.index("Requirements Summary")
        end_index = lines.index("Item Code Part ID** Order ID Description Qty.", start_index + 1)
    except ValueError:
        return result

    index = start_index + 1
    while index < end_index:
        label = lines[index]
        if label not in SUMMARY_LABELS:
            index += 1
            continue
        value_lines = []
        index += 1
        while index < end_index and lines[index] not in SUMMARY_LABELS:
            value_lines.append(lines[index])
            index += 1
        value = normalize_text(" ".join(value_lines))
        if label in result and value and value != result[label]:
          result[label] = normalize_text(f"{result[label]} {value}")
        else:
          result[label] = value
    return result


def parse_row_line(line: str):
    normalized = normalize_text(line)
    match = re.match(
        r"^(?P<item_number>\d+)\s+(?P<item_code>\S+)\s+(?P<part_id>\S+)\s+(?P<order_id>\S+)(?:\s+(?P<tail>.*))?$",
        normalized,
    )
    if not match:
        return None

    if match.group("item_number") == "0":
        return None
    if not normalize_text(match.group("item_code") or "").startswith("CNC-"):
        return None

    tail = normalize_text(match.group("tail") or "")
    quantity = ""
    description = ""
    if tail:
        qty_inline = re.match(r"^(?P<qty>\d+)(?P<desc>.+)$", tail)
        desc_then_qty = re.match(r"^(?P<desc>.+?)\s+(?P<qty>\d+)$", tail)
        if tail.isdigit():
            quantity = tail
        elif qty_inline:
            quantity = normalize_text(qty_inline.group("qty"))
            description = normalize_text(qty_inline.group("desc"))
        elif desc_then_qty:
            description = normalize_text(desc_then_qty.group("desc"))
            quantity = normalize_text(desc_then_qty.group("qty"))
        else:
            description = tail

    return {
        "item_number": normalize_text(match.group("item_number")),
        "item_code": normalize_text(match.group("item_code")),
        "part_id": normalize_text(match.group("part_id")),
        "order_id": normalize_text(match.group("order_id")),
        "quantity": quantity,
        "description": description,
    }


def is_description_line(line: str) -> bool:
    normalized = normalize_text(line)
    lower = normalized.lower()
    return bool(normalized) and lower.endswith(DESCRIPTION_EXTENSIONS) and parse_row_line(line) is None


def parse_purchase_order(path: Path):
    result = {
        "source_path": str(path),
        "source_filename": path.name,
        "warnings": [],
        "parts": [],
    }

    try:
        reader = PdfReader(str(path))
        pages = [page.extract_text() or "" for page in reader.pages]
    except Exception as exc:
        failed_download = parse_failed_download(path)
        result["error"] = failed_download or f"Unable to read PDF: {exc}"
        return result

    raw_text = "\n".join(pages)
    if not normalize_text(raw_text):
        result["error"] = "No extractable text found in the purchase order PDF."
        return result

    lines = [line.strip() for line in raw_text.splitlines() if normalize_text(line)]
    joined = normalize_text(raw_text)
    if "P .O. No." not in joined or "Requirements Summary" not in joined:
        result["error"] = "The PDF text does not match the expected Xometry PO layout."
        return result

    def value_after(label: str):
        try:
            index = lines.index(label)
        except ValueError:
            return ""
        return normalize_text(lines[index + 1]) if index + 1 < len(lines) else ""

    result["purchase_order"] = value_after("P .O. No.")
    result["issue_date"] = value_after("Date:")
    result["issue_date_iso"] = parse_date(result["issue_date"])
    result["partner_quote_id"] = value_after("Partner Quote ID:")
    result["ship_date"] = value_after("Ship Date*:")
    result["ship_date_iso"] = parse_date(result["ship_date"])
    result["shipping_method"] = value_after("Shipping Method:")
    result["expedited"] = "expedited" in result["ship_date"].lower()

    issuer_block = collect_block(lines, "PURCHASE ORDER", "P .O. No.")
    result["issuer_name"] = "Xometry"
    result["issuer_address"] = issuer_block[:-1] if issuer_block else []
    result["issuer_phone"] = issuer_block[-1] if issuer_block else ""

    to_block = collect_block(lines, "To:", "Ship To:")
    ship_to_block = collect_block(lines, "Ship To:", "PO number should")
    result["to_lines"] = to_block
    result["ship_to_lines"] = ship_to_block

    result["vendor_name"] = normalize_text(to_block[0]) if to_block else ""
    result["vendor_address"] = to_block[1:] if len(to_block) > 1 else []
    result["ship_to_name"] = normalize_text(ship_to_block[0]) if ship_to_block else ""
    result["ship_to_address"] = ship_to_block[1:] if len(ship_to_block) > 1 else []

    total_match = re.search(r"TOTAL\s+\$?(?P<amount>[\d,]+(?:\.\d{2})?)", joined, re.IGNORECASE)
    result["total_amount"] = normalize_text(total_match.group("amount")) if total_match else ""

    summary = parse_summary(lines)
    result["summary"] = {
        "process": summary.get("Process", ""),
        "preferred_subprocess": summary.get("Preferred Subprocess", ""),
        "material": summary.get("Material", ""),
        "color": summary.get("Color", ""),
        "finish": summary.get("Finish", ""),
        "threads": summary.get("Threads and Tapped Holes", ""),
        "inserts": summary.get("Inserts", ""),
        "precision_tolerance": summary.get("Precision Tolerance", ""),
        "surface_roughness": summary.get("Precision Surface Roughness", ""),
        "inspection": summary.get("Inspection", ""),
        "certificates": summary.get("Certificates and Supplier Qualifications", ""),
        "notes": summary.get("Notes", ""),
    }

    item_rows = []
    in_rows = False
    for line in lines:
        if line == "Item Code Part ID** Order ID Description Qty.":
            in_rows = True
            continue
        if in_rows and line.startswith("* Ship Date"):
            break
        if not in_rows:
            continue
        parsed = parse_row_line(line)
        if parsed:
            item_rows.append(parsed)

    if not item_rows:
        result["error"] = "No item rows could be parsed from the Xometry purchase order."
        return result

    standalone_descriptions = [line for line in lines if is_description_line(line)]
    missing_description_rows = [row for row in item_rows if not row["description"]]
    if standalone_descriptions and len(standalone_descriptions) >= len(missing_description_rows):
        for row, description in zip(missing_description_rows, standalone_descriptions):
            row["description"] = description
    elif missing_description_rows:
        for row in missing_description_rows:
            result["warnings"].append(f"Description could not be fully parsed for part {row['part_id'] or row['item_number']}.")

    for row in item_rows:
        result["parts"].append({
            **row,
            "process": result["summary"]["process"],
            "preferred_subprocess": result["summary"]["preferred_subprocess"],
            "material": result["summary"]["material"],
            "color": result["summary"]["color"],
            "finish": result["summary"]["finish"],
            "threads": result["summary"]["threads"],
            "inserts": result["summary"]["inserts"],
            "precision_tolerance": result["summary"]["precision_tolerance"],
            "surface_roughness": result["summary"]["surface_roughness"],
            "inspection": result["summary"]["inspection"],
            "certificates": result["summary"]["certificates"],
            "notes": result["summary"]["notes"],
        })

    if not result["purchase_order"]:
        result["error"] = "Missing P.O. No. in the purchase order."
        return result

    return result


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: parse_xometry_purchase_orders.py <pdf_paths...>"}))
        return 1

    files = [Path(arg) for arg in sys.argv[1:]]
    print(json.dumps({"purchase_orders": [parse_purchase_order(path) for path in files]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
