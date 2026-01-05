'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import { Radio, Headphones, Mail, Calendar } from 'lucide-react';

export default function AuthPage() {
  const router = useRouter();
  const { signIn } = useAuth();

  const handleGetStarted = () => {
    // Sign in as guest - no email required
    signIn('guest@audexa.app', 'Guest');
    router.push('/episodes');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-20 h-20 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl flex items-center justify-center shadow-lg">
            <Radio className="w-10 h-10 text-white" />
          </div>
          <CardTitle className="text-2xl">Audexa</CardTitle>
          <CardDescription>
            Your AI-powered daily audio briefing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Features */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Mail className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="font-medium text-sm">Email Summaries</p>
                <p className="text-xs text-gray-500">Get your important emails read to you</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="font-medium text-sm">Calendar Updates</p>
                <p className="text-xs text-gray-500">Know your schedule for the day</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Headphones className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="font-medium text-sm">AI Podcast Format</p>
                <p className="text-xs text-gray-500">Two-host conversational style</p>
              </div>
            </div>
          </div>

          {/* Get Started Button */}
          <Button
            onClick={handleGetStarted}
            className="w-full h-12 text-base bg-orange-500 hover:bg-orange-600"
          >
            Get Started
          </Button>

          <p className="text-xs text-center text-gray-500">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
