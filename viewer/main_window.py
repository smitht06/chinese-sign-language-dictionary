from PySide6.QtWidgets import (
    QMainWindow,
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QSplitter,
    QListWidget,
    QListWidgetItem,
    QLabel,
    QPushButton,
    QLineEdit,
    QComboBox,
    QMessageBox,
)
from PySide6.QtCore import Qt, Slot
from PySide6.QtGui import QPixmap, QFont
from pathlib import Path

from .database import SignDatabase
from .sign_viewer import SignViewerWidget


class MainWindow(QMainWindow):
    def __init__(self, db_path: str | Path, image_base_path: str | Path):
        super().__init__()
        self.db_path = Path(db_path)
        self.image_base_path = Path(image_base_path)
        self.db = SignDatabase(db_path)
        self.db.connect()

        self.setWindowTitle("中国手语词典 - Chinese Sign Language Dictionary")
        self.setMinimumSize(1200, 800)

        self._setup_ui()
        self._populate_letter_combo()

    def _setup_ui(self):
        """Create the main UI layout."""
        central = QWidget()
        self.setCentralWidget(central)
        main_layout = QVBoxLayout(central)

        # === Top toolbar ===
        toolbar = QHBoxLayout()

        # Search bar
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("输入中文搜索... (Type Chinese to search)")
        self.search_input.setMinimumWidth(300)
        self.search_input.returnPressed.connect(self._on_search)

        search_btn = QPushButton("搜索 Search")
        search_btn.clicked.connect(self._on_search)

        # Letter browser
        self.letter_combo = QComboBox()
        self.letter_combo.addItem("浏览全部 Browse All", "all")
        self.letter_combo.currentIndexChanged.connect(self._on_letter_changed)

        toolbar.addWidget(QLabel("🔍"))
        toolbar.addWidget(self.search_input)
        toolbar.addWidget(search_btn)
        toolbar.addSpacing(20)
        toolbar.addWidget(QLabel("按字母浏览 By Letter:"))
        toolbar.addWidget(self.letter_combo)
        toolbar.addStretch()

        main_layout.addLayout(toolbar)

        # === Main content: splitter ===
        splitter = QSplitter(Qt.Horizontal)

        splitter.setStretchFactor(0, 1)  # results list
        splitter.setStretchFactor(1, 3)  # sign viewer gets 3x stretch

        # Set initial sizes
        splitter.setSizes([300, 900])

        # Left: results list
        self.results_list = QListWidget()
        self.results_list.setMinimumWidth(300)
        self.results_list.currentRowChanged.connect(self._on_result_selected)
        self.results_list.setFont(QFont("Microsoft YaHei", 11))

        # Right: sign viewer
        self.sign_viewer = SignViewerWidget(self.image_base_path)

        splitter.addWidget(self.results_list)
        splitter.addWidget(self.sign_viewer)
        splitter.setSizes([350, 850])

        main_layout.addWidget(splitter, 1)

        # === Status bar ===
        self.statusBar().showMessage("就绪 Ready")

    def _populate_letter_combo(self):
        """Fill the letter combo box."""
        letters = self.db.get_all_letters()
        for letter_info in letters:
            letter = letter_info["letter"]
            count = letter_info["count"]
            display = letter if letter != "#" else "其他 Other"
            self.letter_combo.addItem(f"{display} ({count})", letter)

    @Slot()
    def _on_search(self):
        """Handle search query."""
        query = self.search_input.text().strip()
        if not query:
            QMessageBox.information(self, "提示 Hint", "请输入中文")
            return

        results = self.db.search_meanings(query)
        self._display_results(results, f"搜索结果: '{query}'")

    @Slot()
    def _on_letter_changed(self):
        """Handle letter combo change."""
        letter = self.letter_combo.currentData()
        if letter == "all":
            return

        results = self.db.browse_by_letter(letter)
        display_name = letter if letter != "#" else "其他 Other"
        self._display_results(results, f"字母 {display_name}:")

    def _display_results(self, results, title: str):
        """Populate the results list."""
        self.results_list.clear()
        self.results_list.setUpdatesEnabled(False)

        if not results:
            self.results_list.addItem("未找到结果 No results found")
            self.statusBar().showMessage(f"{title} — 0 个结果")
            self.sign_viewer.clear()
            self.results_list.setUpdatesEnabled(True)
            return

        for item_data in results:
            # Build display text
            meanings = item_data.get("meaning", item_data.get("meanings", ""))
            variant = item_data.get("variant_index")
            letter = item_data.get("letter", "")
            theme = item_data.get("theme", "")

            text = meanings
            if variant:
                text += f" ({'①②③④⑤⑥⑦⑧⑨'[variant-1]})"
            if theme:
                text += f" [{theme}]"

            item = QListWidgetItem(text)
            item.setData(Qt.UserRole, item_data)
            self.results_list.addItem(item)

        self.results_list.setUpdatesEnabled(True)
        self.statusBar().showMessage(f"{title} — {len(results)} 个结果")

    @Slot(int)
    def _on_result_selected(self, row: int):
        """Handle selecting a result from the list."""
        if row < 0:
            return

        item = self.results_list.item(row)
        if not item:
            return

        data = item.data(Qt.UserRole)
        if not data:
            return

        sign_id = data.get("id")
        if not sign_id:
            return

        sign_data = self.db.get_sign_by_id(sign_id)
        if not sign_data:
            return

        meanings = self.db.get_meanings_for_sign(sign_id)
        self.sign_viewer.display_sign(sign_data, meanings)
