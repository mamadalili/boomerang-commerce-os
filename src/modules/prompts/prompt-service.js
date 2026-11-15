import { randomUUID } from 'node:crypto';

export function createPromptService({ db, stores }) {
  return {
    createVersion({ templateId, content, variables = [], settings = {} }, actor = 'admin') {
      if (!stores.prompts.get(templateId)) throw new Error('PROMPT_TEMPLATE_NOT_FOUND');
      if (!content?.trim()) throw new Error('PROMPT_CONTENT_REQUIRED');
      if (!Array.isArray(variables) || variables.some(item => typeof item !== 'string')) throw new Error('PROMPT_VARIABLES_INVALID');
      if (!settings || Array.isArray(settings) || typeof settings !== 'object') throw new Error('PROMPT_SETTINGS_INVALID');
      return db.transaction(() => {
        const saved = stores.prompts.addVersion(templateId, content.trim(), variables, settings);
        stores.audit.append({ id: randomUUID(), actor, action: 'PROMPT_VERSION_CREATED', subjectType: 'PROMPT_TEMPLATE', subjectId: templateId, metadata: { promptVersionId: saved.id, version: saved.version, variables } });
        return saved;
      })();
    },
  };
}
