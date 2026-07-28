#!/usr/bin/env python3
"""Sign Language Dictionary Viewer - PySide6 Desktop Application."""

import sys
from pathlib import Path
from PySide6.QtWidgets import QApplication, QMessageBox
from PySide6.QtCore import Qt

from viewer.main_window import MainWindow


def main():
    # Configure paths - adjust these to match your project structure
    PROJECT_ROOT = Path("/Users/tony/red-cyber-dragon/chinese-sign-language-dictionary")
    DB_PATH = PROJECT_ROOT / "sign_themed.db"  # or signs.db
    IMAGE_PATH = PROJECT_ROOT

    # Validate paths
    if not DB_PATH.exists():
        QApplication(sys.argv)
        msg = QMessageBox()
        msg.setIcon(QMessageBox.Critical)
        msg.setWindowTitle("数据库错误 Database Error")
        msg.setText(f"数据库未找到 Database not found:\n{DB_PATH}")
        msg.setInformativeText(
            "请确认 sign-language-database 路径正确\n"
            "Please verify the project path is correct"
        )
        msg.exec()
        sys.exit(1)

    if not IMAGE_PATH.exists():
        QApplication(sys.argv)
        msg = QMessageBox()
        msg.setIcon(QMessageBox.Warning)
        msg.setWindowTitle("图片路径错误 Image Path Error")
        msg.setText(f"图片文件夹未找到 Images folder not found:\n{IMAGE_PATH}")
        msg.exec()

    app = QApplication(sys.argv)
    app.setApplicationName("Sign Language Dictionary")

    # Set application-wide style
    app.setStyle("Fusion")

    window = MainWindow(DB_PATH, IMAGE_PATH)
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
