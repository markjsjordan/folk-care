import React from 'react';
import toast from 'react-hot-toast';
import { CheckCircle, Clock, AlertTriangle, User, Calendar } from 'lucide-react';
import { Card, StatusBadge, Button } from '@/core/components';
import { formatDate, formatTime } from '@/core/utils';
import { useCompleteTask } from '../hooks';
import type { TaskInstance } from '../types';

export interface TaskCardProps {
  task: TaskInstance;
  showCompleteButton?: boolean;
  onCompleted?: () => void;
  // Signature-required tasks must go through TaskCompletionModal (the only
  // UI that captures a signature). When set, the "Complete Task" button
  // delegates to this instead of completing the task directly.
  onRequireSignature?: (task: TaskInstance) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ 
  task, 
  showCompleteButton = false,
  onCompleted,
  onRequireSignature,
}) => {
  const completeTask = useCompleteTask();

  const handleComplete = async () => {
    if (task.requiredSignature) {
      // This task cannot be completed without a signature, which only
      // TaskCompletionModal can capture. Hand off instead of firing a
      // doomed direct completion request.
      onRequireSignature?.(task);
      return;
    }

    try {
      await completeTask.mutateAsync({ 
        id: task.id, 
        input: { completionNote: 'Task completed via dashboard' } 
      });
      onCompleted?.();
    } catch (error) {
      // useCompleteTask's onError already toasts, but guard here too in
      // case this is ever used without that hook's error handling —
      // silently swallowing completion failures leaves the caregiver with
      // zero feedback when the task doesn't actually complete.
      toast.error(error instanceof Error ? error.message : 'Failed to complete task');
    }
  };

  const isOverdue = new Date(task.scheduledDate) < new Date() && 
    task.status === 'SCHEDULED';



  return (
    <Card padding="md" className="h-full">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900">
            {task.name}
          </h3>
          <p className="text-sm text-gray-600 mt-1">{task.description}</p>
          <p className="text-xs text-gray-500 mt-1">
            {task.category.replace(/_/g, ' ')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={task.status} />
          {isOverdue && (
            <div className="flex items-center gap-1 text-xs text-red-600">
              <AlertTriangle className="h-3 w-3" />
              Overdue
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Calendar className="h-4 w-4" />
          {formatDate(task.scheduledDate)}
          {task.scheduledTime && (
            <span>at {formatTime(task.scheduledTime)}</span>
          )}
        </div>

        {task.assignedCaregiverId && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <User className="h-4 w-4" />
            Assigned to: {task.assignedCaregiverId}
          </div>
        )}

        {task.estimatedDuration && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock className="h-4 w-4" />
            Est. {task.estimatedDuration} minutes
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-gray-500">
          {task.requiredSignature && (
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Signature Required
            </span>
          )}
          {task.requiredNote && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Note Required
            </span>
          )}
        </div>

        {task.instructions && (
          <div className="mt-3 p-3 bg-gray-50 rounded-md">
            <p className="text-sm text-gray-700 font-medium mb-1">Instructions:</p>
            <p className="text-sm text-gray-600">{task.instructions}</p>
          </div>
        )}

        {showCompleteButton && task.status === 'SCHEDULED' && (
          <div className="mt-4">
            <Button
              size="sm"
              leftIcon={<CheckCircle className="h-4 w-4" />}
              onClick={handleComplete}
              isLoading={completeTask.isPending}
              className="w-full"
            >
              Complete Task
            </Button>
          </div>
        )}

        {task.completionNote && (
          <div className="mt-3 p-3 bg-green-50 rounded-md">
            <p className="text-sm text-green-700 font-medium mb-1">Completion Note:</p>
            <p className="text-sm text-green-600">{task.completionNote}</p>
            {task.completedAt && (
              <p className="text-xs text-green-500 mt-1">
                Completed on {formatDate(task.completedAt)}
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};