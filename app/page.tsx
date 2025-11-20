'use client'
import dynamic from 'next/dynamic';

// Dynamically import the Whiteboard component with SSR disabled
const Whiteboard = dynamic(() => import('@/app/components/Whiteboard'), {
  ssr: false,
  loading: () => <p>Loading Whiteboard...</p>,
});

export default function Home() {
  // In a real app, you would fetch a dynamic ID from the URL
  // For now, we use a hardcoded ID for testing. 
  // Create a row in Supabase manually first to get an ID, or create a "New Board" button.
  const testBoardId = "YOUR_SUPABASE_ROW_ID_HERE"; 

  return (
    <main>
      <Whiteboard boardId={testBoardId} />
    </main>
  );
}