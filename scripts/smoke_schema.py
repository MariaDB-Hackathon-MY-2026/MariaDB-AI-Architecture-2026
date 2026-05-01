import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from core.schema_generator import generate_schema_plan  # noqa: E402
from core.sql_builder import build_create_statements  # noqa: E402


def main() -> None:
    plan = generate_schema_plan(user_request="Create an employee management system with departments and employees.")
    print(plan)
    stmts = build_create_statements(plan)
    print("\n--- SQL ---\n")
    print(";\n\n".join(stmts) + ";")


if __name__ == "__main__":
    main()

