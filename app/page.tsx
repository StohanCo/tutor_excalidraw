'use client'
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Generate a random ID (or create one in supabase first)
    // For now, client-side generation is fine for testing
    const newId = crypto.randomUUID();
    router.push(`/board/${newId}`);
  }, [router]);

  return <div className="flex items-center justify-center h-screen">Creating new board...</div>;
}