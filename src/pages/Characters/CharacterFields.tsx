import React from "react";
import { CharacterFieldDefinition } from "../../types";

export function FieldValue({
  field,
  value,
}: {
  field: CharacterFieldDefinition;
  value: unknown;
}): React.ReactElement {
  if (value === undefined)
    return <span className="text-slate-400">未设置</span>;
  if (field.type === "object" && value && typeof value === "object")
    return (
      <dl className="pl-3 border-l space-y-1">
        {field.fields?.map((f) => (
          <div key={f.id}>
            <dt className="font-medium">{f.label}</dt>
            <dd>
              <FieldValue
                field={f}
                value={(value as Record<string, unknown>)[f.id]}
              />
            </dd>
          </div>
        ))}
      </dl>
    );
  if (field.type === "list" && Array.isArray(value))
    return (
      <ol className="list-decimal pl-5 space-y-1">
        {value.map((v, i) => (
          <li key={i}>
            <FieldValue field={field.item!} value={v} />
          </li>
        ))}
      </ol>
    );
  return (
    <span className="whitespace-pre-wrap break-words">
      {typeof value === "boolean" ? (value ? "是" : "否") : String(value)}
    </span>
  );
}
export function CharacterFields({
  fields,
  values,
}: {
  fields: CharacterFieldDefinition[];
  values: Record<string, unknown>;
}) {
  return (
    <dl className="space-y-2 text-sm">
      {fields.map((field) => (
        <div key={field.id}>
          <dt className="font-medium text-slate-700" title={field.description}>
            {field.label}{" "}
            <span className="text-xs text-slate-400">
              {field.visibility === "private" ? "私密" : "公开"}
            </span>
          </dt>
          <dd className="text-slate-600">
            <FieldValue field={field} value={values[field.id]} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
