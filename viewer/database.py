import sqlite3
from pathlib import Path
from typing import Optional


class SignDatabase:
    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self.conn: Optional[sqlite3.Connection] = None

    def connect(self):
        """Open connection to the database."""
        self.conn = sqlite3.connect(str(self.db_path))
        self.conn.row_factory = sqlite3.Row
        return self

    def close(self):
        if self.conn:
            self.conn.close()
            self.conn = None

    def search_meanings(self, query: str, limit: int = 50):
        """Search for signs by Chinese text."""
        if not self.conn:
            return []

        cursor = self.conn.execute(
            """
            SELECT DISTINCT s.id, s.image_path, s.description, s.letter, 
                   m.text as meaning, m.variant_index, m.order_in_entry,
                   s.theme
            FROM meanings m
            JOIN signs s ON s.id = m.sign_id
            WHERE m.text LIKE ?
            ORDER BY s.letter, m.order_in_entry
            LIMIT ?
        """,
            (f"%{query}%", limit),
        )
        return [dict(row) for row in cursor.fetchall()]

    def get_sign_by_id(self, sign_id: int):
        """Get a single sign by its ID."""
        if not self.conn:
            return None

        cursor = self.conn.execute(
            """
            SELECT s.*, GROUP_CONCAT(m.text, '、') as all_meanings
            FROM signs s
            LEFT JOIN meanings m ON m.sign_id = s.id
            WHERE s.id = ?
            GROUP BY s.id
        """,
            (sign_id,),
        )
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_all_letters(self):
        """Get all available letter sections."""
        if not self.conn:
            return []
        cursor = self.conn.execute(
            """
            SELECT letter, COUNT(*) as count 
            FROM signs 
            GROUP BY letter 
            ORDER BY letter
        """
        )
        return [dict(row) for row in cursor.fetchall()]

    def get_meanings_for_sign(self, sign_id: int):
        """Get all meanings for a specific sign."""
        if not self.conn:
            return []
        cursor = self.conn.execute(
            """
            SELECT text, variant_index, order_in_entry
            FROM meanings
            WHERE sign_id = ?
            ORDER BY order_in_entry
        """,
            (sign_id,),
        )
        return [dict(row) for row in cursor.fetchall()]

    def browse_by_letter(self, letter: str, limit: int = 100):
        """Browse signs by their first letter section."""
        if not self.conn:
            return []

        cursor = self.conn.execute(
            """
            SELECT s.id, s.image_path, 
                   GROUP_CONCAT(m.text, '、') as meanings,
                   MIN(s.description) as description
            FROM signs s
            JOIN meanings m ON m.sign_id = s.id
            WHERE s.letter = ?
            GROUP BY s.id
            ORDER BY m.order_in_entry
            LIMIT ?
        """,
            (letter, limit),
        )
        return [dict(row) for row in cursor.fetchall()]
