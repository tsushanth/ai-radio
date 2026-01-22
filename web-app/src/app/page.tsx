'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import Link from 'next/link';
import {
  Play,
  Headphones,
  Sparkles,
  Radio,
  Calendar,
  Mail,
  Globe,
  ChevronRight,
  Apple,
  Smartphone,
  Monitor,
  Zap,
  Clock,
  Users,
} from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/episodes');
    }
  }, [user, isLoading, router]);

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-black text-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/80 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center">
                <Radio className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold">Audexa</span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/auth"
                className="px-4 py-2 text-sm font-medium text-white/80 hover:text-white transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/auth"
                className="px-4 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-full text-orange-400 text-sm font-medium mb-8">
            <Sparkles className="w-4 h-4" />
            AI-Powered Audio News
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            Your Personal
            <br />
            <span className="bg-gradient-to-r from-orange-400 via-red-400 to-pink-400 text-transparent bg-clip-text">
              AI Radio Station
            </span>
          </h1>

          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
            Transform your morning routine with personalized audio briefings.
            Get your emails, calendar, news, and weather delivered as a
            podcast-style show with two AI hosts.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link
              href="/auth"
              className="flex items-center gap-2 px-8 py-4 bg-orange-500 hover:bg-orange-600 rounded-xl text-lg font-semibold transition-colors"
            >
              <Play className="w-5 h-5" />
              Try Web App Free
            </Link>
            <div className="flex items-center gap-3">
              <a
                href="#"
                className="flex items-center gap-2 px-6 py-4 bg-white/10 hover:bg-white/20 rounded-xl font-medium transition-colors"
              >
                <Apple className="w-5 h-5" />
                iOS App
              </a>
              <a
                href="#"
                className="flex items-center gap-2 px-6 py-4 bg-white/10 hover:bg-white/20 rounded-xl font-medium transition-colors"
              >
                <Smartphone className="w-5 h-5" />
                Android
              </a>
            </div>
          </div>

          {/* App Preview */}
          <div className="relative max-w-4xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 via-red-500/20 to-pink-500/20 blur-3xl" />
            <div className="relative bg-gray-800/50 backdrop-blur border border-white/10 rounded-3xl p-2 sm:p-4">
              <div className="bg-gray-900 rounded-2xl p-6 sm:p-8">
                {/* Mock UI */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl flex items-center justify-center">
                    <Headphones className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm text-gray-400">Good Morning</p>
                    <h3 className="text-xl font-bold">Your Daily Brief</h3>
                  </div>
                </div>
                <div className="h-2 bg-gray-700 rounded-full mb-4">
                  <div className="h-full w-1/3 bg-gradient-to-r from-orange-500 to-red-500 rounded-full" />
                </div>
                <div className="flex items-center justify-between text-sm text-gray-400">
                  <span>2:34</span>
                  <span>8:45</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4 bg-gray-800/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Everything You Need to Know,
              <br />
              <span className="text-orange-400">In One Audio Brief</span>
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              Connect your accounts and let our AI create a personalized morning
              show just for you.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature Cards */}
            <FeatureCard
              icon={<Mail className="w-6 h-6" />}
              title="Email Summary"
              description="Get the highlights from your inbox without reading every message"
              color="from-blue-500 to-cyan-500"
            />
            <FeatureCard
              icon={<Calendar className="w-6 h-6" />}
              title="Calendar Overview"
              description="Know your schedule for the day with smart meeting summaries"
              color="from-green-500 to-emerald-500"
            />
            <FeatureCard
              icon={<Globe className="w-6 h-6" />}
              title="News Digest"
              description="Stay informed with curated news from topics you care about"
              color="from-purple-500 to-pink-500"
            />
            <FeatureCard
              icon={<Sparkles className="w-6 h-6" />}
              title="Deep Dives"
              description="Research any topic and get a 10-minute AI-generated podcast"
              color="from-orange-500 to-red-500"
            />
            <FeatureCard
              icon={<Radio className="w-6 h-6" />}
              title="Live Stations"
              description="Tune into continuously updating news streams on any topic"
              color="from-red-500 to-pink-500"
            />
            <FeatureCard
              icon={<Users className="w-6 h-6" />}
              title="Two AI Hosts"
              description="Engaging podcast-style format with two distinct AI voices"
              color="from-indigo-500 to-purple-500"
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              How It Works
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              Get started in minutes and transform your morning routine
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <StepCard
              step={1}
              title="Connect Your Accounts"
              description="Link your Google or Microsoft account to access email and calendar"
            />
            <StepCard
              step={2}
              title="Set Your Preferences"
              description="Choose topics, voices, and when you want your daily brief"
            />
            <StepCard
              step={3}
              title="Listen Anywhere"
              description="Your personalized audio brief is ready to play on any device"
            />
          </div>
        </div>
      </section>

      {/* Platform Availability */}
      <section className="py-20 px-4 bg-gray-800/30">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Available Everywhere
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto mb-12">
            Listen on the web, iOS, or Android. Your content syncs across all
            devices.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-6">
            <PlatformCard
              icon={<Monitor className="w-8 h-8" />}
              title="Web App"
              subtitle="Any browser"
              href="/auth"
            />
            <PlatformCard
              icon={<Apple className="w-8 h-8" />}
              title="iOS App"
              subtitle="iPhone & iPad"
              href="#"
            />
            <PlatformCard
              icon={<Smartphone className="w-8 h-8" />}
              title="Android App"
              subtitle="Phone & Tablet"
              href="#"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-r from-orange-500/10 via-red-500/10 to-pink-500/10 border border-orange-500/20 rounded-3xl p-8 sm:p-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Ready to Transform Your Morning?
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto mb-8">
              Join thousands of users who start their day with personalized AI
              audio briefings.
            </p>
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 px-8 py-4 bg-orange-500 hover:bg-orange-600 rounded-xl text-lg font-semibold transition-colors"
            >
              Get Started Free
              <ChevronRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-white/10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
                <Radio className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold">Audexa</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <Link href="/about" className="hover:text-white transition-colors">
                About
              </Link>
              <a href="#" className="hover:text-white transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-white transition-colors">
                Terms
              </a>
              <a href="#" className="hover:text-white transition-colors">
                Contact
              </a>
            </div>
            <p className="text-sm text-gray-500">
              {new Date().getFullYear()} Audexa. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Feature Card Component
function FeatureCard({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <div className="p-6 bg-gray-800/50 border border-white/5 rounded-2xl hover:border-white/10 transition-colors">
      <div
        className={`w-12 h-12 bg-gradient-to-br ${color} rounded-xl flex items-center justify-center mb-4`}
      >
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
  );
}

// Step Card Component
function StepCard({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="relative p-6 bg-gray-800/30 border border-white/5 rounded-2xl">
      <div className="absolute -top-4 left-6 w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-sm font-bold">
        {step}
      </div>
      <h3 className="text-lg font-semibold mb-2 mt-2">{title}</h3>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
  );
}

// Platform Card Component
function PlatformCard({
  icon,
  title,
  subtitle,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-4 px-6 py-4 bg-gray-800/50 border border-white/10 rounded-2xl hover:bg-gray-800 hover:border-white/20 transition-all"
    >
      <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center">
        {icon}
      </div>
      <div className="text-left">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-gray-400">{subtitle}</p>
      </div>
    </a>
  );
}
