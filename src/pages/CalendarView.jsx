import { useState, useEffect, useCallback } from 'react';
import { Calendar, Card, DatePicker, Button } from 'antd';
import { LeftOutlined, RightOutlined, PlusOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { api } from '../utils/api';
import AddTodoModal from '../components/AddTodoModal';

// 设置中文本地化
dayjs.locale('zh-cn');

function CalendarView() {
  const navigate = useNavigate();
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(dayjs());

  // 添加待办弹窗相关状态
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [selectedDateForAdd, setSelectedDateForAdd] = useState(dayjs());

  const fetchMonthTodos = useCallback(async (date) => {
    try {
      setLoading(true);
      const from = date.startOf('month').format('YYYY-MM-DD');
      const to = date.endOf('month').format('YYYY-MM-DD');
      const data = await api.get(`/todos?from=${from}&to=${to}`);
      setTodos(data || []);
    } catch (error) {
      console.error('获取月度待办事项失败', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始加载当前月份数据
  useEffect(() => {
    fetchMonthTodos(currentMonth);
  }, [currentMonth, fetchMonthTodos]);

  // 月份/年变化处理（只更新数据和模式，不跳转）
  const handlePanelChange = date => {
    // console.log('面板变化:', date.format('YYYY-MM'));
    setCurrentMonth(date);
  };

  // 获取指定日期的待办事项
  const getTodosForDate = date => {
    const dateStr = date.format('YYYY-MM-DD');
    const dayTodos = todos.filter(todo => {
      // 使用 createdAt 字段
      const todoDate = dayjs(todo.createdAt).format('YYYY-MM-DD');
      return todoDate === dateStr;
    });

    return dayTodos;
  };

  // 判断指定日期是否在当前月范围内，且不是过去的日期
  const isDateInCurrentMonth = date => {
    return (
      date.month() === currentMonth.month() &&
      date.year() === currentMonth.year() &&
      date.isAfter(dayjs().startOf('day'))
    );
  };

  // 打开添加待办弹窗
  const handleOpenAddModal = date => {
    setSelectedDateForAdd(date);
    setIsAddModalVisible(true);
  };

  // 添加成功回调
  const handleAddSuccess = async () => {
    // 重新获取当月数据
    await fetchMonthTodos(currentMonth);
  };

  // 日期单元格渲染
  const dateCellRender = current => {
    const dayTodos = getTodosForDate(current);
    const today = dayjs().format('YYYY-MM-DD');
    const currentDateStr = current.format('YYYY-MM-DD');

    const incompleteTodos = dayTodos.filter(todo => !todo.completed); // 当天是否有未完成任务

    const isOverdue = currentDateStr < today && incompleteTodos.length > 0; // 任务是否超期（未完成且日期已过）

    return (
      <div
        className="space-y-1 overflow-hidden h-full relative"
        onClick={() => handleDateSelect(current)}
      >
        {/* 显示具体任务内容 */}
        {dayTodos.slice(0, 3).map(todo => (
          <div
            key={todo.taskId}
            className={`text-xs px-1 py-0.5 rounded truncate ${
              todo.completed
                ? 'bg-green-100 text-green-800'
                : isOverdue
                  ? 'bg-red-100 text-red-800'
                  : 'bg-blue-100 text-blue-800'
            }`}
            title={todo.content}
          >
            {todo.content}
          </div>
        ))}

        {/* 如果任务超过3个，显示省略号 */}
        {dayTodos.length > 3 && (
          <div className="text-xs text-gray-500 text-right">
            +{dayTodos.length - 3} 更多...
          </div>
        )}

        {/* 新增+号 */}
        {dayTodos.length === 0 && isDateInCurrentMonth(current) && (
          <div className="h-full">
            <div
              className="h-full w-full flex items-center justify-center cursor-pointer  rounded transition-colors group"
              onClick={e => {
                e.stopPropagation();
                handleOpenAddModal(current);
              }}
              title="添加待办"
            >
              <PlusOutlined
                className="text-base-content/30 group-hover:text-base-content/60 transition-colors"
                style={{
                  fontSize: '22px',
                  opacity: 0.4,
                  position: 'relative',
                  top: '-6px',
                }}
              />
            </div>
          </div>
        )}

        {/* 最下面的小加号 */}
        {
          dayTodos.length > 0&& isDateInCurrentMonth(current) &&(
            <div className='absolute bottom-0 left-0 hover:bg-base-300 rounded'>
              <PlusOutlined
                className="text-base-content/30 hover:text-base-content/60 transition-colors cursor-pointer"
                style={{
                  fontSize: '15px',
                  opacity: 0.4,
                }}
                onClick={e => {
                  e.stopPropagation();
                  handleOpenAddModal(current);
                }}
                title="添加待办"
              />
            </div>
          )
        }
      </div>
    );
  };

  // 点击日期处理，只在天视图下跳转
  const handleDateSelect = date => {
    // 判断点击的日期是否在当前月范围内
    if (
      date.month() !== currentMonth.month() ||
      date.year() !== currentMonth.year()
    ) {
      return; // 不处理非当前月的日期点击
    }
    const dateStr = date.format('YYYY-MM-DD');
    navigate(`/todos?date=${dateStr}`);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-base-200 py-6">
      <div className="container mx-auto p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <Card
            loading={loading}
            className="shadow-lg"
            styles={{ body: { padding: '0px 24px' } }}
          >
            <Calendar
              cellRender={dateCellRender}
              onPanelChange={handlePanelChange}
              value={currentMonth}
              mode="month"
              validRange={[
                dayjs().subtract(10, 'year'),
                dayjs().add(10, 'year'),
              ]}
              className="custom-calendar"
              headerRender={({ value, onChange }) => {
                // 自定义头部，使用 DatePicker 组件
                // 计算当月任务统计
                const today = dayjs().format('YYYY-MM-DD');
                const completedCount = todos.filter(
                  todo => todo.completed
                ).length;
                const incompleteTodos = todos.filter(todo => !todo.completed);
                const overdueCount = incompleteTodos.filter(todo => {
                  const todoDate = dayjs(todo.createdAt).format('YYYY-MM-DD');
                  return todoDate < today;
                }).length;
                const pendingCount = incompleteTodos.length - overdueCount;

                return (
                  <div className="flex justify-between items-center p-4">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.2 }}
                      className="grid  md:grid-cols-3 gap-2"
                    >
                      <div className="flex items-center space-x-2 p-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-[2px]"></div>
                        <span className="text-sm">
                          待办{pendingCount > 0 && ` (${pendingCount})`}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 p-2">
                        <div className="w-2 h-2 bg-green-500 rounded-[2px]"></div>
                        <span className="text-sm">
                          已完成{completedCount > 0 && ` (${completedCount})`}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 p-2">
                        <div className="w-2 h-2 bg-red-500 rounded-[2px]"></div>
                        <span className="text-sm">
                          超期未完成{overdueCount > 0 && ` (${overdueCount})`}
                        </span>
                      </div>
                    </motion.div>
                    <div className="flex items-center gap-2">
                      <Button
                        icon={<LeftOutlined />}
                        onClick={() => {
                          const prevMonth = value.subtract(1, 'month');
                          onChange(prevMonth);
                        }}
                      />
                      <DatePicker
                        picker="month"
                        value={value}
                        onChange={newValue => {
                          if (newValue) {
                            onChange(newValue);
                          }
                        }}
                        allowClear={false}
                        format="YYYY年MM月"
                        placeholder="选择月份"
                      />
                      <Button
                        icon={<RightOutlined />}
                        onClick={() => {
                          const nextMonth = value.add(1, 'month');
                          onChange(nextMonth);
                        }}
                      />
                    </div>
                  </div>
                );
              }}
            />
          </Card>
        </motion.div>

        {/* 添加待办弹窗 */}
        <AddTodoModal
          visible={isAddModalVisible}
          onClose={() => setIsAddModalVisible(false)}
          onSuccess={handleAddSuccess}
          defaultDate={selectedDateForAdd}
        />
      </div>
    </div>
  );
}

export default CalendarView;
