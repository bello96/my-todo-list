import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';
import { zhCN } from 'react-day-picker/locale';
import 'react-day-picker/dist/style.css';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { api } from '../utils/api';

function AddTodoModal({ visible, onClose, onSuccess, defaultDate = dayjs() }) {
  const inputRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [todoContent, setTodoContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (visible) {
      setSelectedDate(defaultDate);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [visible, defaultDate]);

  useEffect(() => {
    if (!datePickerOpen) {
      return;
    }
    const onDocClick = (e) => {
      if (triggerRef.current?.contains(e.target)) {
        return;
      }
      if (popoverRef.current?.contains(e.target)) {
        return;
      }
      setDatePickerOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [datePickerOpen]);

  const toggleDatePicker = () => {
    if (!datePickerOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPickerPos({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
    setDatePickerOpen((v) => !v);
  };

  const handleAdd = async () => {
    if (!todoContent.trim()) {
      toast('请输入待办事项内容', { icon: '⚠️' });
      return;
    }

    setLoading(true);
    try {
      await api.post('/todos', {
        content: todoContent.trim(),
        taskDate: selectedDate.format('YYYY-MM-DD'),
      });

      toast.success('待办事项添加成功！');

      setTodoContent('');
      setSelectedDate(dayjs());

      if (onSuccess) {
        onSuccess(selectedDate);
      }

      onClose();
    } catch (error) {
      console.error('添加待办事项失败', error);
      toast.error(error?.message || '添加失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setTodoContent('');
    setSelectedDate(dayjs());
    setDatePickerOpen(false);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.ctrlKey && todoContent.trim()) {
      handleAdd();
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <>
      <div className="modal modal-open">
        <div className="modal-box">
          <h3 className="font-bold text-lg mb-4">添加新的待办事项</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">日期</label>
              <button
                ref={triggerRef}
                type="button"
                onClick={toggleDatePicker}
                className="input input-bordered w-full text-left"
              >
                {selectedDate.format('YYYY-MM-DD')}
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                待办事项内容
              </label>
              <textarea
                ref={inputRef}
                className="textarea textarea-bordered w-full"
                value={todoContent}
                onChange={(e) => setTodoContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="请输入待办事项内容... (Ctrl+Enter 快速添加)"
                rows={3}
                maxLength={200}
              />
              <div className="text-xs text-right text-base-content/60 mt-1">
                {todoContent.length}/200
              </div>
            </div>
          </div>
          <div className="modal-action">
            <button type="button" className="btn" onClick={handleCancel}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleAdd}
              disabled={!todoContent.trim() || loading}
            >
              {loading && (
                <span className="loading loading-spinner loading-sm"></span>
              )}
              添加
            </button>
          </div>
        </div>
        <div className="modal-backdrop bg-black/50" onClick={handleCancel} />
      </div>

      {datePickerOpen &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: pickerPos.top,
              left: pickerPos.left,
              zIndex: 1000,
            }}
            className="bg-base-100 border border-base-300 rounded-lg shadow-xl p-2"
          >
            <DayPicker
              mode="single"
              locale={zhCN}
              selected={selectedDate.toDate()}
              onSelect={(date) => {
                if (date) {
                  setSelectedDate(dayjs(date));
                  setDatePickerOpen(false);
                }
              }}
              disabled={{ before: dayjs().startOf('day').toDate() }}
              showOutsideDays
            />
          </div>,
          document.body
        )}
    </>
  );
}

export default AddTodoModal;
