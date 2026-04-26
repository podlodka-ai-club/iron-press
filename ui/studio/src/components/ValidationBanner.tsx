import type { ValidationError } from "../validate.js";

interface Props {
  errors: ValidationError[];
}

export function ValidationBanner({ errors }: Props) {
  if (errors.length === 0) return null;

  const blocking = errors.filter((e) => e.blocking);
  const warnings = errors.filter((e) => !e.blocking);

  return (
    <div
      style={{
        padding: "8px 16px",
        background: "#161b22",
        borderBottom: "1px solid #21262d",
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        fontSize: 12,
      }}
    >
      {blocking.map((e, i) => (
        <span key={i} style={{ color: "#fc8181" }}>
          ✕ {e.message}
        </span>
      ))}
      {warnings.map((e, i) => (
        <span key={i} style={{ color: "#f6ad55" }}>
          ⚠ {e.message}
        </span>
      ))}
    </div>
  );
}
