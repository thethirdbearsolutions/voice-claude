-- Migration number: 0001 	 2025-02-25T23:46:11.989Z

CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recall_key TEXT,
  transcript TEXT,
  description TEXT,
  timestamp DATETIME
);

CREATE INDEX idx_conversations_recall_key on conversations(recall_key);
