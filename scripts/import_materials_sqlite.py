import json
import sqlite3
import sys
from pathlib import Path


def rows(cursor, query, params=()):
    cursor.execute(query, params)
    columns = [col[0] for col in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "usage: import_materials_sqlite.py <db_path>"}))
        return 1

    db_path = Path(sys.argv[1])
    if not db_path.exists():
        print(json.dumps({"error": f"database not found: {db_path}"}))
        return 1

    connection = sqlite3.connect(db_path)
    cursor = connection.cursor()
    try:
        materials = rows(cursor, "SELECT * FROM materials ORDER BY updated_at DESC, id DESC")
        payload = []
        for material in materials:
            material_id = material["id"]
            payload.append(
                {
                    "material": material,
                    "attachments": rows(cursor, "SELECT * FROM attachments WHERE material_id = ? ORDER BY attached_at DESC, id DESC", (material_id,)),
                    "jobs": rows(cursor, "SELECT * FROM material_jobs WHERE material_id = ? ORDER BY date_used DESC, id DESC", (material_id,)),
                    "change_log": rows(cursor, "SELECT * FROM material_change_log WHERE material_id = ? ORDER BY created_at DESC, id DESC", (material_id,)),
                }
            )

        print(json.dumps({"materials": payload}))
        return 0
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
