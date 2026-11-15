ALTER TABLE authoritative_sources ADD COLUMN freshness_policy_version TEXT NOT NULL DEFAULT '1';
ALTER TABLE authoritative_sources ADD COLUMN data_mode TEXT NOT NULL DEFAULT 'AUTHORITATIVE' CHECK(data_mode IN('AUTHORITATIVE','TEST'));
