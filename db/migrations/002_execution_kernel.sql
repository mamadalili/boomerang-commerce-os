ALTER TABLE job_steps ADD COLUMN updated_at TEXT;
ALTER TABLE job_steps ADD COLUMN evidence_reference TEXT;

UPDATE job_steps SET updated_at = created_at WHERE updated_at IS NULL;

CREATE TABLE job_step_transitions(
  id TEXT PRIMARY KEY,
  job_step_id TEXT NOT NULL REFERENCES job_steps(id),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reason_code TEXT,
  human_message TEXT,
  evidence_reference TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(to_status NOT IN('WAITING','BLOCKED') OR (reason_code IS NOT NULL AND human_message IS NOT NULL))
);

CREATE INDEX job_step_transitions_step_time ON job_step_transitions(job_step_id,created_at);
