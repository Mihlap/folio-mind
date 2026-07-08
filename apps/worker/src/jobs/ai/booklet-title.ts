import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import { createLLMFromWorkerEnv } from '../../lib/ai/llm.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getPrisma } from '../../lib/infra/prisma.js';

type BookletTitlePayload = WorkerJobPayload & {
  jobId?: string;
  documentTitle?: string;
  projectName?: string;
  objectHint?: string;
};

const TITLE_SYSTEM = `Ты помощник архитектурного бюро. Составь черновик текста для титульной страницы буклета на русском языке.
Формат ответа — JSON без markdown:
{"title":"...","subtitle":"...","tagline":"..."}
title — название объекта (коротко), subtitle — тип материала (буклет, презентация), tagline — одна строка слогана или описания (можно пустую строку).`;

export async function processBookletTitleDraftJob(env: WorkerEnv, data: BookletTitlePayload): Promise<void> {
  const jobId = data.jobId;
  if (!jobId) throw new Error('Booklet title job: missing jobId');

  const prisma = getPrisma();
  const dbJob = await prisma.job.findUnique({ where: { id: jobId } });
  if (!dbJob) throw new Error(`Job not found: ${jobId}`);

  const jobPayload = (dbJob.payload ?? {}) as Record<string, unknown>;
  const documentTitle = String(jobPayload.documentTitle ?? data.documentTitle ?? 'Буклет');
  const projectName = jobPayload.projectName ? String(jobPayload.projectName) : data.projectName;
  const objectHint = jobPayload.objectHint ? String(jobPayload.objectHint) : data.objectHint;

  await prisma.job.update({ where: { id: jobId }, data: { status: 'processing' } });

  try {
    const llm = createLLMFromWorkerEnv(env, env.AI_PROVIDER);
    const prompt = [
      `Документ: ${documentTitle}`,
      projectName ? `Проект: ${projectName}` : '',
      objectHint ? `Подсказка: ${objectHint}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await llm.complete({
      system: TITLE_SYSTEM,
      prompt,
      maxTokens: 800,
    });

    let parsed: { title?: string; subtitle?: string; tagline?: string } = {};
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]!) as typeof parsed;
    } catch {
      parsed = { title: documentTitle, subtitle: 'Буклет', tagline: result.text.trim().slice(0, 200) };
    }

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        payload: {
          title: parsed.title ?? documentTitle,
          subtitle: parsed.subtitle ?? 'Буклет',
          tagline: parsed.tagline ?? '',
          message: 'Черновик титульника готов.',
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Booklet title draft failed';
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'failed', payload: { error: message } },
    });
    throw err;
  }
}
