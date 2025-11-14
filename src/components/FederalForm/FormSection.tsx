import React from 'react';

interface FormSectionProps {
  title?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const FormSection: React.FC<FormSectionProps> = ({
  title,
  children,
  style
}) => {
  const baseStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '24px',
    ...style
  };

  const titleStyle: React.CSSProperties = {
    margin: '0 0 16px 0',
    fontSize: '16px',
    fontWeight: '600',
    color: '#2c3e50',
    borderBottom: '2px solid #e9ecef',
    paddingBottom: '8px'
  };

  return (
    <div style={baseStyle}>
      {title && <h3 style={titleStyle}>{title}</h3>}
      {children}
    </div>
  );
};

interface FormRowProps {
  children: React.ReactNode;
  columns?: number;
  gap?: string;
}

export const FormRow: React.FC<FormRowProps> = ({
  children,
  columns = 2,
  gap = '16px'
}) => {
  const rowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: columns === 2 ? '50% 50%' : `repeat(${columns}, 1fr)`,
    gap
  };

  return <div style={rowStyle}>{children}</div>;
};

