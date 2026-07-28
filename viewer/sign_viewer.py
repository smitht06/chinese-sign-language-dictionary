from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QScrollArea,
    QGroupBox,
    QSizePolicy,
)
from PySide6.QtCore import Qt, QSize, Signal
from PySide6.QtGui import QPixmap, QFont, QResizeEvent
from pathlib import Path


class SignViewerWidget(QWidget):
    def __init__(self, image_base_path: Path, parent=None):
        super().__init__(parent)
        self.image_base_path = Path(image_base_path)
        self.current_pixmap = None  # Store the original pixmap
        self._setup_ui()

    def _setup_ui(self):
        """Set up the sign viewer layout."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 10)

        # === Image area ===
        # Create a container widget for the image
        self.image_container = QWidget()
        self.image_container.setMinimumSize(300, 300)
        self.image_container.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)

        # Use a layout inside the container
        container_layout = QVBoxLayout(self.image_container)
        container_layout.setContentsMargins(0, 0, 0, 0)

        self.image_label = QLabel()
        self.image_label.setAlignment(Qt.AlignCenter)
        self.image_label.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.image_label.setStyleSheet(
            """
            QLabel {
                border: 2px dashed #ccc;
                border-radius: 8px;
                background-color: #f9f9f9;
                padding: 10px;
            }
        """
        )

        container_layout.addWidget(self.image_label)

        # Wrap in scroll area (with scroll bars off by default)
        self.image_scroll = QScrollArea()
        self.image_scroll.setWidget(self.image_container)
        self.image_scroll.setWidgetResizable(True)
        self.image_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self.image_scroll.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self.image_scroll.setMinimumHeight(400)

        layout.addWidget(self.image_scroll, 3)  # Give image area more stretch

        # === Word display ===
        self.word_label = QLabel()
        self.word_label.setAlignment(Qt.AlignCenter)
        self.word_label.setFont(QFont("Microsoft YaHei", 26, QFont.Bold))
        self.word_label.setWordWrap(True)
        self.word_label.setStyleSheet(
            """
            QLabel {
                padding: 12px;
                background-color: #1B5E20;
                color: #FFFFFF;
                border-radius: 8px;
                margin: 5px 0px;
                font-size: 26px;
            }
        """
        )
        layout.addWidget(self.word_label, 0)

        # === Meanings group ===
        meanings_group = QGroupBox("释义 Meanings")
        meanings_layout = QVBoxLayout()
        self.meanings_label = QLabel()
        self.meanings_label.setFont(QFont("Microsoft YaHei", 12))
        self.meanings_label.setWordWrap(True)
        meanings_layout.addWidget(self.meanings_label)
        meanings_group.setLayout(meanings_layout)
        layout.addWidget(meanings_group, 1)

        # === Description group ===
        desc_group = QGroupBox("打法 Description")
        desc_layout = QVBoxLayout()
        self.desc_label = QLabel()
        self.desc_label.setFont(QFont("Microsoft YaHei", 11))
        self.desc_label.setWordWrap(True)

        desc_scroll = QScrollArea()
        desc_scroll.setWidget(self.desc_label)
        desc_scroll.setWidgetResizable(True)
        desc_scroll.setMaximumHeight(150)
        desc_layout.addWidget(desc_scroll)
        desc_group.setLayout(desc_layout)
        layout.addWidget(desc_group, 1)

        # === Metadata ===
        meta_group = QGroupBox("信息 Info")
        meta_layout = QVBoxLayout()
        self.meta_label = QLabel()
        self.meta_label.setFont(QFont("Microsoft YaHei", 10))
        self.meta_label.setWordWrap(True)
        meta_layout.addWidget(self.meta_label)
        meta_group.setLayout(meta_layout)
        layout.addWidget(meta_group, 0)  # Fixed height

        self.clear()

    def resizeEvent(self, event: QResizeEvent):
        """Handle window resize to scale the image."""
        super().resizeEvent(event)
        if self.current_pixmap and not self.current_pixmap.isNull():
            self._scale_image()

    def _scale_image(self):
        """Scale the current image to fit the container."""
        if not self.current_pixmap or self.current_pixmap.isNull():
            return

        # Calculate available size (accounting for padding)
        container_size = self.image_container.size()
        margin = 20  # Account for padding and borders
        available_size = QSize(
            max(100, container_size.width() - margin),
            max(100, container_size.height() - margin),
        )

        # Scale maintaining aspect ratio
        scaled = self.current_pixmap.scaled(
            available_size, Qt.KeepAspectRatio, Qt.SmoothTransformation
        )

        self.image_label.setPixmap(scaled)

    def clear(self):
        """Clear the viewer."""
        self.current_pixmap = None
        self.image_label.clear()
        self.image_label.setText("选择手势以查看图片\nSelect a sign to view image")
        self.image_label.setStyleSheet(
            """
            QLabel {
                border: 2px dashed #ccc;
                border-radius: 8px;
                background-color: #f9f9f9;
                padding: 10px;
                font-size: 14px;
            }
        """
        )
        self.word_label.setText("")
        self.meanings_label.setText("")
        self.desc_label.setText("")
        self.meta_label.setText("")

    def display_sign(self, sign_data: dict, meanings: list):
        """Display a sign's data and image."""
        if not sign_data:
            return

        # Image
        image_path = sign_data.get("image_path", "")
        if image_path:
            full_path = self.image_base_path / image_path
            if full_path.exists():
                pixmap = QPixmap(str(full_path))
                if not pixmap.isNull():
                    self.current_pixmap = pixmap
                    self._scale_image()
                    self.image_label.setStyleSheet(
                        """
                        QLabel {
                            border: 2px solid #4CAF50;
                            border-radius: 8px;
                            background-color: #ffffff;
                            padding: 10px;
                        }
                    """
                    )
                else:
                    self.current_pixmap = None
                    self.image_label.setText(
                        f"⚠️ 图片加载失败 Image load failed\n\n"
                        f"文件: {image_path}\n\n"
                        f"提示: 文件可能已损坏"
                    )
                    self.image_label.setStyleSheet(
                        """
                        QLabel {
                            border: 2px solid #f44336;
                            border-radius: 8px;
                            background-color: #fff3f3;
                            font-size: 14px;
                            padding: 20px;
                            color: #d32f2f;
                        }
                    """
                    )
            else:
                self.current_pixmap = None
                self.image_label.setText(
                    f"❌ 图片未找到 Image not found\n\n"
                    f"搜索路径: {full_path.parent}\n"
                    f"文件名: {full_path.name}\n\n"
                    f"请确认 images 文件夹包含所有图片"
                )
                self.image_label.setStyleSheet(
                    """
                    QLabel {
                        border: 2px solid #f44336;
                        border-radius: 8px;
                        background-color: #ffe0e0;
                        font-size: 14px;
                        padding: 20px;
                        color: #d32f2f;
                    }
                """
                )
        else:
            self.current_pixmap = None
            self.image_label.setText("⚠️ 无图片路径 No image path in database")
            self.image_label.setStyleSheet(
                """
                QLabel {
                    border: 2px solid #ff9800;
                    border-radius: 8px;
                    background-color: #fff3e0;
                    font-size: 14px;
                    padding: 20px;
                    color: #e65100;
                }
            """
            )

        # Main word
        all_meanings = sign_data.get("all_meanings", "")
        if all_meanings:
            self.word_label.setText(f"📖 {all_meanings}")
        else:
            self.word_label.setText("")

        # Meanings list
        if meanings:
            meaning_text = ""
            for m in meanings:
                variant = m.get("variant_index")
                text = m["text"]
                if variant:
                    meaning_text += f"  {'①②③④⑤⑥⑦⑧⑨'[variant-1]} {text}\n"
                else:
                    meaning_text += f"  • {text}\n"
            self.meanings_label.setText(meaning_text.strip())
        else:
            self.meanings_label.setText("无释义 No meanings")

        # Description
        desc = sign_data.get("description", "")
        if desc:
            # Format nicely - replace numbered steps with newlines
            desc = desc.replace("（一）", "\n（一）")
            desc = desc.replace("（二）", "\n（二）")
            desc = desc.replace("（三）", "\n（三）")
            desc = desc.replace("（四）", "\n（四）")
            desc = desc.strip()
            self.desc_label.setText(desc)
        else:
            self.desc_label.setText("无描述 No description")

        # Metadata
        letter = sign_data.get("letter", "?")
        volume = sign_data.get("volume", "?")
        theme = sign_data.get("theme", "")

        meta = f"ID: {sign_data['id']}  |  字母: {letter}  |  册: {volume}"
        if theme:
            meta += f"\n主题: {theme}"
        self.meta_label.setText(meta)
