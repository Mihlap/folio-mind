const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const doc = await prisma.document.findUnique({
    where: { id: 'cmqj90l1s000mhv4co7s1fnip' },
    include: { versions: { orderBy: { version: 'desc' }, take: 5 } },
  });
  
  for (const v of doc.versions) {
    console.log('Version', v.version + ':', 'status=' + v.status, 'sourceDocxKey=' + (v.sourceDocxKey ? 'SET' : 'null'));
  }
  
  const jobs = await prisma.job.findMany({
    where: { type: 'pre-convert-pdf' },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  
  for (const j of jobs) {
    console.log('Job:', j.id, 'status=' + j.status);
  }
  
  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
