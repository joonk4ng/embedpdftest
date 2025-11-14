import React from 'react';
import { CalendarPicker } from '../CalendarPicker';
import type { FederalEquipmentEntry } from '../../utils/engineTimeDB';

interface EquipmentEntryRowProps {
  entry: FederalEquipmentEntry;
  index: number;
  onChange: (index: number, field: keyof FederalEquipmentEntry, value: string) => void;
  onTimeInput: (index: number, field: 'start' | 'stop' | 'start1' | 'stop1' | 'start2' | 'stop2', value: string, type: 'equipment') => void;
  onClear: (index: number) => void;
  onCalendarOpen: (type: 'equipment', index: number) => void;
  calendarOpen: { type: 'equipment' | 'personnel'; index: number } | null;
  onCalendarClose: () => void;
  onDateSelect: (date: string) => void;
  validationErrors: Record<string, string>;
}

export const EquipmentEntryRow: React.FC<EquipmentEntryRowProps> = ({
  entry,
  index,
  onChange,
  onTimeInput,
  onClear,
  onCalendarOpen,
  calendarOpen,
  onCalendarClose,
  onDateSelect,
  validationErrors
}) => {
  const rowColors = ['#e3f2fd'];

  return (
    <div style={{
      border: '1px solid #e9ecef',
      borderRadius: '8px',
      padding: '12px',
      backgroundColor: '#ffffff',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      position: 'relative'
    }}>
      {/* Date Badge Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '12px',
        padding: '8px 12px',
        backgroundColor: rowColors[index],
        borderRadius: '6px',
        border: '2px solid #e9ecef'
      }}>
        <div style={{
          backgroundColor: '#2c3e50',
          color: '#ffffff',
          borderRadius: '50%',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          fontWeight: '600'
        }}>
          {index + 1}
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1
        }}>
          <label style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#2c3e50',
            marginBottom: '4px'
          }}>
            Equipment Entry
          </label>
          <div style={{
            position: 'relative'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              backgroundColor: '#fff',
              cursor: 'pointer'
            }} onClick={() => onCalendarOpen('equipment', index)}>
              <span style={{ fontSize: '14px', color: '#333' }}>
                {entry.date || 'MM/DD/YY'}
              </span>
              <span style={{ 
                fontSize: '16px', 
                color: '#6c757d',
                marginLeft: 'auto'
              }}>
                📅
              </span>
            </div>
            {calendarOpen?.type === 'equipment' && calendarOpen?.index === index && (
              <CalendarPicker
                isOpen={true}
                onClose={onCalendarClose}
                onSelectDate={onDateSelect}
                currentDate={entry.date}
              />
            )}
          </div>
        </div>
        
        {/* Clear Button */}
        <button
          onClick={() => onClear(index)}
          style={{
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'background-color 0.2s ease',
            minWidth: '60px'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#c82333'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#dc3545'}
          title="Clear this equipment entry"
        >
          Clear
        </button>
      </div>
      
      {/* Time Fields */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr 1fr',
        gap: '8px',
        marginBottom: '12px'
      }}>
        <div>
          <label style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#2c3e50',
            marginBottom: '4px',
            display: 'block'
          }}>
            Start Time 1
          </label>
          <input
            type="text"
            value={entry.start1}
            onChange={e => onTimeInput(index, 'start1', e.target.value, 'equipment')}
            style={{
              width: '100%',
              padding: '8px',
              border: `1px solid ${validationErrors[`equipment-${index}-start1`] ? '#dc3545' : '#ddd'}`,
              borderRadius: '6px',
              fontSize: '16px',
              backgroundColor: '#fff',
              color: '#333'
            }}
            placeholder="0700"
          />
          {validationErrors[`equipment-${index}-start1`] && (
            <div style={{
              fontSize: '12px',
              color: '#dc3545',
              marginTop: '4px'
            }}>
              {validationErrors[`equipment-${index}-start1`]}
            </div>
          )}
        </div>
        
        <div>
          <label style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#2c3e50',
            marginBottom: '4px',
            display: 'block'
          }}>
            Stop Time 1
          </label>
          <input
            type="text"
            value={entry.stop1}
            onChange={e => onTimeInput(index, 'stop1', e.target.value, 'equipment')}
            style={{
              width: '100%',
              padding: '8px',
              border: `1px solid ${validationErrors[`equipment-${index}-stop1`] ? '#dc3545' : '#ddd'}`,
              borderRadius: '6px',
              fontSize: '16px',
              backgroundColor: '#fff',
              color: '#333'
            }}
            placeholder="1200"
          />
          {validationErrors[`equipment-${index}-stop1`] && (
            <div style={{
              fontSize: '12px',
              color: '#dc3545',
              marginTop: '4px'
            }}>
              {validationErrors[`equipment-${index}-stop1`]}
            </div>
          )}
        </div>
        <div>
          <label style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#2c3e50',
            marginBottom: '4px',
            display: 'block'
          }}>
            Start Time 2
          </label>
          <input
            type="text"
            value={entry.start2}
            onChange={e => onTimeInput(index, 'start2', e.target.value, 'equipment')}
            style={{
              width: '100%',
              padding: '8px',
              border: `1px solid ${validationErrors[`equipment-${index}-start2`] ? '#dc3545' : '#ddd'}`,
              borderRadius: '6px',
              fontSize: '16px',
              backgroundColor: '#fff',
              color: '#333'
            }}
            placeholder="1230"
          />
          {validationErrors[`equipment-${index}-start2`] && (
            <div style={{
              fontSize: '12px',
              color: '#dc3545',
              marginTop: '4px'
            }}>
              {validationErrors[`equipment-${index}-start2`]}
            </div>
          )}
        </div>
        
        <div>
          <label style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#2c3e50',
            marginBottom: '4px',
            display: 'block'
          }}>
            Stop Time 2
          </label>
          <input
            type="text"
            value={entry.stop2}
            onChange={e => onTimeInput(index, 'stop2', e.target.value, 'equipment')}
            style={{
              width: '100%',
              padding: '8px',
              border: `1px solid ${validationErrors[`equipment-${index}-stop2`] ? '#dc3545' : '#ddd'}`,
              borderRadius: '6px',
              fontSize: '16px',
              backgroundColor: '#fff',
              color: '#333'
            }}
            placeholder="1900"
          />
          {validationErrors[`equipment-${index}-stop2`] && (
            <div style={{
              fontSize: '12px',
              color: '#dc3545',
              marginTop: '4px'
            }}>
              {validationErrors[`equipment-${index}-stop2`]}
            </div>
          )}
        </div>
      </div>
      
      {/* Total, Quantity, Type */}
      <div style={{
        display: 'none',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '8px',
        marginBottom: '12px'
      }}>
        <div>
          <label style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#2c3e50',
            marginBottom: '8px',
            display: 'block'
          }}>
            Total
          </label>
          <input
            type="text"
            value={entry.total}
            onChange={e => onChange(index, 'total', e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              backgroundColor: '#fff',
              color: '#333'
            }}
            placeholder="Total"
          />
        </div>
        
        <div>
          <label style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#2c3e50',
            marginBottom: '8px',
            display: 'block'
          }}>
            Quantity
          </label>
          <input
            type="text"
            value={entry.quantity}
            onChange={e => onChange(index, 'quantity', e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '16px',
              backgroundColor: '#fff',
              color: '#333'
            }}
            placeholder="Qty"
          />
        </div>
        
        <div>
          <label style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#2c3e50',
            marginBottom: '8px',
            display: 'block'
          }}>
            Type
          </label>
          <input
            type="text"
            value={entry.type}
            onChange={e => onChange(index, 'type', e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '16px',
              backgroundColor: '#fff',
              color: '#333'
            }}
            placeholder="Type"
          />
        </div>
      </div>
      
      {/* Remarks */}
      <div>
        <div style={{
          display: 'none',
          gridTemplateColumns: '1fr 1fr 1fr 1fr',
          gap: '8px',
          marginBottom: '12px'
        }}>
          <label style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#2c3e50',
            marginBottom: '8px',
            display: 'block'
          }}>
            Remarks
          </label>
          <input
            type="text"
            value={entry.remarks}
            onChange={e => onChange(index, 'remarks', e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '16px',
              backgroundColor: '#fff',
              color: '#333'
            }}
            placeholder="Remarks"
          />
        </div>
      </div>
    </div>
  );
};

