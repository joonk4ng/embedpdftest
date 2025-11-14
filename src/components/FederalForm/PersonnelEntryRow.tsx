import React from 'react';
import { CalendarPicker } from '../CalendarPicker';
import type { FederalPersonnelEntry } from '../../utils/engineTimeDB';

interface PersonnelEntryRowProps {
  entry: FederalPersonnelEntry;
  index: number;
  onChange: (index: number, field: keyof FederalPersonnelEntry, value: string) => void;
  onTimeInput: (index: number, field: 'start' | 'stop' | 'start1' | 'stop1' | 'start2' | 'stop2', value: string, type: 'personnel') => void;
  onClear: (index: number) => void;
  onCalendarOpen: (type: 'personnel', index: number) => void;
  calendarOpen: { type: 'equipment' | 'personnel'; index: number } | null;
  onCalendarClose: () => void;
  onDateSelect: (date: string) => void;
  validationErrors: Record<string, string>;
}

export const PersonnelEntryRow: React.FC<PersonnelEntryRowProps> = ({
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
  const rowColors = ['#e3f2fd', '#f3e5f5', '#e8f5e8', '#fff3e0'];
  const isFirstEntry = index === 0;

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
        display: 'none',
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
          </label>
          {isFirstEntry ? (
            // First entry - show date picker
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
              }} onClick={() => onCalendarOpen('personnel', index)}>
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
              {calendarOpen?.type === 'personnel' && calendarOpen?.index === index && (
                <CalendarPicker
                  isOpen={true}
                  onClose={onCalendarClose}
                  onSelectDate={onDateSelect}
                  currentDate={entry.date}
                />
              )}
            </div>
          ) : (
            // Other entries - show read-only date (will be propagated)
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              border: '1px solid #e9ecef',
              borderRadius: '6px',
              backgroundColor: '#f8f9fa',
              cursor: 'default'
            }}>
              <span style={{ 
                fontSize: '14px', 
                color: entry.date ? '#333' : '#6c757d',
                fontStyle: entry.date ? 'normal' : 'italic'
              }}>
                {entry.date || (entry.name && entry.name.trim() !== '' ? 'Auto-filled from first entry' : 'Enter name to auto-fill date')}
              </span>
              <span style={{ 
                fontSize: '16px', 
                color: entry.date ? '#28a745' : '#6c757d',
                marginLeft: 'auto'
              }}>
                {entry.date ? '🔗' : '⏳'}
              </span>
            </div>
          )}
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
          title="Clear this personnel entry"
        >
          Clear
        </button>
      </div>
      
      {/* Name and Job Title */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: '16px',
        marginBottom: '16px'
      }}>
        <div>
          <label style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#2c3e50',
            marginBottom: '8px',
            display: 'block'
          }}>
            Name
          </label>
          <input
            type="text"
            value={entry.name}
            onChange={e => onChange(index, 'name', e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '16px',
              backgroundColor: '#fff',
              color: '#333'
            }}
            placeholder="Name"
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
            Job Title
          </label>
          <input
            type="text"
            value={isFirstEntry ? 'ENGB' : entry.remarks}
            onChange={e => onChange(index, 'remarks', e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '16px',
              backgroundColor: isFirstEntry ? '#f8f9fa' : '#fff',
              color: '#333'
            }}
            placeholder="Job Title"
            readOnly={isFirstEntry}
          />
        </div>
      </div>
      
      {/* Time Period 1 */}
      <div style={{
        display: 'none',
        marginBottom: '16px'
      }}>
        <label style={{
          fontSize: '14px',
          fontWeight: '600',
          color: '#2c3e50',
          marginBottom: '8px',
          display: 'block'
        }}>
          Time Period 1
        </label>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px'
        }}>
          <div>
            <label style={{
              fontSize: '12px',
              fontWeight: '500',
              color: '#6c757d',
              marginBottom: '4px',
              display: 'block'
            }}>
              Start Time
            </label>
            <input
              type="text"
              value={entry.start1}
              onChange={e => onTimeInput(index, 'start1', e.target.value, 'personnel')}
              style={{
                width: '100%',
                padding: '8px',
                border: `1px solid ${validationErrors[`personnel-${index}-start1`] ? '#dc3545' : '#ddd'}`,
                borderRadius: '6px',
                fontSize: '16px',
                backgroundColor: '#fff',
                color: '#333'
              }}
              placeholder="HH:MM (24hr)"
            />
            {validationErrors[`personnel-${index}-start1`] && (
              <div style={{
                fontSize: '12px',
                color: '#dc3545',
                marginTop: '4px'
              }}>
                {validationErrors[`personnel-${index}-start1`]}
              </div>
            )}
          </div>
          <div>
            <label style={{
              fontSize: '12px',
              fontWeight: '500',
              color: '#6c757d',
              marginBottom: '4px',
              display: 'block'
            }}>
              Stop Time
            </label>
            <input
              type="text"
              value={entry.stop1}
              onChange={e => onTimeInput(index, 'stop1', e.target.value, 'personnel')}
              style={{
                width: '100%',
                padding: '8px',
                border: `1px solid ${validationErrors[`personnel-${index}-stop1`] ? '#dc3545' : '#ddd'}`,
                borderRadius: '6px',
                fontSize: '16px',
                backgroundColor: '#fff',
                color: '#333'
              }}
              placeholder="HH:MM (24hr)"
            />
            {validationErrors[`personnel-${index}-stop1`] && (
              <div style={{
                fontSize: '12px',
                color: '#dc3545',
                marginTop: '4px'
              }}>
                {validationErrors[`personnel-${index}-stop1`]}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Time Period 2 */}
      <div style={{
        display: 'none',
        marginBottom: '16px'
      }}>
        <label style={{
          fontSize: '14px',
          fontWeight: '600',
          color: '#2c3e50',
          marginBottom: '8px',
          display: 'block'
        }}>
          Time Period 2
        </label>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px'
        }}>
          <div>
            <label style={{
              fontSize: '12px',
              fontWeight: '500',
              color: '#6c757d',
              marginBottom: '4px',
              display: 'block'
            }}>
              Start Time
            </label>
            <input
              type="text"
              value={entry.start2}
              onChange={e => onTimeInput(index, 'start2', e.target.value, 'personnel')}
              style={{
                width: '100%',
                padding: '8px',
                border: `1px solid ${validationErrors[`personnel-${index}-start2`] ? '#dc3545' : '#ddd'}`,
                borderRadius: '6px',
                fontSize: '16px',
                backgroundColor: '#fff',
                color: '#333'
              }}
              placeholder="HH:MM (24hr)"
            />
            {validationErrors[`personnel-${index}-start2`] && (
              <div style={{
                fontSize: '12px',
                color: '#dc3545',
                marginTop: '4px'
              }}>
                {validationErrors[`personnel-${index}-start2`]}
              </div>
            )}
          </div>
          <div>
            <label style={{
              fontSize: '12px',
              fontWeight: '500',
              color: '#6c757d',
              marginBottom: '4px',
              display: 'block'
            }}>
              Stop Time
            </label>
            <input
              type="text"
              value={entry.stop2}
              onChange={e => onTimeInput(index, 'stop2', e.target.value, 'personnel')}
              style={{
                width: '100%',
                padding: '8px',
                border: `1px solid ${validationErrors[`personnel-${index}-stop2`] ? '#dc3545' : '#ddd'}`,
                borderRadius: '6px',
                fontSize: '16px',
                backgroundColor: '#fff',
                color: '#333'
              }}
              placeholder="HH:MM (24hr)"
            />
            {validationErrors[`personnel-${index}-stop2`] && (
              <div style={{
                fontSize: '12px',
                color: '#dc3545',
                marginTop: '4px'
              }}>
                {validationErrors[`personnel-${index}-stop2`]}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Total */}
      <div style={{
        display: 'none',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px'
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
              borderRadius: '6px',
              fontSize: '16px',
              backgroundColor: '#fff',
              color: '#333'
            }}
            placeholder="Total"
          />
        </div>
      </div>
    </div>
  );
};

