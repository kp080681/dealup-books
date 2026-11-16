# DealUp Books

Bookkeeping and compliance agent for DealUp Strategies Private Limited.

Step 1 (this version): owner + read-only CA logins, entries by typed message or form,
confirm before save, append-only ledger (corrections and cancellations are new rows with
a reason; the database refuses edits and deletes), CA questions flagged per entry, CSV export.

Settings: DATABASE_URL, SESSION_SECRET (24+ chars), SETUP_CODE (one-time, for /setup).
