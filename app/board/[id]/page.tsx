'use client'

import dynamic from 'next/dynamic';
import { use } from 'react'; // Required for unwraping params in Next.js 15+

// 1. Fix the import path to point to the root components folder
const Whiteboard = dynamic(() => import('@/components/Whiteboard'), {
  ssr: false,
  loading: () => <p>Loading Whiteboard...</p>,
});

// 2. Update the component to handle async params
export default function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  // In Next.js 15+, params is a Promise. We must unwrap it using React.use()
  const resolvedParams = use(params);

  return <Whiteboard boardId={resolvedParams.id} />;
}