"use client";

interface JsonViewerProps {
  data: unknown;
  maxHeight?: string;
}

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = "text-cvh-orange"; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = "text-cvh-accent"; // key
        } else {
          cls = "text-cvh-green"; // string
        }
      } else if (/true|false/.test(match)) {
        cls = "text-cvh-purple"; // boolean
      } else if (/null/.test(match)) {
        cls = "text-cvh-text-muted"; // null
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

export function JsonViewer({ data, maxHeight = "400px" }: JsonViewerProps) {
  const jsonString = JSON.stringify(data, null, 2);
  const highlighted = syntaxHighlight(jsonString);

  return (
    <div
      className="bg-cvh-bg-primary border border-cvh-border-subtle rounded-[6px] p-3 overflow-auto font-mono text-[11px] leading-[1.6]"
      style={{ maxHeight }}
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
}
