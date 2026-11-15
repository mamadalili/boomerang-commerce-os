import { randomUUID } from 'node:crypto';

const required = ['kind', 'name', 'version', 'location', 'operatingContext', 'freshnessPolicyVersion'];

function normalize(input) {
  for (const field of required) if (!input[field]?.trim()) throw new Error('SOURCE_FIELD_REQUIRED');
  if (!['PRICE', 'INVENTORY'].includes(input.kind)) throw new Error('SOURCE_KIND_INVALID');
  if (!['AUTHORITATIVE', 'TEST'].includes(input.dataMode)) throw new Error('SOURCE_DATA_MODE_INVALID');
  const policy = input.freshnessPolicy;
  if (input.kind === 'INVENTORY' && (policy?.mode !== 'max_age_minutes' || !Number.isFinite(policy.value) || policy.value <= 0)) throw new Error('INVALID_INVENTORY_FRESHNESS_POLICY');
  if (input.kind === 'PRICE' && !['valid_until_next_version', 'explicit_expiry'].includes(policy?.mode)) throw new Error('INVALID_PRICE_FRESHNESS_POLICY');
  if (input.kind === 'PRICE' && policy.mode === 'explicit_expiry') {
    if (!policy.expiresAt) throw new Error('PRICE_EXPIRY_REQUIRED');
    const timestamp = Date.parse(policy.expiresAt);
    if (!Number.isFinite(timestamp)) throw new Error('PRICE_EXPIRY_INVALID');
    if (timestamp <= Date.now()) throw new Error('PRICE_EXPIRY_EXPIRED');
    return { ...input, freshnessPolicy: { ...policy, expiresAt: new Date(timestamp).toISOString() } };
  }
  return input;
}

export function createSourceService({ db, stores }) {
  return {
    activate(input, actor = 'admin') {
      const normalized = normalize(input);
      const id = randomUUID();
      return db.transaction(() => {
        stores.sources.activate({ ...normalized, id });
        stores.audit.append({ id: randomUUID(), actor, action: 'SOURCE_VERSION_ACTIVATED', subjectType: 'SOURCE_VERSION', subjectId: id, metadata: { kind: normalized.kind, version: normalized.version, operatingContext: normalized.operatingContext, freshnessPolicyVersion: normalized.freshnessPolicyVersion, dataMode: normalized.dataMode } });
        return stores.sources.get(id);
      })();
    },
  };
}
