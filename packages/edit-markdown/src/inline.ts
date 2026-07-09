export type InlineSegment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
};

export function stripInlineMarkdown(text: string): string {
  let out = text;
  out = out.replace(/\$\$([^$]+)\$\$/g, '$1');
  out = out.replace(/\$([^$]+)\$/g, '$1');
  out = out.replace(/`([^`]+)`/g, '$1');
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/__([^_]+)__/g, '$1');
  out = out.replace(/\*([^*]+)\*/g, '$1');
  out = out.replace(/_([^_]+)_/g, '$1');
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  return out;
}

export function hasInlineMarkdownFormatting(text: string): boolean {
  return /(\*\*|__|(?<!\*)\*(?!\*)|(?<!_)_(?!_)|`|\$\$?)/.test(text);
}

export function parseInlineMarkdown(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let i = 0;

  function push(textValue: string, style: Partial<InlineSegment> = {}) {
    if (!textValue) return;
    const last = segments[segments.length - 1];
    if (
      last &&
      Boolean(last.bold) === Boolean(style.bold) &&
      Boolean(last.italic) === Boolean(style.italic) &&
      Boolean(last.code) === Boolean(style.code)
    ) {
      last.text += textValue;
      return;
    }
    segments.push({ text: textValue, ...style });
  }

  while (i < text.length) {
    const rest = text.slice(i);
    const code = rest.match(/^`([^`]+)`/);
    if (code) {
      push(code[1]!, { code: true });
      i += code[0].length;
      continue;
    }
    const bold = rest.match(/^(\*\*|__)([^*_]+)\1/);
    if (bold) {
      push(bold[2]!, { bold: true });
      i += bold[0].length;
      continue;
    }
    const italic = rest.match(/^(\*|_)([^*_]+)\1/);
    if (italic) {
      push(italic[2]!, { italic: true });
      i += italic[0].length;
      continue;
    }
    const mathBlock = rest.match(/^\$\$([^$]+)\$\$/);
    if (mathBlock) {
      push(mathBlock[1]!);
      i += mathBlock[0].length;
      continue;
    }
    const math = rest.match(/^\$([^$]+)\$/);
    if (math) {
      push(math[1]!);
      i += math[0].length;
      continue;
    }
    const link = rest.match(/^\[([^\]]+)\]\([^)]+\)/);
    if (link) {
      push(link[1]!);
      i += link[0].length;
      continue;
    }
    const nextSpecial = rest.search(/(`|\*\*|__|\*|_|\$|\[)/);
    if (nextSpecial <= 0) {
      push(rest);
      break;
    }
    push(rest.slice(0, nextSpecial));
    i += nextSpecial;
  }

  return segments.length > 0 ? segments : [{ text: '' }];
}
