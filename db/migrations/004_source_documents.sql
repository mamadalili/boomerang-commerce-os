CREATE TABLE source_documents (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  job_id TEXT NOT NULL REFERENCES jobs(id),
  version INTEGER NOT NULL,
  filename TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('MARKDOWN', 'XLSX')),
  sha256 TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  raw_bytes BLOB NOT NULL,
  preview_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('UPLOADED_UNVERIFIED')),
  created_at TEXT NOT NULL,
  UNIQUE(product_id, version)
);
CREATE INDEX source_documents_job ON source_documents(job_id, version DESC);
