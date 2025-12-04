import React, { useState, useEffect, useRef } from 'react';
import './CalendarPicker.css';

export const CalendarPicker: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSelectDate: (date: string) => void;
  currentDate?: string;
}> = ({ isOpen, onClose, onSelectDate, currentDate }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const calendarRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (currentDate) {
      const date = new Date(currentDate);
      if (!isNaN(date.getTime())) {
        setCurrentMonth(date);
      }
    }
  }, [currentDate]);

  // Handle click outside to close calendar
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Add event listeners for both mouse and touch events
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    
    const days = [];
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }
    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const formatDate = (date: Date) => {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    return `${month}/${day}/${year}`;
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date: Date) => {
    if (!currentDate) return false;
    const selectedDate = new Date(currentDate);
    return date.toDateString() === selectedDate.toDateString();
  };

  const handleDateClick = (date: Date) => {
    onSelectDate(formatDate(date));
    onClose();
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const days = getDaysInMonth(currentMonth);

  return (
    <div 
      ref={calendarRef}
      className="calendar-picker-dropdown"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px'
      }}>
        <button
          onClick={goToPreviousMonth}
          className="calendar-picker-nav-button"
        >
          ‹
        </button>
        <h3 style={{
          margin: 0,
          fontSize: '14px',
          fontWeight: '600',
          color: '#2c3e50'
        }}>
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </h3>
        <button
          onClick={goToNextMonth}
          className="calendar-picker-nav-button"
        >
          ›
        </button>
      </div>

      {/* Day headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '2px',
        marginBottom: '8px'
      }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
          <div key={day} style={{
            textAlign: 'center',
            fontSize: '11px',
            fontWeight: '600',
            color: '#6c757d',
            padding: '4px 2px'
          }}>
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '2px'
      }}>
        {days.map((date, index) => (
          <div key={index} style={{
            textAlign: 'center',
            padding: '6px 2px',
            fontSize: '12px',
            cursor: date ? 'pointer' : 'default',
            backgroundColor: date && isSelected(date) ? '#007bff' : 
                           date && isToday(date) ? '#e3f2fd' : 'transparent',
            color: date && isSelected(date) ? '#fff' : 
                   date && isToday(date) ? '#007bff' : '#333',
            borderRadius: '4px',
            fontWeight: date && (isSelected(date) || isToday(date)) ? '600' : '400'
          }} onClick={() => date && handleDateClick(date)}>
            {date ? date.getDate() : ''}
          </div>
        ))}
      </div>

      {/* Today button */}
      <div style={{
        marginTop: '12px',
        textAlign: 'center'
      }}>
        <button
          onClick={() => {
            onSelectDate(formatDate(new Date()));
            onClose();
          }}
          className="calendar-picker-today-button"
        >
          Today
        </button>
      </div>
    </div>
  );
};
