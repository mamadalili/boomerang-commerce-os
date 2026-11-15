const terminal = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'SKIPPED']);
const attention = new Set(['RUNNING', 'WAITING', 'BLOCKED', 'FAILED', 'READY']);

export function createStudioQueries({ stores }) {
  const run = job => {
    const product = stores.products.get(job.subject_id);
    const graph = stores.jobs.graph(job.id);
    const current = graph.steps.find(step => attention.has(step.status)) ?? graph.steps.at(-1) ?? null;
    const complete = graph.steps.filter(step => terminal.has(step.status)).length;
    return {
      ...job,
      subject: product?.canonical_name ?? job.subject_id,
      productId: product?.id,
      automation: 'ساخت / بهبود محصول',
      automationVersion: '1.0 DEVELOPMENT',
      currentStep: current,
      progress: graph.steps.length ? Math.round((complete / graph.steps.length) * 100) : 0,
      steps: graph.steps,
      dependencies: graph.dependencies,
      sourceDocuments: stores.documents?.listByJob(job.id) ?? [],
    };
  };
  const runs = () => stores.jobs.list().map(run);
  return {
    runs,
    run: id => { const job = stores.jobs.get(id); return job ? run(job) : null; },
    today() {
      const items = runs();
      return {
        counts: {
          running: items.filter(item => item.status === 'RUNNING').length,
          waiting: items.filter(item => item.status === 'WAITING').length,
          blocked: items.filter(item => item.status === 'BLOCKED').length,
          completedToday: items.filter(item => item.status === 'SUCCEEDED' && item.updated_at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
        },
        runs: items.filter(item => item.status !== 'SUCCEEDED'),
      };
    },
    automations: () => [
      { id: 'product-operation', name: 'ساخت / بهبود محصول', description: 'گردآوری منبع، تولید، کنترل کیفیت و آمادگی انتشار محصول', status: 'ACTIVE', version: '1.0 DEVELOPMENT', stepsCount: 22, requiredSources: 2, promptCount: 9, recentRunCount: stores.jobs.list().length },
      { id: 'category-operation', name: 'بهبود دسته‌بندی', status: 'COMING_LATER' },
      { id: 'article-operation', name: 'تولید مقاله', status: 'COMING_LATER' },
    ],
    product(id) {
      const product = stores.products.get(id);
      if (!product) return null;
      return { product, runs: stores.jobs.list().filter(job => job.subject_id === id).map(run), sources: stores.sources.list(), sourceDocuments: stores.documents?.listByProduct(id) ?? [], artifacts: [], qa: stores.qa.list(), history: stores.audit.list(id) };
    },
    prompt(id) {
      const prompt = stores.prompts.get(id);
      return prompt ? { prompt, versions: stores.prompts.versions(id) } : null;
    },
  };
}
