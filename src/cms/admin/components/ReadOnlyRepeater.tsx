import { repeaterTable } from "./block-values";
import type { SubFieldMeta } from "./block-fields";

export function ReadOnlyRepeater({
  name,
  value,
  itemFields,
}: {
  name: string;
  value?: string;
  itemFields?: Record<string, SubFieldMeta>;
}) {
  const { columns, rows } = repeaterTable(value, itemFields);
  return (
    <>
      <input type="hidden" name={name} value={value ?? "[]"} />
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No items</p>
      ) : (
        <div className="bg-muted/40 overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                {columns.map((column, index) => (
                  <th
                    key={index}
                    scope="col"
                    className="text-muted-foreground px-3 py-2 text-left font-medium whitespace-nowrap"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="text-muted-foreground px-3 py-2 align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
