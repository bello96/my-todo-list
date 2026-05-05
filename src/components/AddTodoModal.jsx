import { useState, useEffect, useRef } from 'react';
import { Modal, DatePicker, Input, App } from 'antd';
import dayjs from 'dayjs';
import { app } from '../utils/cloudbase';
import auth from '../utils/auth';

const db = app.database();

/**
 * 添加待办事项弹窗组件
 * @param {boolean} visible - 弹窗是否可见
 * @param {function} onClose - 关闭弹窗回调
 * @param {function} onSuccess - 添加成功回调
 * @param {dayjs} defaultDate - 默认日期
 */
function AddTodoModal({ visible, onClose, onSuccess, defaultDate = dayjs() }) {
  const inputRef = useRef(null);
  const { message } = App.useApp();
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [todoContent, setTodoContent] = useState('');
  const [loading, setLoading] = useState(false);

  // 当弹窗打开时,更新默认日期
  useEffect(() => {
    if (visible) {
      setSelectedDate(defaultDate);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [visible, defaultDate]);

  // 添加待办事项
  const handleAdd = async () => {
    if (!todoContent.trim()) {
      message.warning('请输入待办事项内容');
      return;
    }

    setLoading(true);
    try {
      const currentUser = auth.getCurrentUser();
      if (!currentUser) {
        message.error('用户未登录');
        return;
      }

      const newTodoItem = {
        taskId: Math.random().toString(36).slice(2),
        content: todoContent,
        completed: false,
        userId: currentUser._id,
        userName: currentUser.username,
        createdAt: selectedDate.format('YYYY-MM-DD HH:mm:ss'),
      };

      await db.collection('todos').add(newTodoItem);

      message.success('待办事项添加成功！');

      // 清空表单
      setTodoContent('');
      setSelectedDate(dayjs());

      // 调用成功回调
      if (onSuccess) {
        onSuccess(selectedDate);
      }

      // 关闭弹窗
      onClose();
    } catch (error) {
      console.error('添加待办事项失败', error);
      message.error('添加失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 取消添加
  const handleCancel = () => {
    setTodoContent('');
    setSelectedDate(dayjs());
    onClose();
  };

  // 处理键盘事件
  const handleKeyDown = e => {
    if (e.key === 'Enter' && e.ctrlKey && todoContent.trim()) {
      handleAdd();
    }
  };

  return (
    <Modal
      title="添加新的待办事项"
      open={visible}
      onOk={handleAdd}
      onCancel={handleCancel}
      okText="添加"
      cancelText="取消"
      okButtonProps={{ disabled: !todoContent.trim(), loading }}
      destroyOnHidden={true}
    >
      <div className="space-y-4 mt-5">
        <div>
          <label className="block text-sm font-medium mb-2">日期</label>
          <DatePicker
            value={selectedDate}
            onChange={setSelectedDate}
            format="YYYY-MM-DD"
            placeholder="选择日期"
            className="w-full"
            disabledDate={current =>
              current && current < dayjs().startOf('day')
            }
            showToday={true}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">
            待办事项内容
          </label>
          <Input.TextArea
            ref={inputRef}
            className="mb-5"
            value={todoContent}
            onChange={e => setTodoContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="请输入待办事项内容... (Ctrl+Enter 快速添加)"
            rows={3}
            maxLength={200}
            showCount
          />
        </div>
      </div>
    </Modal>
  );
}

export default AddTodoModal;
