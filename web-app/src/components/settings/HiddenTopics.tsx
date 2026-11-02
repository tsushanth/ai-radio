'use client';

import { EyeOff, Eye } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import { useTopics } from '@/hooks/useTopics';
import { hiddenTopicRows } from '@/lib/hidden-topics';

/** Settings card: the topics the user hid from the home screen, each with an Unhide button. */
export function HiddenTopics() {
  const { preferences, unhideTopic } = useAuth();
  const { topics, isLoading } = useTopics();
  const rows = hiddenTopicRows(preferences.hiddenTopicIds, topics);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <EyeOff className="w-5 h-5" />
          Hidden Topics
        </CardTitle>
        <CardDescription>Topics you chose to hide. Unhide one to see it again on Home and Discover.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">{isLoading ? 'Loading...' : 'You have not hidden any topics.'}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between py-2">
                <span className="text-sm">{row.name}</span>
                <Button variant="outline" size="sm" onClick={() => unhideTopic(row.id)} aria-label={`Unhide ${row.name}`}>
                  <Eye className="w-4 h-4 mr-2" />
                  Unhide
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
