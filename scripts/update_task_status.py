import sys
import openpyxl

XLSX_PATH = r"C:\startup\VisibleAU\src\docs\latets\CodePrompts\Sprint1\Lucky_test_prompts.xlsx"

def set_task_status(task_number: int, status: str):
    wb = openpyxl.load_workbook(XLSX_PATH)
    ws = wb.active
    for row in ws.iter_rows(min_col=1, max_col=3):
        if row[0].value == task_number:
            row[2].value = status
            break
    wb.save(XLSX_PATH)
    print(f"[STATUS] Task {task_number} -> {status}")

if __name__ == "__main__":
    task_num = int(sys.argv[1])
    status = sys.argv[2]
    set_task_status(task_num, status)
