export function Field({
  label,
  name,
  type = 'text',
  defaultValue,
  required,
  placeholder,
  className = '',
  step,
  min,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  placeholder?: string;
  className?: string;
  step?: string;
  min?: string | number;
  hint?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>{label}{required ? ' *' : ''}</label>
      <input className="input" id={name} name={name} type={type} defaultValue={defaultValue ?? ''} required={required} placeholder={placeholder} step={step} min={min} />
      {hint ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
    </div>
  );
}

export function TextArea({ label, name, defaultValue, rows = 3, className = '', placeholder }: { label: string; name: string; defaultValue?: string | null; rows?: number; className?: string; placeholder?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>{label}</label>
      <textarea className="input" id={name} name={name} rows={rows} defaultValue={defaultValue ?? ''} placeholder={placeholder} />
    </div>
  );
}

export function Select({
  label,
  name,
  options,
  defaultValue,
  required,
  className = '',
  placeholder,
}: {
  label: string;
  name: string;
  options: { value: string | number; label: string }[];
  defaultValue?: string | number | null;
  required?: boolean;
  className?: string;
  placeholder?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>{label}{required ? ' *' : ''}</label>
      <select className="input" id={name} name={name} defaultValue={defaultValue ?? ''} required={required}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
