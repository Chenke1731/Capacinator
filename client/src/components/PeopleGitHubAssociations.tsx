/**
 * PeopleGitHubAssociations Component
 * Feature: 005-github-auth-user-link
 * Tasks: T034, T039, T040
 *
 * Admin UI for managing GitHub account associations with people resources.
 * Allows linking/unlinking people to GitHub accounts.
 */

import React, { useState } from 'react';
import {
  useGitHubConnections,
  useGitHubAssociations,
  useCreateGitHubAssociation,
  useDeleteGitHubAssociation,
} from '../hooks/useGitHubConnections';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Github, Trash2, Link as LinkIcon, Loader2, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

interface Person {
  id: number;
  name: string;
  email: string;
}

export function PeopleGitHubAssociations() {
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | undefined>();
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [unlinkAssociation, setUnlinkAssociation] = useState<{
    connectionId: number;
    personId: number;
    personName: string;
  } | null>(null);

  // Fetch GitHub connections
  const { data: connections, isLoading: connectionsLoading } = useGitHubConnections({
    includeInactive: false,
    includeAssociations: true,
  });

  // Fetch associations for selected connection
  const { data: associations, isLoading: associationsLoading } = useGitHubAssociations(
    selectedConnectionId,
    { includeInactive: false }
  );

  // Fetch people list for linking
  const { data: people } = useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      const response = await api.people.list({ limit: 500 });
      return response.data.data as Person[];
    },
  });

  // Mutations
  const { mutate: createAssociation, isPending: isCreating } = useCreateGitHubAssociation();
  const { mutate: deleteAssociation, isPending: isDeleting } = useDeleteGitHubAssociation();

  const handleLink = () => {
    if (!selectedConnectionId || !selectedPersonId) return;

    createAssociation(
      {
        connectionId: selectedConnectionId,
        personId: parseInt(selectedPersonId, 10),
      },
      {
        onSuccess: () => {
          setSelectedPersonId('');
        },
      }
    );
  };

  const handleUnlink = (connectionId: number, personId: number, personName: string) => {
    setUnlinkAssociation({ connectionId, personId, personName });
  };

  const confirmUnlink = () => {
    if (!unlinkAssociation) return;

    deleteAssociation(
      {
        connectionId: unlinkAssociation.connectionId,
        personId: unlinkAssociation.personId,
      },
      {
        onSuccess: () => {
          setUnlinkAssociation(null);
        },
      }
    );
  };

  if (connectionsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>GitHub Account Associations</CardTitle>
          <CardDescription>
            Manage associations between GitHub accounts and people resources
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!connections || connections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>GitHub Account Associations</CardTitle>
          <CardDescription>
            Manage associations between GitHub accounts and people resources
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Github className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">
              No GitHub connections found. Connect a GitHub account first to manage associations.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const selectedConnection = connections.find((c) => c.id === selectedConnectionId);
  const availablePeople = people?.filter(
    (person) => !associations?.some((a) => a.person_id === person.id)
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>GitHub Account Associations</CardTitle>
          <CardDescription>
            Manage associations between GitHub accounts and people resources (Admin only)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Connection Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Select GitHub Account</label>
            <Select
              value={selectedConnectionId?.toString() || ''}
              onValueChange={(value) => setSelectedConnectionId(parseInt(value, 10))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a GitHub connection..." />
              </SelectTrigger>
              <SelectContent>
                {connections.map((connection) => (
                  <SelectItem key={connection.id} value={connection.id.toString()}>
                    <div className="flex items-center gap-2">
                      <Github className="h-4 w-4" />
                      <span>{connection.github_username}</span>
                      {connection.is_default && (
                        <Badge variant="outline" className="ml-2">
                          Default
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Association Management */}
          {selectedConnectionId && (
            <div className="space-y-4 pt-4 border-t">
              {/* Link New Person */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Link Person to this Account</label>
                <div className="flex gap-2">
                  <Select value={selectedPersonId} onValueChange={setSelectedPersonId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Choose a person..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePeople?.map((person) => (
                        <SelectItem key={person.id} value={person.id.toString()}>
                          <div className="flex flex-col items-start">
                            <span className="font-medium">{person.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {person.email}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleLink}
                    disabled={!selectedPersonId || isCreating}
                    className="gap-2"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Linking...
                      </>
                    ) : (
                      <>
                        <LinkIcon className="h-4 w-4" />
                        Link
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Current Associations */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Current Associations ({associations?.length || 0})
                </label>
                {associationsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : !associations || associations.length === 0 ? (
                  <div className="text-center py-4 text-sm text-muted-foreground border rounded-lg">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No associations yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {associations.map((association) => (
                      <div
                        key={association.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="font-medium">{association.person_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {association.person_email}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              association.association_type === 'automatic'
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {association.association_type}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleUnlink(
                                selectedConnectionId,
                                association.person_id,
                                association.person_name
                              )
                            }
                            disabled={isDeleting}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unlink Confirmation Dialog */}
      <AlertDialog
        open={unlinkAssociation !== null}
        onOpenChange={() => setUnlinkAssociation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink Person from GitHub Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the association between {unlinkAssociation?.personName} and{' '}
              {selectedConnection?.github_username}. Commits from this GitHub account will
              no longer be attributed to this person resource.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmUnlink}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
