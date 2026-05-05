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
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
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


def parse_part_row(line: str):
    normalized = normalize_text(line)
    tokens = normalized.split()
    if len(tokens) < 6:
        return None
    print_required = tokens[-1]
    if print_required not in {"Yes", "No"}:
        return None
    qty_index = next((index for index, token in enumerate(tokens[:-1]) if token.isdigit()), -1)
    if qty_index <= 0:
        return None

    tolerance_index = -1
    for index in range(qty_index + 1, len(tokens) - 1):
      token = tokens[index]
      if any(character.isdigit() for character in token) and ("." in token or not token.isalnum()):
          tolerance_index = index
          break
    if tolerance_index <= qty_index + 1 or tolerance_index >= len(tokens) - 2:
        return None

    return {
        "part_name": normalize_text(" ".join(tokens[:qty_index])),
        "quantity": normalize_text(tokens[qty_index]),
        "material": normalize_text(" ".join(tokens[qty_index + 1:tolerance_index])),
        "tolerance": normalize_text(tokens[tolerance_index]),
        "finishing": normalize_text(" ".join(tokens[tolerance_index + 1:-1])),
        "print_required": normalize_text(print_required),
    }


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
    if "PARTS SPECIFICATION" not in joined or "PO NUMBER" not in joined:
        result["error"] = "The PDF text does not match the expected Subtract PO layout."
        return result

    def value_after(label: str):
      try:
          index = lines.index(label)
      except ValueError:
          return ""
      return normalize_text(lines[index + 1]) if index + 1 < len(lines) else ""

    result["purchase_order"] = value_after("PO NUMBER")
    result["issue_date"] = value_after("ISSUE DATE")
    result["issue_date_iso"] = parse_date(result["issue_date"])
    result["ship_date"] = value_after("SHIP DATE")
    result["ship_date_iso"] = parse_date(result["ship_date"])

    from_block = collect_block(lines, "FROM: SUBTRACT MANUFACTURING", "TO: VENDOR / SHOP")
    deliver_block = collect_block(lines, "DELIVER TO: CUSTOMER", "PARTS SPECIFICATION")
    result["issuer_lines"] = from_block
    result["deliver_to_lines"] = deliver_block

    if from_block:
        result["issuer_name"] = normalize_text(from_block[0])
        result["issuer_email"] = next((line for line in from_block if "@" in line), "")
        result["issuer_phone"] = next((line for line in from_block if "+" in line or re.search(r"\d{3}[- )]", line)), "")
        address_lines = [
            line for line in from_block[1:]
            if line not in {result["issuer_email"], result["issuer_phone"]}
        ]
        result["issuer_address"] = address_lines
    else:
        result["issuer_name"] = "Subtract Manufacturing"
        result["issuer_email"] = ""
        result["issuer_phone"] = ""
        result["issuer_address"] = []
        result["warnings"].append("Issuer block could not be fully parsed.")

    if deliver_block:
        result["deliver_to_name"] = normalize_text(deliver_block[0])
        result["deliver_to_contact"] = ""
        for line in deliver_block[1:]:
            if line.lower().startswith("contact:"):
                result["deliver_to_contact"] = normalize_text(line.split(":", 1)[1])
                break
        result["deliver_to_email"] = next((line for line in deliver_block if "@" in line), "")
        result["deliver_to_phone"] = next((line for line in deliver_block if "+" in line or re.search(r"\d{3}[- )]", line)), "")
        result["deliver_to_address"] = [
            line for line in deliver_block[1:]
            if not line.lower().startswith("contact:")
            and line not in {result["deliver_to_email"], result["deliver_to_phone"]}
        ]
    else:
        result["deliver_to_name"] = ""
        result["deliver_to_contact"] = ""
        result["deliver_to_email"] = ""
        result["deliver_to_phone"] = ""
        result["deliver_to_address"] = []
        result["warnings"].append("Deliver-to block could not be fully parsed.")

    notes_match = re.search(r"NOTES:\s*(?P<notes>.*?)(?:TOTAL AMOUNT\s+\$?(?P<amount>[\d,]+(?:\.\d{2})?))", raw_text, re.IGNORECASE | re.DOTALL)
    result["notes"] = normalize_text(notes_match.group("notes")) if notes_match else ""
    result["total_amount"] = normalize_text(notes_match.group("amount")) if notes_match else ""
    if not result["total_amount"]:
        amount_match = re.search(r"TOTAL AMOUNT\s+\$?(?P<amount>[\d,]+(?:\.\d{2})?)", joined, re.IGNORECASE)
        result["total_amount"] = normalize_text(amount_match.group("amount")) if amount_match else ""

    try:
        parts_index = lines.index("PARTS SPECIFICATION")
    except ValueError:
        result["error"] = "Unable to locate PARTS SPECIFICATION."
        return result

    row_lines = []
    for line in lines[parts_index + 1:]:
        if line == "PART NAME QTY MATERIAL TOLERANCE FINISHING PRINT?":
            continue
        if line.startswith("NOTES:") or line.startswith("TOTAL AMOUNT"):
            break
        row_lines.append(line)

    for line in row_lines:
        parsed = parse_part_row(line)
        if parsed:
            result["parts"].append(parsed)
        else:
            result["warnings"].append(f"Could not parse part row: {normalize_text(line)}")

    if not result["purchase_order"]:
        result["error"] = "Missing PO NUMBER in the purchase order."
        return result
    if not result["parts"]:
        result["error"] = "No part rows could be parsed from PARTS SPECIFICATION."
        return result

    return result


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: parse_subtract_purchase_orders.py <pdf_paths...>"}))
        return 1

    files = [Path(arg) for arg in sys.argv[1:]]
    print(json.dumps({"purchase_orders": [parse_purchase_order(path) for path in files]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
