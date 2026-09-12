import React, { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";

interface JsonViewerProps {
  data: unknown;
  initialExpanded?: boolean;
  className?: string;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({
  data,
  initialExpanded = true,
  className = "",
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`relative font-mono text-xs bg-slate-900 text-slate-200 rounded-lg p-3 overflow-x-auto ${className}`}>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-1 transition-colors"
        title="复制 JSON"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        <span>{copied ? "已复制" : "复制"}</span>
      </button>
      <JsonNode value={data} depth={0} isLast={true} initialExpanded={initialExpanded} />
    </div>
  );
};

interface JsonNodeProps {
  name?: string;
  value: unknown;
  depth: number;
  isLast: boolean;
  initialExpanded: boolean;
}

const JsonNode: React.FC<JsonNodeProps> = ({
  name,
  value,
  depth,
  isLast,
  initialExpanded,
}) => {
  const [expanded, setExpanded] = useState(depth < 2 ? initialExpanded : false);

  const isObject = value !== null && typeof value === "object";
  const isArray = Array.isArray(value);

  if (!isObject) {
    let formattedValue: React.ReactNode = String(value);
    let colorClass = "text-amber-300";

    if (typeof value === "string") {
      formattedValue = `"${value}"`;
      colorClass = "text-emerald-300";
    } else if (typeof value === "number") {
      colorClass = "text-sky-300";
    } else if (typeof value === "boolean") {
      colorClass = "text-purple-300";
    } else if (value === null) {
      formattedValue = "null";
      colorClass = "text-rose-300";
    }

    return (
      <div className="leading-5" style={{ paddingLeft: `${depth * 14}px` }}>
        {name && <span className="text-slate-400">"{name}": </span>}
        <span className={colorClass}>{formattedValue}</span>
        {!isLast && <span className="text-slate-500">,</span>}
      </div>
    );
  }

  const keys = Object.keys(value as Record<string, unknown>);
  const isEmpty = keys.length === 0;
  const openBracket = isArray ? "[" : "{";
  const closeBracket = isArray ? "]" : "}";

  if (isEmpty) {
    return (
      <div className="leading-5" style={{ paddingLeft: `${depth * 14}px` }}>
        {name && <span className="text-slate-400">"{name}": </span>}
        <span className="text-slate-400">
          {openBracket}
          {closeBracket}
        </span>
        {!isLast && <span className="text-slate-500">,</span>}
      </div>
    );
  }

  return (
    <div className="leading-5">
      <div
        className="flex items-center cursor-pointer hover:bg-slate-800/60 rounded px-1 -mx-1"
        style={{ paddingLeft: `${depth * 14}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-slate-500 mr-1">
          {expanded ? <ChevronDown className="w-3.5 h-3.5 inline" /> : <ChevronRight className="w-3.5 h-3.5 inline" />}
        </span>
        {name && <span className="text-slate-400">"{name}": </span>}
        <span className="text-slate-400">{openBracket}</span>
        {!expanded && (
          <span className="text-slate-500 text-[11px] ml-1">
            ... {keys.length} items {closeBracket}
            {!isLast && ","}
          </span>
        )}
      </div>

      {expanded && (
        <>
          <div>
            {keys.map((key, index) => (
              <JsonNode
                key={key}
                name={isArray ? undefined : key}
                value={(value as any)[key]}
                depth={depth + 1}
                isLast={index === keys.length - 1}
                initialExpanded={initialExpanded}
              />
            ))}
          </div>
          <div className="text-slate-400" style={{ paddingLeft: `${depth * 14}px` }}>
            {closeBracket}
            {!isLast && <span className="text-slate-500">,</span>}
          </div>
        </>
      )}
    </div>
  );
};
