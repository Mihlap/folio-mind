const IORedis = require('ioredis');
const { Queue } = require('bullmq');

async function main() {
  const conn = new IORedis('redis://127.0.0.1:6379', { maxRetriesPerRequest: null });
  const queue = new Queue('optimize', { connection: conn });

  const completed = await queue.getJobs(['completed']);
  console.log('Completed jobs:', completed.length);
  for (const j of completed) {
    const state = await j.getState();
    console.log('  ', j.id.substring(0, 30) + '...', j.name, 'state=' + state);
  }

  const failed = await queue.getJobs(['failed']);
  console.log('Failed jobs:', failed.length);
  for (const j of failed) {
    const state = await j.getState();
    console.log('  ', j.id.substring(0, 30) + '...', j.name, 'state=' + state);
  }

  await conn.quit();
}

main().catch(console.error);
