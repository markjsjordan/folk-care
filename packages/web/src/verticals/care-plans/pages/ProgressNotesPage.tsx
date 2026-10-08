import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Plus } from 'lucide-react';
import { Button, Card, CardHeader, CardContent, LoadingSpinner, ErrorMessage, StatusBadge } from '@/core/components';
import { useAuth } from '@/core/hooks';
import { formatDate } from '@/core/utils';
import { useCarePlan, useProgressNotes, useCreateProgressNote } from '../hooks';
import { ProgressNoteForm } from '../components';

export const ProgressNotesPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { data: carePlan } = useCarePlan(id);
  const { data: progressNotes, isLoading, error, refetch } = useProgressNotes(id);
  const createProgressNote = useCreateProgressNote();

  const handleSubmit = async (data: Parameters<
    Parameters<typeof ProgressNoteForm>[0]['onSubmit']
  >[0]) => {
    if (!id || !carePlan) return;

    try {
      await createProgressNote.mutateAsync({
        carePlanId: id,
        clientId: carePlan.clientId,
        ...data,
      });
      setIsFormOpen(false);
      refetch();
    } catch {
      // Error is handled by the mutation
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorMessage
        message={(error as Error)?.message || 'Failed to load progress notes'}
        retry={refetch}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to={id ? `/care-plans/${id}` : '/care-plans'}>
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back
          </Button>
        </Link>
      </div>

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Progress Notes</h1>
          {carePlan && (
            <p className="text-gray-600 mt-1">{carePlan.name}</p>
          )}
        </div>
        <Button onClick={() => setIsFormOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
          Add Note
        </Button>
      </div>

      {(!progressNotes || progressNotes.length === 0) ? (
        <Card>
          <CardContent>
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No progress notes yet.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {progressNotes.map((note) => (
            <Card key={note.id}>
              <CardHeader title={note.noteType.replace(/_/g, ' ')} />
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <span>{note.authorName} ({note.authorRole})</span>
                    <span>{formatDate(note.noteDate)}</span>
                    {note.isPrivate && <StatusBadge status="PRIVATE" />}
                  </div>
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{note.content}</p>
                  {note.tags && note.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {note.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 border border-blue-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {carePlan && user && (
        <ProgressNoteForm
          carePlanId={carePlan.id}
          clientId={carePlan.clientId}
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSubmit={handleSubmit}
          isLoading={createProgressNote.isPending}
          authorInfo={{
            id: user.id,
            name: user.name,
            role: user.roles[0] || 'STAFF',
          }}
        />
      )}
    </div>
  );
};
