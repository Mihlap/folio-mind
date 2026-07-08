import { PDFDocument } from 'pdf-lib';

export type AcroFormField = {
  name: string;
  type: string;
  value: string;
};

export async function extractAcroFormFields(pdfBuffer: Buffer): Promise<AcroFormField[]> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  return fields.map((field) => {
    const name = field.getName();
    const ctor = field.constructor.name;
    let value = '';
    try {
      if (ctor.includes('Text')) {
        value = form.getTextField(name).getText() ?? '';
      } else if (ctor.includes('CheckBox')) {
        value = form.getCheckBox(name).isChecked() ? 'true' : 'false';
      } else if (ctor.includes('Dropdown')) {
        const selected = form.getDropdown(name).getSelected();
        value = Array.isArray(selected) ? selected.join(', ') : (selected ?? '');
      } else if (ctor.includes('OptionList')) {
        value = form.getOptionList(name).getSelected().join(', ');
      } else if (ctor.includes('RadioGroup')) {
        value = form.getRadioGroup(name).getSelected() ?? '';
      }
    } catch {
      value = '';
    }
    return { name, type: ctor.replace('PDF', ''), value };
  });
}

export function formFieldsToCsv(fields: AcroFormField[]): string {
  const header = 'name,type,value';
  const rows = fields.map((f) =>
    [f.name, f.type, f.value]
      .map((cell) => `"${cell.replace(/"/g, '""')}"`)
      .join(','),
  );
  return [header, ...rows].join('\n');
}

export async function fillAcroFormFields(
  pdfBuffer: Buffer,
  values: Record<string, string>,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  for (const [name, value] of Object.entries(values)) {
    try {
      const field = form.getFieldMaybe(name);
      if (!field) continue;
      const ctor = field.constructor.name;
      if (ctor.includes('Text')) {
        form.getTextField(name).setText(value);
      } else if (ctor.includes('CheckBox')) {
        const box = form.getCheckBox(name);
        if (value === 'true' || value === '1' || value.toLowerCase() === 'yes') box.check();
        else box.uncheck();
      } else if (ctor.includes('Dropdown')) {
        form.getDropdown(name).select(value);
      }
    } catch {
      // skip invalid field
    }
  }
  form.updateFieldAppearances();
  return Buffer.from(await pdfDoc.save());
}
