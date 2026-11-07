-- ============================================================================
-- СХЕМА ЛОКАЛЬНОЙ БАЗЫ ДАННЫХ SQLITE (Linella Radar ULTRA v3.5)
-- Оптимизирована для хранения 50 000+ SKU, партий FEFO, задач и журнала аудита
-- ============================================================================

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

-- 1. Таблица справочника товаров (Каталог 50 000+ SKU)
CREATE TABLE IF NOT EXISTS products_catalog (
    sku TEXT PRIMARY KEY,
    primary_barcode TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '📦 Прочее',
    department TEXT NOT NULL DEFAULT 'Торговый зал',
    shelf_life_days INTEGER NOT NULL DEFAULT 7,
    unit_price_mdl REAL NOT NULL DEFAULT 0.0,
    stock_qty REAL NOT NULL DEFAULT 0.0,
    updated_at TEXT NOT NULL
);

-- 2. Таблица мульти-штрихкодов (несколько EAN на один SKU)
CREATE TABLE IF NOT EXISTS product_barcodes (
    barcode TEXT PRIMARY KEY,
    sku TEXT NOT NULL,
    FOREIGN KEY (sku) REFERENCES products_catalog(sku) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_product_barcodes_sku ON product_barcodes(sku);

-- 3. Таблица партий товаров и FEFO-контроля в торговом зале
CREATE TABLE IF NOT EXISTS product_batches (
    batch_id TEXT PRIMARY KEY,
    sku TEXT NOT NULL,
    barcode TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    production_date TEXT,
    expiry_date TEXT NOT NULL,
    qty INTEGER NOT NULL CHECK (qty >= 0),
    department TEXT NOT NULL DEFAULT 'Зал',
    zone TEXT NOT NULL DEFAULT 'Основная витрина',
    shelf TEXT NOT NULL DEFAULT 'Полка 1',
    unit_price_mdl REAL NOT NULL DEFAULT 28.5,
    batch_status TEXT NOT NULL DEFAULT 'active', -- active | rotate | markdown | writeoff | exception
    fefo_verified INTEGER NOT NULL DEFAULT 0,
    fefo_exception_reason TEXT,
    ocr_confidence REAL,
    photo_data_uri TEXT,
    scanned_by TEXT NOT NULL,
    scanned_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_batches_barcode_expiry ON product_batches(barcode, expiry_date);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON product_batches(expiry_date);

-- 4. Таблица индивидуальных порогов Светофора по категориям
CREATE TABLE IF NOT EXISTS category_thresholds (
    category TEXT PRIMARY KEY,
    red_days INTEGER NOT NULL DEFAULT 3,
    yellow_days INTEGER NOT NULL DEFAULT 7,
    include_production_day INTEGER NOT NULL DEFAULT 0
);

-- 5. Таблица задач смены
CREATE TABLE IF NOT EXISTS shift_tasks (
    task_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    assigned_worker TEXT NOT NULL,
    department TEXT NOT NULL,
    zone TEXT NOT NULL,
    target_sku_or_barcode TEXT,
    target_scans_count INTEGER NOT NULL DEFAULT 10,
    current_scans_count INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'normal', -- high | normal | low
    deadline_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new', -- new | in_progress | completed | overdue | cancelled
    created_at TEXT NOT NULL,
    completed_at TEXT
);

-- 6. Неизменяемый журнал аудита операций (Append-Only Audit Log)
CREATE TABLE IF NOT EXISTS audit_journal (
    audit_id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    worker_name TEXT NOT NULL,
    worker_role TEXT NOT NULL,
    event_type TEXT NOT NULL, -- SCAN | FEFO | QTY_EDIT | IMPORT | BACKUP | ROLE_CHANGE
    barcode TEXT,
    product_title TEXT,
    old_expiry_date TEXT,
    new_expiry_date TEXT,
    qty_delta INTEGER,
    final_qty INTEGER,
    department TEXT,
    result_status TEXT NOT NULL,
    reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_journal(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_barcode ON audit_journal(barcode);

-- 7. Таблица сотрудников и ролей (RBAC)
CREATE TABLE IF NOT EXISTS workers_rbac (
    worker_id TEXT PRIMARY KEY,
    worker_name TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'MERCHANDISER', 'CASHIER')),
    pin_hash TEXT NOT NULL,
    auto_lock_minutes INTEGER NOT NULL DEFAULT 15,
    active INTEGER NOT NULL DEFAULT 1
);

-- 8. Офлайн-очередь отчетов Telegram
CREATE TABLE IF NOT EXISTS telegram_offline_queue (
    report_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    worker_name TEXT NOT NULL,
    report_type TEXT NOT NULL,
    message_body TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'pending' -- pending | sent | failed
);
