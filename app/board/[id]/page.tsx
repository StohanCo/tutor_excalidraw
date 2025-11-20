import dynamic from 'next/dynamic';

// Lazy load the whiteboard
const Whiteboard = dynamic(() => import('@/app/components/Whiteboard'), {
  ssr: false,
  loading: () => <p>Loading...</p>,
});

export default function BoardPage({ params }: { params: { id: string } }) {
  return <Whiteboard boardId={params.id} />;
}