import type { ExtractionTemplate, ExtractionTemplateId } from '../extraction-schema.js';
import { EXTRACTION_TEMPLATE_IDS } from '../extraction-schema.js';
import { actTemplate } from './act.js';
import { contractSectionsTemplate } from './contract-sections.js';
import { contractTemplate } from './contract.js';
import { tzTemplate } from './tz.js';

const TEMPLATES: Record<ExtractionTemplateId, ExtractionTemplate> = {
  contract: contractTemplate,
  contract_sections: contractSectionsTemplate,
  act: actTemplate,
  tz: tzTemplate,
};

export function listExtractionTemplates(): ExtractionTemplate[] {
  return EXTRACTION_TEMPLATE_IDS.map((id) => TEMPLATES[id]);
}

export function getExtractionTemplate(id: ExtractionTemplateId): ExtractionTemplate {
  return TEMPLATES[id];
}
