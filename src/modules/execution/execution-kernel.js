import { randomUUID } from 'node:crypto';

const transitions = {
  PENDING: new Set(['READY', 'WAITING', 'BLOCKED', 'CANCELLED', 'SKIPPED']),
  READY: new Set(['RUNNING', 'WAITING', 'BLOCKED', 'CANCELLED', 'SKIPPED']),
  RUNNING: new Set(['SUCCEEDED', 'FAILED', 'WAITING', 'BLOCKED', 'CANCELLED']),
  WAITING: new Set(['READY', 'CANCELLED']),
  BLOCKED: new Set(['READY', 'CANCELLED']),
  FAILED: new Set(['READY', 'CANCELLED']),
  SUCCEEDED: new Set(),
  CANCELLED: new Set(),
  SKIPPED: new Set(),
};

const dependencySuccess = new Set(['SUCCEEDED', 'SKIPPED']);
const dependencyFailure = new Set(['FAILED', 'CANCELLED', 'BLOCKED']);

function requireReason(status, reasonCode, humanMessage) {
  if (['WAITING', 'BLOCKED'].includes(status) && (!reasonCode?.trim() || !humanMessage?.trim())) throw new Error('STEP_REASON_REQUIRED');
}

function deriveJobStatus(steps) {
  if (!steps.length) return 'PENDING';
  if (steps.some(step => step.status === 'FAILED')) return 'FAILED';
  if (steps.some(step => step.status === 'BLOCKED')) return 'BLOCKED';
  if (steps.some(step => step.status === 'WAITING')) return 'WAITING';
  if (steps.some(step => step.status === 'RUNNING')) return 'RUNNING';
  if (steps.some(step => step.status === 'READY')) return 'READY';
  if (steps.some(step => step.status === 'PENDING')) return 'PENDING';
  if (steps.some(step => step.status === 'CANCELLED')) return 'CANCELLED';
  return 'SUCCEEDED';
}

export function createExecutionKernel({ db, stores }) {
  const dependenciesSatisfied = stepId => stores.jobs.dependencies(stepId).every(step => dependencySuccess.has(step.status));

  const reconcile = (jobId, actor = 'system') => {
    const job = stores.jobs.get(jobId);
    if (!job) throw new Error('RUN_NOT_FOUND');
    if (job.status === 'CANCELLED') return { status: 'CANCELLED', steps: stores.jobs.graph(jobId).steps };
    const graph = stores.jobs.graph(jobId);
    for (const step of graph.steps.filter(item => item.status === 'PENDING')) {
      const dependencies = stores.jobs.dependencies(step.id);
      if (dependencies.some(item => dependencyFailure.has(item.status))) {
        stores.jobs.transitionStep({ id: randomUUID(), stepId: step.id, fromStatus: step.status, toStatus: 'BLOCKED', reasonCode: 'UPSTREAM_STEP_FAILED', humanMessage: 'یک مرحله پیش‌نیاز شکست خورده یا متوقف شده است.', actor });
      } else if (dependencies.every(item => dependencySuccess.has(item.status))) {
        stores.jobs.transitionStep({ id: randomUUID(), stepId: step.id, fromStatus: step.status, toStatus: 'READY', actor });
      }
    }
    const steps = stores.jobs.graph(jobId).steps;
    const status = deriveJobStatus(steps);
    stores.jobs.updateStatus(jobId, status);
    return { status, steps };
  };

  return {
    allowedTransitions(status) { return [...(transitions[status] ?? [])]; },
    reconcile(jobId, actor = 'system') { return db.transaction(() => reconcile(jobId, actor))(); },
    cancel(jobId, actor = 'operator') {
      return db.transaction(() => {
        const job = stores.jobs.get(jobId);
        if (!job) throw new Error('RUN_NOT_FOUND');
        if (['CANCELLED', 'SUCCEEDED'].includes(job.status)) throw new Error('RUN_NOT_CANCELLABLE');
        for (const step of stores.jobs.graph(jobId).steps) {
          if (['SUCCEEDED', 'SKIPPED', 'CANCELLED'].includes(step.status)) continue;
          stores.jobs.transitionStep({ id: randomUUID(), stepId: step.id, fromStatus: step.status, toStatus: 'CANCELLED', actor });
        }
        stores.jobs.updateStatus(jobId, 'CANCELLED');
        stores.audit.append({ id: randomUUID(), actor, action: 'JOB_CANCELLED', subjectType: 'JOB', subjectId: jobId, metadata: { productId: job.subject_id } });
        return { jobId, status: 'CANCELLED' };
      })();
    },
    transition({ jobId, stepId, toStatus, reasonCode, humanMessage, evidenceReference, actor = 'operator' }) {
      requireReason(toStatus, reasonCode, humanMessage);
      return db.transaction(() => {
        const step = stores.jobs.getStep(stepId);
        if (!step || step.job_id !== jobId) throw new Error('STEP_NOT_FOUND');
        if (!transitions[step.status]?.has(toStatus)) throw new Error('ILLEGAL_STEP_TRANSITION');
        if (stores.jobs.get(jobId)?.status === 'CANCELLED') throw new Error('JOB_CANCELLED');
        if (toStatus === 'READY' && !dependenciesSatisfied(stepId)) throw new Error('DEPENDENCIES_NOT_SATISFIED');
        stores.jobs.transitionStep({ id: randomUUID(), stepId, fromStatus: step.status, toStatus, reasonCode, humanMessage, evidenceReference, actor });
        stores.audit.append({ id: randomUUID(), actor, action: 'JOB_STEP_TRANSITIONED', subjectType: 'JOB_STEP', subjectId: stepId, evidenceReference, metadata: { jobId, fromStatus: step.status, toStatus, reasonCode: reasonCode ?? null } });
        return reconcile(jobId, actor);
      })();
    },
  };
}
