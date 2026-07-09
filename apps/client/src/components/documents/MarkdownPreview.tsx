import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

type Props = {
  markdown: string;
  className?: string;
  emptyPlaceholder?: string;
};

export function MarkdownPreview({
  markdown,
  className = '',
  emptyPlaceholder = '—',
}: Props) {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return <p className={`text-slate-400 ${className}`}>{emptyPlaceholder}</p>;
  }
  return (
    <div
      className={[
        'prose prose-sm max-w-none prose-slate prose-headings:font-semibold prose-p:my-1 prose-ul:my-1 prose-ol:my-1',
        className,
      ].join(' ')}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeKatex]}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
