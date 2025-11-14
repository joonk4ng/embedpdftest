import React from 'react';

interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'select';
  options?: Array<{ value: string; label: string }>;
  hidden?: boolean;
  error?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  options = [],
  hidden = false,
  error
}) => {
  const baseStyle: React.CSSProperties = {
    display: hidden ? 'none' : 'flex',
    flexDirection: 'column',
    gap: '8px'
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: '600',
    color: '#2c3e50'
  };

  const inputStyle: React.CSSProperties = {
    padding: '12px',
    border: `1px solid ${error ? '#dc3545' : '#ddd'}`,
    borderRadius: '6px',
    fontSize: '16px',
    backgroundColor: '#fff',
    color: '#333'
  };

  return (
    <div style={baseStyle}>
      <label style={labelStyle}>
        {label}
      </label>
      {type === 'select' ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
          placeholder={placeholder}
        />
      )}
      {error && (
        <div style={{
          fontSize: '12px',
          color: '#dc3545',
          marginTop: '4px'
        }}>
          {error}
        </div>
      )}
    </div>
  );
};

